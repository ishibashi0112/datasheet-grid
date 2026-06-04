import type { ReactNode } from 'react';

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
  getValue?: (row: T) => unknown;
  setValue?: (row: T, value: unknown) => T;
  renderCell?: (ctx: CellRenderContext<T>) => ReactNode;
  renderHeader?: (ctx: HeaderRenderContext<T>) => ReactNode;
  filterType?: 'text' | 'number' | 'date' | 'select' | 'custom';
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

// 追加: 範囲選択用のドラッグ状態です。
export type SelectionDragState = {
  type: 'selection';
  anchor: CellCoord;
  current: CellCoord;
};

// 追加: Grid 内部 UI state です。rows は外部 controlled とし、ここには持ちません。
export type GridUiState = {
  activeCell: CellCoord | null;
  selection: GridSelection;
  editingCell: CellCoord | null;
  dragState: SelectionDragState | ColumnResizeDragState | null;
  columnWidths: Record<string, number>;
  filters: GridFilterState;
};

// 追加: 公開 props です。
export type SpreadsheetGridProps<T> = {
  rows: T[];
  columns: GridColumn<T>[];
  onRowsChange?: (nextRows: T[]) => void;
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
  className?: string;
};