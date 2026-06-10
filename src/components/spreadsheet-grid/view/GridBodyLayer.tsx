import { memo } from 'react';
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

// ──────────────────────────────────────────────────────────
// A-1: 行を React.memo で切り出します（縦スクロールのチカチカ対策の本命）。
//   旧実装は GridBodyLayer 内のインライン .map で毎レンダーごとに全行・全セルを
//   再構築していました。スクロールは仮想化購読により毎ティック親(SpreadsheetGrid)を
//   再レンダーさせるため、画面に残り続ける行まで毎フレーム reconcile していました。
//
//   この GridBodyRow は下記の props がすべて「縦スクロール中は参照安定」になるよう
//   設計してあります（親側で rowHeaderCellStyle を useMemo 化、ハンドラは useCallback、
//   renderEntries は縦スクロールでは不変、uiState はスクロールでは不変）。
//   結果として、画面内に留まる行は memo によって再レンダーがスキップされ、
//   実際に DOM 変化が必要なのは「端で出入りする行」だけになります。
//   これでメインスレッドの 1 フレームあたりの仕事量が激減し、ネイティブスクロールへの
//   追従性が上がります（A-2 の overscan 増と併用して端の遅延を隠します）。
// ──────────────────────────────────────────────────────────
type GridBodyRowProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  leadingWidth: number;
  rowIndex: number;
  rowKey: GridRowKey;
  row: T;
  // virtualRow.start（scrollMargin=headerHeight 込み）。行全体の translateY に使います。
  top: number;
  renderEntries: PaneColumnEntry<T>[];
  rowHeight: number;
  rowHeaderCellStyle: CSSProperties;
  // 注記: hoveredRowIndex そのものではなく「この行がホバー中か」を boolean で渡します。
  //       これによりホバー変化時に再レンダーされるのは該当 2 行だけで済みます。
  isRowHovered: boolean;
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
  renderCellContent: (
    row: T,
    rowIndex: number,
    column: GridColumn<T>,
    colIndex: number,
  ) => ReactNode;
};

function GridBodyRowInner<T>({
  pane,
  ownsRowHeader,
  leadingWidth,
  rowIndex,
  rowKey,
  row,
  top,
  renderEntries,
  rowHeight,
  rowHeaderCellStyle,
  isRowHovered,
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
}: GridBodyRowProps<T>) {
  const isRowSelected = selectIsRowSelected(uiState, rowIndex);

  return (
    <div
      data-pane={pane}
      data-row-index={rowIndex}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: rowHeight,
        transform: `translateY(${top}px)`,
        // 行単位で絶対配置し、セル側は row 内ローカル座標にします。
        // これにより仮想行の出入りで通常フローの高さが揺れず、
        // sticky header / fixed pane 付近の境界チラつきを抑えます。
        contain: 'layout style paint',
      }}
    >
      {ownsRowHeader && (
        <div
          onPointerDown={(event) => onRowHeaderPointerDown(rowIndex, event)}
          onPointerEnter={(event) => onRowHeaderPointerEnter(rowIndex, event)}
          onPointerLeave={() => onRowHeaderPointerLeave(rowIndex)}
          style={{
            ...rowHeaderCellStyle,
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 5,
            height: rowHeight,
            backgroundColor:
              isWholeGridSelected || isRowSelected
                ? isRowHovered
                  ? '#bfdbfe'
                  : '#dbeafe'
                : isRowHovered
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
        const isSelected = selectIsCellSelected(uiState, rowIndex, colIndex);
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
              top: 0,
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
              backgroundColor:
                readOnlyCell && !isSelected ? '#f8fafc' : '#ffffff',
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
}

// memo + ジェネリック関数コンポーネントの定石です（型を保ったまま memo 化）。
const GridBodyRow = memo(GridBodyRowInner) as typeof GridBodyRowInner;

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
  renderEntries: PaneColumnEntry<T>[];
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
  renderCellContent: (
    row: T,
    rowIndex: number,
    column: GridColumn<T>,
    colIndex: number,
  ) => ReactNode;
};

// 変更(A-1): 本体は「仮想行を並べて GridBodyRow(memo) に委譲するだけ」の薄い層になりました。
//   親が毎スクロールティック再レンダーしても、ここで作られる要素は memo によって
//   props 比較され、変化のない行は再レンダーされません。
export function GridBodyLayer<T>({
  pane,
  ownsRowHeader,
  leadingWidth,
  filteredRows,
  filteredRowKeys,
  virtualRows,
  virtualRowIndexes,
  renderEntries,
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
          <GridBodyRow
            key={String(rowKey)}
            pane={pane}
            ownsRowHeader={ownsRowHeader}
            leadingWidth={leadingWidth}
            rowIndex={rowIndex}
            rowKey={rowKey}
            row={row}
            top={virtualRow.start}
            renderEntries={renderEntries}
            rowHeight={rowHeight}
            rowHeaderCellStyle={rowHeaderCellStyle}
            isRowHovered={hoveredRowIndex === rowIndex}
            isWholeGridSelected={isWholeGridSelected}
            uiState={uiState}
            readOnly={readOnly}
            canEditCell={canEditCell}
            onRowHeaderPointerDown={onRowHeaderPointerDown}
            onRowHeaderPointerEnter={onRowHeaderPointerEnter}
            onRowHeaderPointerLeave={onRowHeaderPointerLeave}
            onCellPointerDown={onCellPointerDown}
            onCellPointerEnter={onCellPointerEnter}
            onCellDoubleClick={onCellDoubleClick}
            renderCellContent={renderCellContent}
          />
        );
      })}
    </>
  );
}

export default GridBodyLayer;
