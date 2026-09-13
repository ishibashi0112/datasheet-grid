// 変更(非依存化 ③-13): 本体は controllers/contextMenuController.ts(React 非依存)へ移設し、本 hook は
//   useController で gridRootRef を渡し、useSyncExternalStore で開閉状態と配置を購読する薄いアダプタです。
//   返り値の形(contextMenuState / contextMenuLayout / contextMenuRef / isContextMenuOpen / open / close)は
//   従来どおり。
import { useSyncExternalStore, type RefObject } from 'react';
import {
  createContextMenuController,
  type CellContextMenuLayout,
} from '../controllers/contextMenuController';
import { useController } from './useController';

export type { CellContextMenuLayout } from '../controllers/contextMenuController';

type UseCellContextMenuControllerArgs = {
  gridRootRef: RefObject<HTMLDivElement | null>;
};

export const useCellContextMenuController = <T,>({
  gridRootRef,
}: UseCellContextMenuControllerArgs) => {
  const controller = useController(() => createContextMenuController<T>(), {
    gridRootRef,
  });
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const layout: CellContextMenuLayout | null = snapshot.layout;
  return {
    contextMenuState: snapshot.state,
    contextMenuLayout: layout,
    contextMenuRef: controller.panelRef,
    isContextMenuOpen: snapshot.state !== null,
    openContextMenu: controller.open,
    closeContextMenu: controller.close,
  };
};

export default useCellContextMenuController;