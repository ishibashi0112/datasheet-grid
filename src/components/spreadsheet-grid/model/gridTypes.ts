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
  filterType?: 'text' | 'number' | 'date' | 'select' | 'custom';
  // 追加: select フィルター時の候補です。未指定時は rows から自動収集します。
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
export type CellSelectionDragState = {
  type: 'selection';
  selectionKind: 'cell';
  anchor: CellCoord;
  current: CellCoord;
};

// 追加: 行選択用のドラッグ状態です。
export type RowSelectionDragState = {
  type: 'selection';
  selectionKind: 'row';
  anchorRow: number;
  currentRow: number;
};

// 追加: 列選択用のドラッグ状態です。
export type ColumnSelectionDragState = {
  type: 'selection';
  selectionKind: 'col';
  anchorCol: number;
  currentCol: number;
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