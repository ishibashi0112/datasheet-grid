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
  const slotContextBase = useMemo<GridSlotContextBase<T>>(
    () => ({
      rows,
      filteredRows,
      columns,
      visibleColumns,
      globalFilterText: selectGlobalFilter(uiState),
      columnFilterValues: uiState.filters.columnFilters,
      sortState: uiState.sort,
      activeCell: uiState.activeCell,
      selection: uiState.selection,
    }),
    [rows, filteredRows, columns, visibleColumns, uiState],
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