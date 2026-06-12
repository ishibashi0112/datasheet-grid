import type { ReactNode } from 'react';

// 追加: row identity 用の key 型です。
export type GridRowKey = string | number;

// 追加: セル座標を表す基本型です。
export type CellCoord = {
  row: number;
  col: number;
};

// 追加: 範囲選択を表すセル範囲型です。
export type CellRange = {
  start: CellCoord;
  end: CellCoord;
};

// 追加: Grid の選択状態です。初版は cell selection を主対象にします。
export type GridSelection =
  | { type: 'cell'; range: CellRange }
  | { type: 'row'; startRow: number; endRow: number }
  | { type: 'col'; startCol: number; endCol: number }
  | null;

// 追加: フィルター状態です。初版はグローバル + 列単位の最小構成です。
export type GridFilterState = {
  globalText: string;
  columnFilters: Record<string, unknown>;
};

// 追加: 単一列ソート用の方向型です。
export type GridSortDirection = 'asc' | 'desc' | null;

// 追加: 単一列ソート状態です。初版は multi-sort ではなく 1列のみ扱います。
export type GridSortState = {
  columnKey: string | null;
  direction: GridSortDirection;
};

// 追加: select フィルター用の候補型です。
export type GridSelectFilterOption = {
  label: string;
  value: string;
};

// 追加(12-A): set フィルター(AG Grid の Set Filter 相当)の列フィルター値です。
//             columnFilters[columnKey] にこのオブジェクトが入っているときだけ
//             set フィルターが「有効」です。全候補が選択された状態は
//             filter/clearColumn で値ごと削除し「フィルターなし」へ正規化します
//             (AG Grid と同じく、全選択 = フィルター非アクティブの扱いです)。
//             values は「表示を許可する値」の配列です(空配列 = 全行非表示)。
//             判定側(logic/filtering.ts)では Set へ変換して O(1) 照合します。
export type SetColumnFilterValue = {
  kind: 'set';
  values: string[];
};

// 追加: セル描画に渡すコンテキストです。
export type CellRenderContext<T> = {
  row: T;
  rowIndex: number;
  colIndex: number;
  value: unknown;
  column: GridColumn<T>;
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  readOnly: boolean;
  setValue: (value: unknown) => void;
};

// 追加(11-A): GridBodyRow がセルごとに算出し、renderCellContent へ引き渡す
//             セル状態のスナップショットです。
// 変更理由: 旧実装では renderCellContent(SpreadsheetGrid 側) が uiState から
//           isActive / isSelected / isEditing を毎回判定しており、uiState 依存に
//           よって useCallback の参照が選択操作のたびに変わり、GridBodyRow(memo)
//           を全行で破っていました。判定を行側へ移し、結果だけを渡します。
export type CellRenderState = {
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  readOnly: boolean;
};

// 追加: ヘッダー描画に渡すコンテキストです。
export type HeaderRenderContext<T> = {
  colIndex: number;
  width: number;
  column: GridColumn<T>;
  filterValue?: unknown;
  isFiltered?: boolean;
};

// 追加(10-A): AG Grid 互換の列固定方向型です。
//             'left' = 左固定、'right' = 右固定、undefined = 固定なし（中央スクロール）。
export type GridColumnPinned = 'left' | 'right';

// 追加: 列定義です。将来のカスタムセル/カスタムヘッダー拡張を見据えています。
export type GridColumn<T> = {
  key: string;
  title?: string;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  visible?: boolean;
  editable?: boolean;
  readOnly?: boolean;
  // 追加(10-A): AG Grid 互換の列固定指定です。
  //             未指定 or undefined → 中央スクロール領域に配置されます。
  pinned?: GridColumnPinned;
  getValue?: (row: T) => unknown;
  setValue?: (row: T, value: unknown) => T;
  renderCell?: (ctx: CellRenderContext<T>) => ReactNode;
  renderHeader?: (ctx: HeaderRenderContext<T>) => ReactNode;
  // 変更(12-A): 'set' を追加します。AG Grid の Set Filter 相当
  //             (チェックボックス一覧 + 検索 + Select All)の UI になります。
  filterType?: 'text' | 'number' | 'date' | 'select' | 'set' | 'custom';
  // 追加: select / set フィルター時の候補です。未指定時は rows から自動収集します。
  filterOptions?: GridSelectFilterOption[];
  filterFn?: (row: T, filterValue: unknown) => boolean;
  parseClipboardValue?: (raw: string, row: T) => unknown;
  formatClipboardValue?: (value: unknown, row: T) => string;
};

// 追加: 列リサイズ用のドラッグ状態です。初版では reducer 側の設計だけ入れます。
export type ColumnResizeDragState = {
  type: 'columnResize';
  columnKey: string;
  startX: number;
  startWidth: number;
  minWidth: number;
  maxWidth: number;
};

