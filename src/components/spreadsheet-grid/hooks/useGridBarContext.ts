import { useMemo } from 'react';
import { selectGlobalFilter } from '../model/gridSelectors';
import type {
  GridColumn,
  GridUiState,
  SpreadsheetGridSlotContext,
} from '../model/gridTypes';
import { buildGridDerivedSummary } from '../view/gridBarHelpers';

// 追加: derivedSummary / setGlobalFilterText を載せる前の中間 slot context 型です。
type GridSlotContextBase<T> = Omit<
  SpreadsheetGridSlotContext<T>,
  'setGlobalFilterText' | 'derivedSummary'
>;

type UseGridBarContextArgs<T> = {
  rows: T[];
  filteredRows: T[];
  columns: GridColumn<T>[];
  visibleColumns: GridColumn<T>[];
  uiState: GridUiState;
  setGlobalFilterText: (value: string) => void;
};

// 追加: topBar / bottomBar へ渡す slot context と derived summary をまとめて構築します。
export const useGridBarContext = <T,>({
  rows,
  filteredRows,
  columns,
  visibleColumns,
  uiState,
  setGlobalFilterText,
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
      filteredRows,
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
      filteredRows,
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
    () => buildGridDerivedSummary(slotContextBase),
    [slotContextBase],
  );

  const slotContext = useMemo<SpreadsheetGridSlotContext<T>>(
    () => ({
      ...slotContextBase,
      setGlobalFilterText,
      derivedSummary,
    }),
    [derivedSummary, setGlobalFilterText, slotContextBase],
  );

  return {
    slotContextBase,
    derivedSummary,
    slotContext,
  };
};

export default useGridBarContext;
