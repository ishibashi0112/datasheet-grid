// 変更(非依存化 ③-14): 本体は controllers/columnMenuController.ts(React 非依存)へ移設し、本 hook は
//   useController で最新 args を渡し、useSyncExternalStore で開閉状態と配置を購読する薄いアダプタです。
//   開いている列(openedMenuColumn)は純粋な検索なので useMemo で求めます。返り値の形は従来どおり。
import { useMemo, useSyncExternalStore, type RefObject } from 'react';
import type { GridColumn } from '../model/gridTypes';
import {
  createColumnMenuController,
  type ColumnMenuLayout,
} from '@ishibashi0112/spreadsheet-grid-core/controllers/columnMenuController';
import { useController } from './useController';

export type { ColumnMenuLayout } from '@ishibashi0112/spreadsheet-grid-core/controllers/columnMenuController';

export type UseColumnMenuControllerArgs<T> = {
  visibleColumns: GridColumn<T>[];
  enableColumnMenu: boolean;
  gridRootRef: RefObject<HTMLDivElement | null>;
};

export const useColumnMenuController = <T,>(args: UseColumnMenuControllerArgs<T>) => {
  const controller = useController(() => createColumnMenuController<T>(), args);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const openedMenuColumnKey = snapshot.columnKey;
  const { visibleColumns } = args;
  const openedMenuColumn = useMemo(
    () =>
      openedMenuColumnKey
        ? (visibleColumns.find((column) => column.key === openedMenuColumnKey) ?? null)
        : null,
    [openedMenuColumnKey, visibleColumns],
  );
  const columnMenuLayout: ColumnMenuLayout | null = snapshot.layout;
  return {
    columnMenuLayout,
    columnMenuRef: controller.panelRef,
    isColumnMenuOpen: openedMenuColumnKey !== null,
    openedMenuColumnKey,
    openedMenuColumn,
    openColumnMenuFromButton: controller.openFromButton,
    openColumnMenuFromButtonClick: controller.openFromButtonClick,
    openColumnMenuFromContextMenu: controller.openFromContextMenu,
    closeColumnMenu: controller.close,
  };
};

// 追加(差し込み式 段階 3): 列メニューの機能(features/columnMenu)が返す値の型に使います。
export type UseColumnMenuControllerResult<T> = ReturnType<typeof useColumnMenuController<T>>;

export default useColumnMenuController;