// 追加: セル範囲選択用のドラッグ状態です。
// 変更(11-B2): current を削除しました。ドラッグ中の「現在位置」は selection 側
//              (range.end / endRow / endCol)が唯一の正であり、dragState には
//              ドラッグ開始時に確定する不変情報(anchor)のみを持たせます。
//              これにより update 系 action で dragState を作り直す必要がなくなり、
//              ドラッグ中の dragState 参照が恒久的に安定します。
export type CellSelectionDragState = {
  type: 'selection';
  selectionKind: 'cell';
  anchor: CellCoord;
};

// 追加: 行選択用のドラッグ状態です。
// 変更(11-B2): currentRow を削除しました(理由は CellSelectionDragState と同じ)。
export type RowSelectionDragState = {
  type: 'selection';
  selectionKind: 'row';
  anchorRow: number;
};

// 追加: 列選択用のドラッグ状態です。
// 変更(11-B2): currentCol を削除しました(理由は CellSelectionDragState と同じ)。
export type ColumnSelectionDragState = {
  type: 'selection';
  selectionKind: 'col';
  anchorCol: number;
};

// 追加: Grid 内部 UI state です。rows は外部 controlled とし、ここには持ちません。
export type GridUiState = {
  activeCell: CellCoord | null;
  selection: GridSelection;
  editingCell: CellCoord | null;
  dragState:
    | CellSelectionDragState
    | RowSelectionDragState
    | ColumnSelectionDragState
    | ColumnResizeDragState
    | null;
  columnWidths: Record<string, number>;
  filters: GridFilterState;
  sort: GridSortState;
};

// 追加: 選択統計の派生 summary です。
export type SpreadsheetGridSelectionStats = {
  selectedCellCount: number;
  selectedRowCount: number;
  selectedColumnCount: number;
};

// 追加: topBar / bottomBar でそのまま使える派生 summary です。
export type SpreadsheetGridDerivedSummary = {
  rowSummaryText: string;
  columnSummaryText: string;
  filterSummaryText: string;
  sortSummaryText: string;
  activeCellLabel: string;
  selectionLabel: string;
  selectionStatsText: string;
  selectionStats: SpreadsheetGridSelectionStats;
  hasGlobalFilter: boolean;
  // 追加: グローバルフィルター入力値の短縮表示です。
  globalFilterPreview: string | null;
  activeColumnFilterCount: number;
  hasAnyFilter: boolean;
  hasSorting: boolean;
  sortedColumnLabel: string | null;
};

// 追加: topBar / bottomBar へ渡す公開コンテキストです。
export type SpreadsheetGridSlotContext<T> = {
  rows: T[];
  filteredRows: T[];
  columns: GridColumn<T>[];
  visibleColumns: GridColumn<T>[];
  globalFilterText: string;
  // 追加: bar summary 用に列フィルター値を公開します。
  columnFilterValues: Record<string, unknown>;
  // 追加: bar summary 用にソート状態を公開します。
  sortState: GridSortState;
  setGlobalFilterText: (value: string) => void;
  activeCell: CellCoord | null;
  selection: GridSelection;
  // 追加: 利用側が helper import なしで使える派生 summary です。
  derivedSummary: SpreadsheetGridDerivedSummary;
};

// 追加: 公開 props です。
export type SpreadsheetGridProps<T> = {
  rows: T[];
  columns: GridColumn<T>[];
  onRowsChange?: (nextRows: T[]) => void;
  onColumnsChange?: (nextColumns: GridColumn<T>[]) => void;
  rowKeyGetter?: (row: T, index: number) => GridRowKey;
  createRow?: () => T;
  createOverflowColumn?: (columnIndex: number) => GridColumn<T>;
  rowHeight?: number;
  headerHeight?: number;
  rowHeaderWidth?: number;
  readOnly?: boolean;
  canEditCell?: (
    rowIndex: number,
    colIndex: number,
    row: T,
    column: GridColumn<T>,
  ) => boolean;
  enableClipboard?: boolean;
  enableRangeSelection?: boolean;
  enableColumnResize?: boolean;
  enableGlobalFilter?: boolean;
  enableColumnFilter?: boolean;
  enableSorting?: boolean;
  // 追加: Grid 上部カスタム領域です。未指定時は default top bar を使えます。
  renderTopBar?: (context: SpreadsheetGridSlotContext<T>) => ReactNode;
  // 追加: Grid 下部カスタム領域です。未指定時は何も表示しません。
  renderBottomBar?: (context: SpreadsheetGridSlotContext<T>) => ReactNode;
  className?: string;
};