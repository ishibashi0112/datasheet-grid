// 本体の行とセル(1 つのペインぶん)。React 版の view/GridBodyLayer.tsx(GridBodyLayer + GridBodyRow)と同じ DOM と class。
//   段階 1(機能なし)の範囲はデータ行だけ。グループ行(grouping)・ラベル行(labelRow)・読み込み中の行(serverSide)・
//   auto-height(autoHeight)・条件付き書式(conditionalFormat)は機能(段階 2)で、シェルが機能の有無を props で渡します。
//   行は rowKey、セルは列の key で対応させます(React 版の key と同じ。並びが変わっても同じ要素が新しい位置へ動くので、
//   animateRows の transition が効く)。
//   Solid は部品を描き直さない(細かく signal で更新する)ので、React 版の memo / 行プリミティブへの畳み込みは要らない。
import { For, Show, createMemo, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type {
  CellCoord,
  CellRenderState,
  CellStyleContext,
  GridRowKey,
  GridVerticalAlign,
  RowModel,
  RowSelectionState,
} from '@ishibashi0112/spreadsheet-grid-core';
import type { PaneColumnEntry } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import type { SelectionSnapshot } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridSelectors';
import { getCellValue, isCellEditable } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
import { resolveIsRowSelected } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/rowSelection';
import { resolveDataRowNumber } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/labelRows';
import { shouldMarkCellOverflowTooltip } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cellOverflowTooltip';
import { getInvalidMessage, hasCellValidation } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/validation';
import { normalizeCellNote, resolveCellTooltipText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cellNote';
import { resolveSlotProps } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/slotProps';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { ConditionalFormatStatsMap } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/conditionalFormat';
import type { FindIndex, FindRange } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/find';
import type { SolidGridFeatures } from '../features/types';
import type { GridColumn, GridResolvedSlots, SolidGridTypes, SpreadsheetGridProps } from '../model/gridTypes';
import { useGridLocaleText } from '../context/localeText';
import { px } from '../primitives/style';
import { RowSelectionCheckbox } from './RowSelectionCheckbox';
import type { GridPaneKind } from './GridHeaderRow';

// 描く行(core の縦のレイアウトの virtualRows のうち描くもの + 対応に使う rowKey)。
// セルの中身へ渡す位置と状態。どれも読んだときに引く(中身は行・列が変わったときだけ作り直す。位置や状態を読んだ式だけが
//   追従する)。rowKey はこのセルの行のキー(行はキーで対応づけるので変わらない)。
export type GridCellContentContext = CellRenderState & {
  readonly rowIndex: number;
  readonly colIndex: number;
  readonly sourceRowIndex: number;
  readonly rowKey: GridRowKey;
  // セル内検索のこのセルのヒット(無ければ undefined)と、この行にカレントのヒットがあればその番号(無ければ null)。
  readonly findRanges: readonly FindRange[] | undefined;
  readonly findCurrentIndex: number | null;
};

const NO_SELECTED_COLUMNS: readonly [number, number] = [-1, -1];

// 細い列の状態チップは余白を詰めてアイコンを外す(React 版の view/GridBodyLayer と同じ幅)。
export const CHIP_COMPACT_MAX_WIDTH = 80;

export type GridBodyRowItem = {
  index: number;
  start: number;
  size: number | undefined;
  key: string;
};

type GridBodyLayerProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  leadingWidth: number;
  rowHeight: number;
  rowHeaderWidth: number;
  rows: readonly GridBodyRowItem[];
  entries: readonly PaneColumnEntry<T>[];
  rowModel: RowModel<T>;
  // auto-height(行の高さの実測)の行か。true かつ column.autoHeight のセルは中身を器に入れて測る(React 版と同じ)。
  autoHeight: boolean;
  // 背の高い行での縦の揃え(列の verticalAlign が優先)。
  verticalAlign: GridVerticalAlign | undefined;
  // 条件付き書式の機能(無ければ conditionalFormat を指定した列も素の表示)と、列ごとの min / max。
  conditionalFormat: SolidGridFeatures['conditionalFormat'];
  conditionalFormatStats: ConditionalFormatStatsMap;
  // セル内検索のヒット(rowIndex → colIndex → 範囲。検索の機能が無い / 閉じているときは空)とカレントのヒットの番号。
  findIndex: FindIndex;
  findCurrentIndex: number | null;
  labelViewIndexes?: ArrayLike<number> | undefined;
  ariaRowOffset: number;
  activeCell: CellCoord | null;
  editingCell: CellCoord | null;
  selection: SelectionSnapshot;
  isWholeGridSelected: boolean;
  hoveredRowIndex: number | null;
  enableRowSelection: boolean;
  rowSelectionState: RowSelectionState;
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  showValidationMarks: boolean;
  showCellOverflowTooltip: boolean;
  getRowClassName: SpreadsheetGridProps<T>['getRowClassName'];
  slots: GridResolvedSlots;
  activeCellDomId: string;
  cellEditorDomId: string;
  renderCellContent: (row: T, column: GridColumn<T>, cell: GridCellContentContext) => JSX.Element;
  onRowHeaderPointerDown: (rowIndex: number, event: PointerEvent) => void;
  onRowHeaderPointerEnter: (rowIndex: number, event: PointerEvent) => void;
  onRowHeaderPointerLeave: (rowIndex: number) => void;
  onCellPointerDown: (cell: CellCoord, event: PointerEvent) => void;
  onCellPointerEnter: (cell: CellCoord, event: PointerEvent) => void;
  onCellClick: (cell: CellCoord, event: MouseEvent) => void;
  onCellDoubleClick: (cell: CellCoord, event: MouseEvent) => void;
};

export function GridBodyLayer<T>(props: GridBodyLayerProps<T>) {
  const texts = useGridLocaleText();
  return (
    <For each={props.rows} keyed={(item) => item.key}>
      {(item) => {
        // 位置は memo で受ける(描く行の配列は作り直されるたびに新しいオブジェクトになるので、値が同じなら先へ伝えない。
        //   素の関数のままだと、ホバーやスクロールのたびに見えているすべてのセルの中身を作り直す)。
        const rowIndex = createMemo(() => item().index);
        const row = () => props.rowModel.getRow(rowIndex());
        return (
          <Show when={row()}>
            {(currentRow) => {
              const rowKey = (): GridRowKey => props.rowModel.getRowKey(rowIndex()) ?? rowIndex();
              const sourceRowIndex = () => props.rowModel.getSourceIndex(rowIndex()) ?? rowIndex();
              // 行の高さは値だけの memo(項目のオブジェクトはスクロールのたびに新しくなる)。
              const rowSize = createMemo(() => item().size ?? props.rowHeight);
              const isRowChecked = createMemo(() =>
                props.enableRowSelection ? resolveIsRowSelected(props.rowSelectionState, rowKey()) : false,
              );
              const isRowSelected = createMemo(
                () =>
                  props.selection.kind === 'row' &&
                  rowIndex() >= props.selection.startRow &&
                  rowIndex() <= props.selection.endRow,
              );
              // この行で選ばれている列の範囲(React 版の selectedColStart / selectedColEnd。無ければ -1)。
              const selectedColRange = createMemo((): readonly [number, number] => {
                const selection = props.selection;
                if (selection.kind === 'col') {
                  return [selection.startCol, selection.endCol];
                }
                if (selection.kind === 'cell' && rowIndex() >= selection.startRow && rowIndex() <= selection.endRow) {
                  return [selection.startCol, selection.endCol];
                }
                return NO_SELECTED_COLUMNS;
              });
              const selectedColStart = () => selectedColRange()[0];
              const selectedColEnd = () => selectedColRange()[1];
              const activeCol = createMemo(() => (props.activeCell?.row === rowIndex() ? props.activeCell.col : -1));
              // セル内検索: この行のヒットと、この行にカレントのヒットがあればその番号(無ければ null)。どちらも行ごとの memo に
              //   して、セルは行の値だけを読みます(ヒットの表やカレントの番号をセルごとに読むと、1 回の検索に数千の購読が付く)。
              const rowFindHits = createMemo(() => props.findIndex.get(rowIndex()));
              const rowFindCurrent = createMemo((): number | null => {
                const hits = rowFindHits();
                const current = hits ? props.findCurrentIndex : null;
                if (!hits || current === null) {
                  return null;
                }
                for (const ranges of hits.values()) {
                  if (ranges.some((range) => range.matchIndex === current)) {
                    return current;
                  }
                }
                return null;
              });
              const editingCol = createMemo(() => (props.editingCell?.row === rowIndex() ? props.editingCell.col : -1));
              const isHovered = createMemo(() => props.hoveredRowIndex === rowIndex());
              const rowSlot = createMemo(() =>
                resolveSlotProps<JSX.CSSProperties>(
                  props.getRowClassName?.(currentRow(), rowIndex(), {
                    row: currentRow(),
                    rowIndex: rowIndex(),
                    sourceRowIndex: sourceRowIndex(),
                    rowKey: rowKey(),
                    isSelected: isRowChecked(),
                  }),
                ),
              );
              const rowNumber = () =>
                props.labelViewIndexes ? resolveDataRowNumber(props.labelViewIndexes, rowIndex()) : rowIndex() + 1;
              return (
                <div
                  data-pane={props.pane}
                  data-row-index={rowIndex()}
                  role="row"
                  aria-rowindex={rowIndex() + 2 + props.ariaRowOffset}
                  aria-selected={props.enableRowSelection ? (isRowChecked() ? 'true' : 'false') : undefined}
                  data-row-key={String(rowKey())}
                  class={[
                    'ssg-body-row',
                    rowSlot().className,
                    props.slots.bodyRow?.className,
                    { 'ssg-body-row--checked': isRowChecked() },
                  ]}
                  style={{
                    ...props.slots.bodyRow?.style,
                    ...rowSlot().style,
                    height: px(rowSize()),
                    transform: `translateY(${item().start}px)`,
                  }}
                >
                  <Show when={props.ownsRowHeader}>
                    <div
                      role="rowheader"
                      aria-colindex={1}
                      onPointerDown={(event) => props.onRowHeaderPointerDown(rowIndex(), event)}
                      onPointerEnter={(event) => props.onRowHeaderPointerEnter(rowIndex(), event)}
                      onPointerLeave={() => props.onRowHeaderPointerLeave(rowIndex())}
                      class={[
                        'ssg-header-cell',
                        'ssg-row-header-cell',
                        rowSlot().className,
                        props.slots.rowHeaderCell?.className,
                        {
                          'ssg-row-header-cell--checkbox': props.enableRowSelection,
                          'ssg-header-cell--selected': props.isWholeGridSelected || isRowSelected(),
                          'ssg-header-cell--hovered': isHovered(),
                        },
                      ]}
                      style={{
                        ...props.slots.rowHeaderCell?.style,
                        ...rowSlot().style,
                        width: px(props.rowHeaderWidth),
                        'min-width': px(props.rowHeaderWidth),
                        height: px(rowSize()),
                      }}
                    >
                      <Show when={props.enableRowSelection} fallback={rowNumber()}>
                        <RowSelectionCheckbox
                          slot={props.slots.checkbox}
                          label={formatLocaleText(texts().selectRow, { row: rowNumber() })}
                          state={isRowChecked() ? 'checked' : 'unchecked'}
                        />
                      </Show>
                    </div>
                  </Show>
                  <For each={props.entries} keyed={(entry) => entry.column.key}>
                    {(entry) => {
                      const unbound = createMemo(() => entry().column);
                      const column = () => unbound() as unknown as GridColumn<T>;
                      const colIndex = createMemo(() => entry().logicalIndex);
                      const size = () => entry().paneLocalSize;
                      const isActive = () => activeCol() === colIndex();
                      const isEditing = () => editingCol() === colIndex();
                      const isSelected = () =>
                        isRowSelected() ||
                        (selectedColStart() >= 0 && colIndex() >= selectedColStart() && colIndex() <= selectedColEnd());
                      const readOnlyCell = createMemo(
                        () =>
                          !isCellEditable(
                            { readOnly: props.readOnly, canEditCell: props.canEditCell },
                            rowIndex(),
                            colIndex(),
                            currentRow(),
                            unbound(),
                            props.canEditCell ? { sourceRowIndex: sourceRowIndex(), rowKey: rowKey() } : undefined,
                          ),
                      );
                      const value = () => getCellValue(currentRow(), unbound());
                      const findRanges = createMemo(() => rowFindHits()?.get(colIndex()));
                      // セルの中身へ渡す位置と操作の状態は、読んだときに引く形にする(中身を作る式が読まないように)。
                      //   クリックの pointerdown でアクティブセルが変わるたびに中身を作り直すと、pointerup が別の要素に落ちて
                      //   click が起きない(チェックボックスのセルや renderCell のボタンが押せない)。並べ替えで行の位置が
                      //   変わるたびに作り直すと、renderCell の中の入力欄のフォーカスが外れる。React は同じ要素を使い回す。
                      const cellRowKey = untrack(rowKey);
                      const cellState: GridCellContentContext = {
                        get rowIndex() {
                          return rowIndex();
                        },
                        get colIndex() {
                          return colIndex();
                        },
                        get sourceRowIndex() {
                          return sourceRowIndex();
                        },
                        rowKey: cellRowKey,
                        get findRanges() {
                          return findRanges();
                        },
                        get findCurrentIndex() {
                          return rowFindCurrent();
                        },
                        get isActive() {
                          return isActive();
                        },
                        get isSelected() {
                          return isSelected();
                        },
                        get isEditing() {
                          return isEditing();
                        },
                        get readOnly() {
                          return readOnlyCell();
                        },
                      };
                      // セルの書式とメモに渡す文脈(どちらも無い列では作らない。React 版と同じ)。
                      const styleContext = createMemo((): CellStyleContext<T, SolidGridTypes> | null =>
                        typeof column().cellClassName === 'function' || column().cellNote
                          ? {
                              row: currentRow(),
                              rowIndex: rowIndex(),
                              sourceRowIndex: sourceRowIndex(),
                              rowKey: rowKey(),
                              colIndex: colIndex(),
                              value: value(),
                              column: column(),
                              isActive: isActive(),
                              isSelected: isSelected(),
                              isEditing: isEditing(),
                              readOnly: readOnlyCell(),
                            }
                          : null,
                      );
                      const conditionalCell = createMemo(() => {
                        const cellClassName = column().cellClassName;
                        const context = styleContext();
                        return resolveSlotProps<JSX.CSSProperties>(
                          typeof cellClassName === 'function' ? (context ? cellClassName(context) : undefined) : cellClassName,
                        );
                      });
                      // 条件付き書式(データバー / カラースケール)。指定のある列だけ値と集計を読みます(React 版と同じ)。
                      //   帯は .ssg-cf-bar(絶対配置・文字の下)、背景色は inline の color-mix()(文字色は変えない)。
                      const formatRules = () => (props.conditionalFormat ? column().conditionalFormat : undefined);
                      const dataBar = createMemo(() => {
                        const feature = props.conditionalFormat;
                        const rules = formatRules();
                        return feature && rules?.dataBar
                          ? feature.resolveDataBar(rules.dataBar, value(), props.conditionalFormatStats.get(column().key))
                          : null;
                      });
                      const scaleBackground = createMemo(() => {
                        const feature = props.conditionalFormat;
                        const rules = formatRules();
                        return feature && rules?.colorScale
                          ? feature.resolveColorScaleBackground(
                              rules.colorScale,
                              value(),
                              props.conditionalFormatStats.get(column().key),
                            )
                          : null;
                      });
                      const dataBarColor = () => {
                        const bar = dataBar();
                        const rules = formatRules()?.dataBar;
                        return bar ? (bar.negative ? rules?.negativeColor : rules?.color) : undefined;
                      };
                      const invalidMessage = createMemo(() =>
                        props.showValidationMarks && hasCellValidation(unbound())
                          ? getInvalidMessage(unbound(), currentRow(), value(), texts())
                          : null,
                      );
                      const cellNote = createMemo(() => {
                        const note = column().cellNote;
                        const context = styleContext();
                        return note && context ? normalizeCellNote(note(context)) : null;
                      });
                      const tooltipText = () => resolveCellTooltipText(invalidMessage(), cellNote());
                      // auto-height の列のセルは、箱はほかのセルと同じく行の高さで、中身を器(data-autoheight-content)に
                      //   入れて器の高さを測ります(React 版 DU-32)。背の高い行での揃えは、未指定なら auto-height の列が上、
                      //   ほかの列は真ん中(1 行の行ではどれも真ん中)。
                      //   2 つの真偽値は 1 つの memo(1 = auto-height のセル、2 = 上にそろえる)にまとめます。auto-height の切り替えでは
                      //   すべてのセルが走るので、セルごとの購読を 1 つにします(Solid の開発ビルドの HUGE_FAN_OUT は 2,000 から)。
                      const autoHeightFlags = createMemo(() => {
                        if (!props.autoHeight) {
                          return 0;
                        }
                        const content = column().autoHeight === true;
                        const top =
                          rowSize() > props.rowHeight &&
                          (column().verticalAlign ?? props.verticalAlign ?? (content ? 'top' : 'center')) === 'top';
                        return (content ? 1 : 0) | (top ? 2 : 0);
                      });
                      const isAutoHeightCell = () => (autoHeightFlags() & 1) !== 0;
                      const alignTop = () => (autoHeightFlags() & 2) !== 0;
                      const markOverflowTooltip = () =>
                        shouldMarkCellOverflowTooltip({
                          enabled: props.showCellOverflowTooltip,
                          isAutoHeightCell: isAutoHeightCell(),
                          hasRenderCell: column().renderCell !== undefined,
                        });
                      const cell = () => ({ row: rowIndex(), col: colIndex() });
                      return (
                        <div
                          role="gridcell"
                          aria-colindex={colIndex() + 2}
                          aria-selected={isSelected() ? 'true' : 'false'}
                          aria-readonly={readOnlyCell() ? 'true' : undefined}
                          aria-invalid={invalidMessage() !== null ? 'true' : undefined}
                          aria-description={tooltipText() ?? undefined}
                          id={isActive() ? props.activeCellDomId : undefined}
                          aria-owns={isEditing() ? props.cellEditorDomId : undefined}
                          data-ssg-col-key={column().key}
                          data-autoheight-cell={isAutoHeightCell() ? '' : undefined}
                          data-ssg-tooltip={tooltipText() ?? undefined}
                          data-ssg-tooltip-overflow={markOverflowTooltip() ? '' : undefined}
                          class={[
                            'ssg-body-cell',
                            rowSlot().className,
                            conditionalCell().className,
                            props.slots.bodyCell?.className,
                            {
                              'ssg-body-cell--align-center': column().align === 'center',
                              'ssg-body-cell--align-right': column().align === 'right',
                              'ssg-body-cell--cf-bar': dataBar() !== null,
                              'ssg-body-cell--cf-scale': scaleBackground() !== null,
                              'ssg-body-cell--chip-compact':
                                formatRules()?.chips !== undefined && size() < CHIP_COMPACT_MAX_WIDTH,
                              'ssg-body-cell--autoheight': isAutoHeightCell(),
                              'ssg-body-cell--valign-top': alignTop(),
                              'ssg-body-cell--readonly': readOnlyCell() && !isSelected(),
                              'ssg-body-cell--invalid': invalidMessage() !== null,
                              'ssg-body-cell--has-note': cellNote() !== null,
                              'ssg-body-cell--row-hovered': isHovered(),
                            },
                          ]}
                          onPointerDown={(event) => {
                            if (event.target instanceof Element && event.target.closest('.ssg-detail-toggle')) {
                              return;
                            }
                            props.onCellPointerDown(cell(), event);
                          }}
                          onPointerEnter={(event) => props.onCellPointerEnter(cell(), event)}
                          onClick={(event) => props.onCellClick(cell(), event)}
                          onDblClick={(event) => props.onCellDoubleClick(cell(), event)}
                          style={{
                            ...props.slots.bodyCell?.style,
                            ...(scaleBackground() !== null ? { 'background-color': scaleBackground() as string } : null),
                            ...rowSlot().style,
                            ...conditionalCell().style,
                            left: px(props.leadingWidth + entry().paneLocalStart),
                            width: px(size()),
                            'min-width': px(size()),
                            height: px(rowSize()),
                            'word-break': column().wordBreak,
                            'line-break': column().lineBreak,
                            'z-index': isActive() ? 3 : 1,
                          }}
                        >
                          <Show when={dataBar()}>
                            {(bar) => (
                              <span
                                class={['ssg-cf-bar', { 'ssg-cf-bar--negative': bar().negative }]}
                                style={{
                                  left: `${bar().start}%`,
                                  width: `${bar().end - bar().start}%`,
                                  ...(dataBarColor() ? { 'background-color': dataBarColor() } : null),
                                }}
                                aria-hidden="true"
                              />
                            )}
                          </Show>
                          <Show
                            when={isAutoHeightCell()}
                            fallback={props.renderCellContent(currentRow(), column(), cellState)}
                          >
                            <div class="ssg-autoheight-content" data-autoheight-content="">
                              {props.renderCellContent(currentRow(), column(), cellState)}
                            </div>
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </div>
              );
            }}
          </Show>
        );
      }}
    </For>
  );
}