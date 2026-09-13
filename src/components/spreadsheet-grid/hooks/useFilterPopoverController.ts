// 変更(非依存化 ③-16): 本体は controllers/filterPopoverController.ts(React 非依存)へ移設し、本 hook は
//   useController で最新 args を渡し、useSyncExternalStore で開閉状態 / ドラフト / 配置を購読する薄い
//   アダプタです。開いている列(openedFilterColumn)は純関数を useMemo で呼びます。返り値の形は従来どおり。
import { useMemo, useSyncExternalStore, type RefObject } from 'react';
import type { ColumnFilterUiType, ColumnFilterValue, GridColumn } from '../model/gridTypes';
import {
  createFilterPopoverController,
  resolveOpenedFilterColumn,
  type FilterPopoverLayout,
} from '../controllers/filterPopoverController';
import { useController } from './useController';

export type { FilterPopoverLayout } from '../controllers/filterPopoverController';

type UseFilterPopoverControllerArgs<T> = {
  visibleColumns: GridColumn<T>[];
  columnFilterValues: Record<string, ColumnFilterValue>;
  enableColumnFilter: boolean;
  gridRootRef: RefObject<HTMLDivElement | null>;
  resolveColumnFilterType?: (column: GridColumn<T>) => ColumnFilterUiType;
};

export const useFilterPopoverController = <T,>(args: UseFilterPopoverControllerArgs<T>) => {
  const controller = useController(() => createFilterPopoverController<T>(), args);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { visibleColumns } = args;
  const filterPopoverState = snapshot.state;
  const openedFilterColumn = useMemo(
    () => resolveOpenedFilterColumn(visibleColumns, filterPopoverState),
    [visibleColumns, filterPopoverState],
  );
  const filterPopoverLayout: FilterPopoverLayout | null = snapshot.layout;
  return {
    filterPopoverState,
    filterPopoverLayout,
    filterPopoverRef: controller.panelRef,
    filterTextInputRef: controller.textInputRef,
    filterSelectRef: controller.selectRef,
    isFilterPopoverOpen: filterPopoverState !== null,
    openedFilterColumn,
    openedFilterType: filterPopoverState?.filterType ?? null,
    openColumnFilterPopover: controller.open,
    closeColumnFilterPopover: controller.close,
    updateFilterPopoverDraft: controller.updateDraft,
    updateFilterPopoverNumberDraft: controller.updateNumberDraft,
    updateFilterPopoverTextDraft: controller.updateTextDraft,
    updateFilterPopoverDateDraft: controller.updateDateDraft,
  };
};

export default useFilterPopoverController;