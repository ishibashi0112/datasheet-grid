// 本体の行とセル(試作)。React 版の view/GridBodyLayer.tsx(1,141 行)のうち、ふつうの行(データ行)・行番号・
//   セルの選択 / アクティブ / 読み取り専用 / ホバーの見た目・既定の文字表示と renderCell だけ。グループ行・ラベル行・
//   読み込み中の行・auto-height・条件付き書式・検査の印・メモ・チェックボックスは入れていない。
//   Solid は部品を描き直さない(細かく signal で更新する)ので、React 版の memo / 行プリミティブへの畳み込みは要らない。
import { For, Show, createMemo } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { CellCoord, RowModel } from '@ishibashi0112/spreadsheet-grid-core';
import type { PaneColumnEntry } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import type { VerticalRow } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/verticalGeometry';
import type { SelectionSnapshot } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridSelectors';
import { isCellEditable, getCellValue } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
import type { GridColumn, SpreadsheetGridProps } from '../model/gridTypes';
import { px } from '../primitives/style';

export type CellRenderState = {
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  readOnly: boolean;
};

type BodyRowsProps<T> = {
  pane: 'left' | 'center' | 'right';
  ownsRowHeader: boolean;
  leadingWidth: number;
  rowHeight: number;
  rowHeaderWidth: number;
  rows: readonly VerticalRow[];
  entries: readonly PaneColumnEntry<T>[];
  rowModel: RowModel<T>;
  activeCell: CellCoord | null;
  editingCell: CellCoord | null;
  selection: SelectionSnapshot;
  isWholeGridSelected: boolean;
  hoveredRowIndex: number | null;
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  activeCellDomId: string;
  renderCellContent: (row: T, rowIndex: number, column: GridColumn<T>, colIndex: number, state: CellRenderState) => JSX.Element;
  onRowHeaderPointerDown: (rowIndex: number, event: PointerEvent) => void;
  onRowHeaderPointerEnter: (rowIndex: number, event: PointerEvent) => void;
  onCellPointerDown: (cell: CellCoord, event: PointerEvent) => void;
  onCellPointerEnter: (cell: CellCoord, event: PointerEvent) => void;
  onCellDoubleClick: (cell: CellCoord, event: MouseEvent) => void;
};

export function BodyRows<T>(props: BodyRowsProps<T>) {
  return (
    <For each={props.rows} keyed={(row) => row.index}>
      {(virtualRow) => {
        const rowIndex = () => virtualRow().index;
        const row = () => props.rowModel.getRow(rowIndex());
        const rowKey = () => props.rowModel.getRowKey(rowIndex()) ?? rowIndex();
        // 行ごとの選択の帯(行の選択 / セル範囲が行にかかっているか)。プリミティブにして、変わった行だけ更新します。
        const isRowSelected = createMemo(() => {
          const selection = props.selection;
          return selection.kind === 'row' && rowIndex() >= selection.startRow && rowIndex() <= selection.endRow;
        });
        const selectedCols = createMemo(
          () => {
            const selection = props.selection;
            if (selection.kind === 'col') {
              return `${selection.startCol}:${selection.endCol}`;
            }
            if (selection.kind === 'cell' && rowIndex() >= selection.startRow && rowIndex() <= selection.endRow) {
              return `${selection.startCol}:${selection.endCol}`;
            }
            return '';
          },
        );
        const isColSelected = (colIndex: number) => {
          const range = selectedCols();
          if (range === '') {
            return false;
          }
          const [start, end] = range.split(':').map(Number);
          return colIndex >= (start ?? 0) && colIndex <= (end ?? -1);
        };
        const activeCol = createMemo(() => (props.activeCell?.row === rowIndex() ? props.activeCell.col : -1));
        const editingCol = createMemo(() => (props.editingCell?.row === rowIndex() ? props.editingCell.col : -1));
        const isHovered = createMemo(() => props.hoveredRowIndex === rowIndex());
        return (
          <Show when={row()}>
            {(currentRow) => (
              <div
                data-pane={props.pane}
                data-row-index={rowIndex()}
                data-row-key={String(rowKey())}
                role="row"
                aria-rowindex={rowIndex() + 2}
                class="ssg-body-row"
                style={{
                  height: px(virtualRow().size ?? props.rowHeight),
                  transform: `translateY(${virtualRow().start}px)`,
                }}
              >
                <Show when={props.ownsRowHeader}>
                  <div
                    role="rowheader"
                    aria-colindex={1}
                    onPointerDown={(event) => props.onRowHeaderPointerDown(rowIndex(), event)}
                    onPointerEnter={(event) => props.onRowHeaderPointerEnter(rowIndex(), event)}
                    class={[
                      'ssg-header-cell',
                      'ssg-row-header-cell',
                      {
                        'ssg-header-cell--selected': props.isWholeGridSelected || isRowSelected(),
                        'ssg-header-cell--hovered': isHovered(),
                      },
                    ]}
                    style={{
                      width: px(props.rowHeaderWidth),
                      'min-width': px(props.rowHeaderWidth),
                      height: px(virtualRow().size ?? props.rowHeight),
                    }}
                  >
                    {rowIndex() + 1}
                  </div>
                </Show>
                <For each={props.entries} keyed={(entry) => entry.column.key}>
                  {(entry) => {
                    const colIndex = () => entry().logicalIndex;
                    const isActive = () => activeCol() === colIndex();
                    const isEditing = () => editingCol() === colIndex();
                    const isSelected = () => isRowSelected() || isColSelected(colIndex());
                    const readOnlyCell = () =>
                      !isCellEditable(
                        { readOnly: props.readOnly, canEditCell: props.canEditCell },
                        rowIndex(),
                        colIndex(),
                        currentRow(),
                        entry().column,
                        props.canEditCell ? { sourceRowIndex: props.rowModel.getSourceIndex(rowIndex()) ?? rowIndex(), rowKey: rowKey() } : undefined,
                      );
                    const cell = () => ({ row: rowIndex(), col: colIndex() });
                    return (
                      <div
                        role="gridcell"
                        aria-colindex={colIndex() + 2}
                        aria-selected={isSelected() ? 'true' : 'false'}
                        aria-readonly={readOnlyCell() ? 'true' : undefined}
                        id={isActive() ? props.activeCellDomId : undefined}
                        data-ssg-col-key={entry().column.key}
                        class={[
                          'ssg-body-cell',
                          {
                            'ssg-body-cell--align-center': entry().column.align === 'center',
                            'ssg-body-cell--align-right': entry().column.align === 'right',
                            'ssg-body-cell--readonly': readOnlyCell() && !isSelected(),
                            'ssg-body-cell--row-hovered': isHovered(),
                          },
                        ]}
                        onPointerDown={(event) => props.onCellPointerDown(cell(), event)}
                        onPointerEnter={(event) => props.onCellPointerEnter(cell(), event)}
                        onDblClick={(event) => props.onCellDoubleClick(cell(), event)}
                        style={{
                          left: px(props.leadingWidth + entry().paneLocalStart),
                          width: px(entry().paneLocalSize),
                          'min-width': px(entry().paneLocalSize),
                          height: px(virtualRow().size ?? props.rowHeight),
                          'z-index': isActive() ? 3 : 1,
                        }}
                      >
                        {props.renderCellContent(currentRow(), rowIndex(), entry().column, colIndex(), {
                          isActive: isActive(),
                          isSelected: isSelected(),
                          isEditing: isEditing(),
                          readOnly: readOnlyCell(),
                        })}
                      </div>
                    );
                  }}
                </For>
              </div>
            )}
          </Show>
        );
      }}
    </For>
  );
}

export { getCellValue };