import { memo } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
// 変更(11-A): uiState 丸ごと依存を撤廃しました。
//   旧: GridBodyRow が uiState を受け取り selectIsActiveCell / selectIsCellSelected を
//       セルごとに評価 → uiState のあらゆる更新(選択ドラッグの毎 pointermove 等)で
//       memo の shallow 比較が全行不一致になり、全行×3ペインの再レンダーが発生。
//   新: 親(GridBodyLayer)が SelectionSnapshot + activeCell / editingCell から
//       「行ごとのプリミティブ値」へ分解して渡す。プリミティブなら shallow 比較が
//       値比較として機能するため、選択範囲が変わっても再レンダーされるのは
//       実際に選択状態が変化した行だけになる。
import type { SelectionSnapshot } from '../model/gridSelectors';
import type {
  CellCoord,
  CellRenderState,
  GridColumn,
  GridRowKey,
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
// A-1: 行を React.memo で切り出します(縦スクロールのチカチカ対策の本命)。
//   この GridBodyRow は下記の props がすべて「縦スクロール中は参照安定」になるよう
//   設計してあります(親側で rowHeaderCellStyle を useMemo 化、ハンドラは useCallback、
//   renderEntries は縦スクロールでは不変)。
// 変更(11-A): さらに「選択操作中も安定」へ強化しました。
//   uiState オブジェクトの代わりに、この行に関係する選択状態だけを
//   プリミティブ(number / boolean)で受け取ります。
//   - activeColInRow / editingColInRow: この行に active / editing セルがあれば
//     その論理列 index、無ければ -1。
//   - selectedColStart / selectedColEnd: この行で選択されている論理列 index の
//     閉区間。選択が掛かっていない行は -1 / -1。
//   - isRowSelected: 行選択(type 'row')でこの行が範囲内かどうか。
//   これにより選択ドラッグの毎 pointermove で再レンダーされるのは
//   「選択状態のプリミティブ値が実際に変わった行」だけになります。
//   (11-diag で実証済み: 範囲外の行は親が何回再レンダーされてもスキップされます)
// ──────────────────────────────────────────────────────────
type GridBodyRowProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  leadingWidth: number;
  rowIndex: number;
  rowKey: GridRowKey;
  row: T;
  // virtualRow.start(scrollMargin=headerHeight 込み)。行全体の translateY に使います。
  top: number;
  renderEntries: PaneColumnEntry<T>[];
  rowHeight: number;
  rowHeaderCellStyle: CSSProperties;
  // 注記: hoveredRowIndex そのものではなく「この行がホバー中か」を boolean で渡します。
  //       これによりホバー変化時に再レンダーされるのは該当 2 行だけで済みます。
  isRowHovered: boolean;
  isWholeGridSelected: boolean;
  // 追加(11-A): 行ごとの選択状態プリミティブです(uiState 丸ごと渡しの置き換え)。
  isRowSelected: boolean;
  activeColInRow: number;
  editingColInRow: number;
  selectedColStart: number;
  selectedColEnd: number;
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
  // 変更(11-A): セル状態(cellState)は行側で算出し、第5引数で引き渡します。
  //             これにより親の renderCellContent は uiState 非依存になり、
  //             選択操作で参照が変わらなくなります。
  renderCellContent: (
    row: T,
    rowIndex: number,
    column: GridColumn<T>,
    colIndex: number,
    cellState: CellRenderState,
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
  isRowSelected,
  activeColInRow,
  editingColInRow,
  selectedColStart,
  selectedColEnd,
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

        // 変更(11-A): セル状態は uiState セレクタではなく行プリミティブから導出します。
        //   isSelected は旧 selectIsCellSelected と等価です:
        //   - 行選択(type 'row')で行が範囲内 → isRowSelected
        //   - セル選択(type 'cell')で行が範囲内 / 列選択(type 'col')
        //       → selectedColStart..selectedColEnd の閉区間に colIndex が入るか
        const isActive = colIndex === activeColInRow;
        const isEditing = colIndex === editingColInRow;
        const isSelected =
          isRowSelected ||
          (selectedColStart >= 0 &&
            colIndex >= selectedColStart &&
            colIndex <= selectedColEnd);
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
            {renderCellContent(row, rowIndex, column, colIndex, {
              isActive,
              isSelected,
              isEditing,
              readOnly: readOnlyCell,
            })}
          </div>
        );
      })}
    </div>
  );
}

// memo + ジェネリック関数コンポーネントの定石です(型を保ったまま memo 化)。
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
  // 変更(11-A): uiState の代わりに、行プリミティブの導出に必要な最小の状態だけを
  //             受け取ります。GridBodyLayer 自体は memo していない(親と同時に
  //             再レンダーされる)ため、ここは参照安定でなくても問題ありません。
  activeCell: CellCoord | null;
  editingCell: CellCoord | null;
  selectionSnapshot: SelectionSnapshot;
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
    cellState: CellRenderState,
  ) => ReactNode;
};

// 変更(A-1): 本体は「仮想行を並べて GridBodyRow(memo) に委譲するだけ」の薄い層になりました。
// 変更(11-A): ここで SelectionSnapshot / activeCell / editingCell を
//             「行ごとのプリミティブ値」へ分解します。分解コストは可視行数ぶんの
//             数値比較のみで毎レンダー実行しても無視できる軽さです。
//             一方で得られる効果は大きく、選択ドラッグ・active cell 移動・編集開始の
//             いずれでも、再レンダーは値が変わった行だけに限定されます。
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
  activeCell,
  editingCell,
  selectionSnapshot,
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

        // 追加(11-A): この行に関係する選択状態だけをプリミティブへ分解します。
        const isRowSelected =
          selectionSnapshot.kind === 'row' &&
          rowIndex >= selectionSnapshot.startRow &&
          rowIndex <= selectionSnapshot.endRow;

        const isInCellSelectionRowRange =
          selectionSnapshot.kind === 'cell' &&
          rowIndex >= selectionSnapshot.startRow &&
          rowIndex <= selectionSnapshot.endRow;

        const selectedColStart =
          selectionSnapshot.kind === 'col'
            ? selectionSnapshot.startCol
            : isInCellSelectionRowRange
              ? selectionSnapshot.startCol
              : -1;
        const selectedColEnd =
          selectionSnapshot.kind === 'col'
            ? selectionSnapshot.endCol
            : isInCellSelectionRowRange
              ? selectionSnapshot.endCol
              : -1;

        const activeColInRow =
          activeCell && activeCell.row === rowIndex ? activeCell.col : -1;
        const editingColInRow =
          editingCell && editingCell.row === rowIndex ? editingCell.col : -1;

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
            isRowSelected={isRowSelected}
            activeColInRow={activeColInRow}
            editingColInRow={editingColInRow}
            selectedColStart={selectedColStart}
            selectedColEnd={selectedColEnd}
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
