import { useMemo } from 'react';
import { selectGlobalFilter } from '../model/gridSelectors';
import type {
  GlobalFilterStatus,
  GridColumn,
  GridUiState,
  SpreadsheetGridSlotContext,
} from '../model/gridTypes';
import { buildGridDerivedSummary } from '../view/gridBarHelpers';

// 追加: derivedSummary / setGlobalFilterText を載せる前の中間 slot context 型です。
// 変更(DS-3-7): base から filteredRows(配列)を外します。サマリは件数のみ使用し、公開
//   slotContext.filteredRows は最終 object で遅延 getter として付与します。
type GridSlotContextBase<T> = Omit<
  SpreadsheetGridSlotContext<T>,
  // 変更(F-async): globalFilterStatus / Progress も base から外します。これらは進捗 tick ごとに
  //   変わるため、安定させたい slotContextBase(→ derivedSummary)には含めず、最終 object でのみ付与します。
  | 'setGlobalFilterText'
  | 'derivedSummary'
  | 'filteredRows'
  | 'globalFilterStatus'
  | 'globalFilterProgress'
>;

type UseGridBarContextArgs<T> = {
  rows: T[];
  // 変更(DS-3-7): filteredRows(配列)→ 件数(viewRowCount)+ 遅延 factory(getFilteredRows)。
  //   サマリは viewRowCount を使い、公開 slotContext.filteredRows は getFilteredRows() を
  //   遅延 getter で返します(外部スロットが読んだ時だけ materialize)。
  viewRowCount: number;
  getFilteredRows: () => T[];
  columns: GridColumn<T>[];
  visibleColumns: GridColumn<T>[];
  uiState: GridUiState;
  setGlobalFilterText: (value: string) => void;
  // 追加(F-async): グローバルフィルタの適用状態と進捗です(useGlobalFilteredOrder の戻り値)。
  globalFilterStatus: GlobalFilterStatus;
  globalFilterProgress: number;
};

// 追加: topBar / bottomBar へ渡す slot context と derived summary をまとめて構築します。
export const useGridBarContext = <T,>({
  rows,
  viewRowCount,
  getFilteredRows,
  columns,
  visibleColumns,
  uiState,
  setGlobalFilterText,
  globalFilterStatus,
  globalFilterProgress,
}: UseGridBarContextArgs<T>) => {
  // 変更(11-B3): slotContextBase の依存を uiState 丸ごとから、bar が実際に参照する
  //   5 フィールドへ分解します。
  // 変更理由: uiState は columnWidths(ライブリサイズ中は毎 pointermove)、
  //   editingCell、dragState など bar 表示と無関係な更新でも参照が変わります。
  //   丸ごと依存のままだと slotContextBase → derivedSummary → slotContext が
  //   その度に連鎖再生成され、topBar / bottomBar スロットの再レンダーを誘発します。
  //   reducer は無関係フィールド更新時に filters / sort / activeCell / selection の
  //   参照を温存する(スプレッドで該当キーのみ差し替える)ため、ここで個別に
  //   取り出した参照は安定し、useMemo が正しくスキップされます。
  const globalFilterText = selectGlobalFilter(uiState);
  const columnFilterValues = uiState.filters.columnFilters;
  const sortState = uiState.sort;
  const activeCell = uiState.activeCell;
  const selection = uiState.selection;

  const slotContextBase = useMemo<GridSlotContextBase<T>>(
    () => ({
      rows,
      columns,
      visibleColumns,
      globalFilterText,
      columnFilterValues,
      sortState,
      activeCell,
      selection,
    }),
    [
      rows,
      columns,
      visibleColumns,
      globalFilterText,
      columnFilterValues,
      sortState,
      activeCell,
      selection,
    ],
  );

  const derivedSummary = useMemo(
    // 変更(DS-3-7): 件数 viewRowCount を明示引数で渡します(filteredRows 配列は使いません)。
    () => buildGridDerivedSummary(slotContextBase, viewRowCount),
    [slotContextBase, viewRowCount],
  );

  const slotContext = useMemo<SpreadsheetGridSlotContext<T>>(
    () => ({
      ...slotContextBase,
      // 追加(DS-3-7): 公開 filteredRows は遅延 getter。外部スロットが読んだ時だけ materialize し、
      //   getFilteredRows() 内部キャッシュで同一世代([order,rows])は参照も安定します。
      //   base には filteredRows が無いため、上の spread では materialize されません。
      get filteredRows() {
        return getFilteredRows();
      },
      setGlobalFilterText,
      derivedSummary,
      // 追加(F-async): 進捗 tick ごとに本 object のみ再生成されます(slotContextBase /
      //   derivedSummary は不変＝サマリ chips は再計算されず、トップバーの進捗表示だけ更新)。
      globalFilterStatus,
      globalFilterProgress,
    }),
    [
      derivedSummary,
      getFilteredRows,
      setGlobalFilterText,
      slotContextBase,
      globalFilterStatus,
      globalFilterProgress,
    ],
  );

  return {
    slotContextBase,
    derivedSummary,
    slotContext,
  };
};

export default useGridBarContext;