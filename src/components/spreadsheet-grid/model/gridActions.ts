import type { CellCoord } from './gridTypes';

// 追加: Grid UI action の union 型です。
export type GridUiAction =
  | { type: 'cell/activate'; cell: CellCoord | null }
  | { type: 'selection/start'; cell: CellCoord }
  | { type: 'selection/update'; cell: CellCoord }
  | { type: 'rowSelection/start'; row: number }
  | { type: 'rowSelection/update'; row: number }
  | { type: 'columnSelection/start'; col: number }
  | { type: 'columnSelection/update'; col: number }
  | { type: 'selection/end' }
  | { type: 'selection/clear' }
  | { type: 'edit/start'; cell: CellCoord }
  | { type: 'edit/stop' }
  | {
      type: 'column/resizeStart';
      columnKey: string;
      startX: number;
      startWidth: number;
      minWidth: number;
      maxWidth: number;
    }
  | { type: 'column/resizeUpdate'; clientX: number }
  | { type: 'column/resizeEnd' }
  | { type: 'columnWidths/sync'; widths: Record<string, number> }
  | { type: 'filter/setGlobal'; value: string }
  | { type: 'filter/setColumn'; columnKey: string; value: unknown }
  | { type: 'filter/clearColumn'; columnKey: string }
  | { type: 'filter/resetAll' };

// 追加: action creator 群です。UI から文字列リテラルを散らさないために定義します。
export const gridActions = {
  activateCell: (cell: CellCoord | null): GridUiAction => ({
    type: 'cell/activate',
    cell,
  }),
  startSelection: (cell: CellCoord): GridUiAction => ({
    type: 'selection/start',
    cell,
  }),
  updateSelection: (cell: CellCoord): GridUiAction => ({
    type: 'selection/update',
    cell,
  }),
  startRowSelection: (row: number): GridUiAction => ({
    type: 'rowSelection/start',
    row,
  }),
  updateRowSelection: (row: number): GridUiAction => ({
    type: 'rowSelection/update',
    row,
  }),
  startColumnSelection: (col: number): GridUiAction => ({
    type: 'columnSelection/start',
    col,
  }),
  updateColumnSelection: (col: number): GridUiAction => ({
    type: 'columnSelection/update',
    col,
  }),
  endSelection: (): GridUiAction => ({
    type: 'selection/end',
  }),
  clearSelection: (): GridUiAction => ({
    type: 'selection/clear',
  }),
  startEdit: (cell: CellCoord): GridUiAction => ({
    type: 'edit/start',
    cell,
  }),
  stopEdit: (): GridUiAction => ({
    type: 'edit/stop',
  }),
  startColumnResize: (
    columnKey: string,
    startX: number,
    startWidth: number,
    minWidth: number,
    maxWidth: number,
  ): GridUiAction => ({
    type: 'column/resizeStart',
    columnKey,
    startX,
    startWidth,
    minWidth,
    maxWidth,
  }),
  updateColumnResize: (clientX: number): GridUiAction => ({
    type: 'column/resizeUpdate',
    clientX,
  }),
  endColumnResize: (): GridUiAction => ({
    type: 'column/resizeEnd',
  }),
  syncColumnWidths: (widths: Record<string, number>): GridUiAction => ({
    type: 'columnWidths/sync',
    widths,
  }),
  setGlobalFilter: (value: string): GridUiAction => ({
    type: 'filter/setGlobal',
    value,
  }),
  setColumnFilter: (columnKey: string, value: unknown): GridUiAction => ({
    type: 'filter/setColumn',
    columnKey,
    value,
  }),
  clearColumnFilter: (columnKey: string): GridUiAction => ({
    type: 'filter/clearColumn',
    columnKey,
  }),
  resetAllFilters: (): GridUiAction => ({
    type: 'filter/resetAll',
  }),
};
``