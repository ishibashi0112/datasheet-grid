import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import {
  selectIsActiveCell,
  selectIsCellSelected,
  selectIsRowSelected,
} from '../model/gridSelectors';
import type {
  CellCoord,
  GridColumn,
  GridRowKey,
  GridUiState,
  SpreadsheetGridProps,
} from '../model/gridTypes';
// 変更(10-C): 列座標を ColumnMeasurement(グローバル) から
//             PaneColumnEntry(ペインローカル) へ切り替えます。
import type { PaneColumnEntry } from '../logic/geometry';
import type { GridPaneKind } from './GridHeaderRow';
import { isCellEditable } from '../utils/permissions';

type VirtualRowLike = {
  index: number;
  start: number;
};

type GridBodyLayerProps<T> = {
  // 追加(10-C): 描画対象のペイン種別です。
  pane: GridPaneKind;
  // 追加(10-C): true のときだけ行番号セルを描画します。
  ownsRowHeader: boolean;
  // 追加(10-C): 列の前に確保する先頭幅です(行ヘッダーを持つペインは rowHeaderWidth、他は 0)。
  leadingWidth: number;
  filteredRows: T[];
  filteredRowKeys: GridRowKey[];
  virtualRows: VirtualRowLike[];
  virtualRowIndexes: Set<number>;
  // 変更(10-C): 描画対象の列エントリです(座標はペインローカル)。
  //             中央ペインは仮想化済みの部分集合、固定ペインは全エントリです。
  renderEntries: PaneColumnEntry<T>[];
  headerHeight: number;
  rowHeight: number;
  rowHeaderCellStyle: CSSProperties;
  hoveredRowIndex: number | null;
  isWholeGridSelected: boolean;
  uiState: GridUiState;
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  onRowHeaderPointerDown: (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onRowHeaderPointerEnter: (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onRowHeaderPointerLeave: (rowIndex: number) => void;
  onCellPointerDown: (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onCellPointerEnter: (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onCellDoubleClick: (cell: CellCoord) => void;
  // 注記(10-C): renderCellContent には colIndex として entry.logicalIndex を渡します。
  renderCellContent: (
    row: T,
    rowIndex: number,
    column: GridColumn<T>,
    colIndex: number,
  ) => ReactNode;
};

// 変更(10-C): 仮想行 × 「1ペイン分の列エントリ」で、行ヘッダーとセル本体を
//             描画する汎用 body layer にしました。
export function GridBodyLayer<T>({
  pane,
  ownsRowHeader,
  leadingWidth,
  filteredRows,
  filteredRowKeys,
  virtualRows,
  virtualRowIndexes,
  renderEntries,
  headerHeight,
  rowHeight,
  rowHeaderCellStyle,
  hoveredRowIndex,
  isWholeGridSelected,
  uiState,
  readOnly,
  canEditCell,
  onRowHeaderPointerDown,
  onRowHeaderPointerEnter,
  onRowHeaderPointerLeave,
  onCellPointerDown,
  onCellPointerEnter,
  onCellDoubleClick,
  renderCellContent,
}: GridBodyLayerProps<T>) {
  return (
    <>
      {virtualRows.map((virtualRow) => {
        const rowIndex = virtualRow.index;
        const row = filteredRows[rowIndex];
        const rowKey = filteredRowKeys[rowIndex] ?? rowIndex;
        if (!row || !virtualRowIndexes.has(rowIndex)) {
          return null;
        }

        return (
          <div
            key={String(rowKey)}
            data-pane={pane}
            style={{ display: 'flex', minHeight: rowHeight }}
          >
            {ownsRowHeader && (
              <div
                onPointerDown={(event) =>
                  onRowHeaderPointerDown(rowIndex, event)
                }
                onPointerEnter={(event) =>
                  onRowHeaderPointerEnter(rowIndex, event)
                }
                onPointerLeave={() => onRowHeaderPointerLeave(rowIndex)}
                style={{
                  ...rowHeaderCellStyle,
                  position: 'absolute',
                  top: headerHeight + virtualRow.start,
                  left: 0,
                  zIndex: 5,
                  height: rowHeight,
                  backgroundColor: isWholeGridSelected
                    ? hoveredRowIndex === rowIndex
                      ? '#bfdbfe'
                      : '#dbeafe'
                    : selectIsRowSelected(uiState, rowIndex)
                      ? hoveredRowIndex === rowIndex
                        ? '#bfdbfe'
                        : '#dbeafe'
                      : hoveredRowIndex === rowIndex
                        ? '#e2e8f0'
                        : '#f8fafc',
                  fontWeight: 500,
                }}
              >
                {rowIndex + 1}
              </div>
            )}

            {renderEntries.map((entry) => {
              if (!entry) {
                return null;
              }

              const colIndex = entry.logicalIndex;
              const column = entry.column;
              const left = leadingWidth + entry.paneLocalStart;
              const size = entry.paneLocalSize;

              const isActive = selectIsActiveCell(uiState, rowIndex, colIndex);
              const isSelected = selectIsCellSelected(
                uiState,
                rowIndex,
                colIndex,
              );
              const readOnlyCell = !isCellEditable(
                { readOnly, canEditCell },
                rowIndex,
                colIndex,
                row,
                column,
              );

              return (
                <div
                  key={`${String(rowKey)}-${column.key}`}
                  onPointerDown={(event) =>
                    onCellPointerDown({ row: rowIndex, col: colIndex }, event)
                  }
                  onPointerEnter={(event) =>
                    onCellPointerEnter({ row: rowIndex, col: colIndex }, event)
                  }
                  onDoubleClick={() =>
                    onCellDoubleClick({ row: rowIndex, col: colIndex })
                  }
                  style={{
                    position: 'absolute',
                    top: headerHeight + virtualRow.start,
                    left,
                    width: size,
                    minWidth: size,
                    height: rowHeight,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 10px',
                    borderRight: '1px solid #e5e7eb',
                    borderBottom: '1px solid #e5e7eb',
                    backgroundColor: isSelected
                      ? '#ffffff'
                      : readOnlyCell
                        ? '#f8fafc'
                        : '#ffffff',
                    color: readOnlyCell ? '#64748b' : '#0f172a',
                    cursor: 'default',
                    userSelect: 'none',
                    outline: 'none',
                    zIndex: isActive ? 3 : 1,
                  }}
                >
                  {renderCellContent(row, rowIndex, column, colIndex)}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

export default GridBodyLayer;
