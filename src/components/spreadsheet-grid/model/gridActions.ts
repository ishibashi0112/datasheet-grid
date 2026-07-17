import type {
  CellCoord,
  ColumnFilterValue,
  GridFilterState,
  GridSortEntry,
  RowSelectionState,
} from './gridTypes';

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
      // 変更(②-S4 仕上げ): maxWidth を任意化。未指定なら reducer 側で上限なし
      //   (Number.POSITIVE_INFINITY)になります。呼び出し側が旧 1000 を渡していたため、
      //   maxWidth 未指定列を autoSize(上限なし)後に手動リサイズすると 1000 へ
      //   スナップしていた不具合を解消します(autoSize と手動リサイズの上限規則を一致)。
      maxWidth?: number;
    }
  | { type: 'column/resizeUpdate'; clientX: number }
  | { type: 'column/resizeEnd' }
  | { type: 'columnWidths/sync'; widths: Record<string, number> }
  | { type: 'columnWidths/reset'; widths: Record<string, number> }
  | { type: 'filter/setGlobal'; value: string }
  | { type: 'filter/setColumn'; columnKey: string; value: ColumnFilterValue }
  | { type: 'filter/clearColumn'; columnKey: string }
  | { type: 'filter/resetAll' }
  // 追加(state #1): applyState 用に filters 全体を 1 dispatch で置換します(globalText + columnFilters)。
  | { type: 'filter/setAll'; filters: GridFilterState }
  | { type: 'sort/set'; entries: GridSortEntry[] }
  | { type: 'sort/clear' }
  // 追加(行選択): チェックボックス行選択の状態を丸ごと設定します(次状態は純ロジックで算出済み)。
  //   既存の rowSelection/start|update(セル範囲の行選択)とは別物です。
  | { type: 'rowSelect/set'; state: RowSelectionState }
  // 追加(grouping ②): 行グルーピングのグループ開閉です。toggle は 1 キーの反転、set は
  //   丸ごと置換(すべて展開 = 空集合 / すべて折りたたみ = collectAllGroupKeys の全キー)。
  | { type: 'group/toggleCollapsed'; groupKey: string }
  | { type: 'group/setCollapsedKeys'; keys: ReadonlySet<string> };

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
    // 変更(②-S4 仕上げ): 任意化。未指定は reducer で上限なしに既定化されます。
    maxWidth?: number,
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
  // 追加(B3): columns 同期用のフル置換版です(merge の syncColumnWidths とは別物)。
  //   列定義から columnWidths を作り直し、渡されていないキー(= flex 列や除去列)は捨てます。
  //   これにより「実行時に fixed→flex へ切替えた列」の古い固定エントリを一掃できます。
  resetColumnWidths: (widths: Record<string, number>): GridUiAction => ({
    type: 'columnWidths/reset',
    widths,
  }),
  setGlobalFilter: (value: string): GridUiAction => ({
    type: 'filter/setGlobal',
    value,
  }),
  setColumnFilter: (
    columnKey: string,
    value: ColumnFilterValue,
  ): GridUiAction => ({
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
  // 追加(state #1): filters 全体を 1 dispatch で置換します(applyState 用)。globalText + columnFilters を
  //   まとめて差し替え、merge ではなくフル置換します(渡されない列フィルターは消えます)。
  setAllFilters: (filters: GridFilterState): GridUiAction => ({
    type: 'filter/setAll',
    filters,
  }),
  // 変更(MS-1): 単一(columnKey, direction) → エントリ配列まるごと set にしました。
  //   配列の組み立て(置換/追加/除去)は呼び出し側で行い、reducer/action は薄いまま保ちます。
  setSort: (entries: GridSortEntry[]): GridUiAction => ({
    type: 'sort/set',
    entries,
  }),
  clearSort: (): GridUiAction => ({
    type: 'sort/clear',
  }),
  // 追加(行選択): 算出済みの行選択状態を設定します。
  setRowSelectionState: (state: RowSelectionState): GridUiAction => ({
    type: 'rowSelect/set',
    state,
  }),
  // 追加(grouping ②): グループ開閉の反転 / 丸ごと置換です。
  toggleGroupCollapsed: (groupKey: string): GridUiAction => ({
    type: 'group/toggleCollapsed',
    groupKey,
  }),
  setCollapsedGroupKeys: (keys: ReadonlySet<string>): GridUiAction => ({
    type: 'group/setCollapsedKeys',
    keys,
  }),
};