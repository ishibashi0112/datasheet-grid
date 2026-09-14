// 変更(非依存化 ③-15): 本体は controllers/toolPanelController.ts(React 非依存)へ移設し、本 hook は
//   useController で最新 args を渡し、useSyncExternalStore で要求タブ / 配置 / フラッシュ tick を購読する
//   薄いアダプタです。可用タブと実タブの解決は純関数を useMemo で呼びます。返り値の形は従来どおり。
import { useMemo, useSyncExternalStore, type RefObject } from 'react';
import {
  createToolPanelController,
  resolveActiveToolPanelTab,
  resolveAvailableToolPanelTabs,
  type ToolPanelLayout,
  type ToolPanelTab,
} from '@ishibashi0112/spreadsheet-grid-core/controllers/toolPanelController';
import { useController } from './useController';

export type { ToolPanelLayout, ToolPanelTab } from '@ishibashi0112/spreadsheet-grid-core/controllers/toolPanelController';

type UseToolPanelControllerArgs = {
  canUseFilterTab: boolean;
  canUseColumnsTab: boolean;
  canUseSortTab: boolean;
  gridRootRef: RefObject<HTMLDivElement | null>;
  alliedRef?: RefObject<HTMLDivElement | null>;
  suppressEscape?: boolean;
  onSuppressedEscape?: () => void;
};

export const useToolPanelController = (args: UseToolPanelControllerArgs) => {
  const controller = useController(createToolPanelController, args);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { canUseFilterTab, canUseColumnsTab, canUseSortTab } = args;
  const availableToolPanelTabs = useMemo(
    () => resolveAvailableToolPanelTabs({ canUseFilterTab, canUseColumnsTab, canUseSortTab }),
    [canUseFilterTab, canUseColumnsTab, canUseSortTab],
  );
  const activeToolPanelTab: ToolPanelTab | null = resolveActiveToolPanelTab(
    snapshot.requestedTab,
    availableToolPanelTabs,
  );
  const toolPanelLayout: ToolPanelLayout | null = snapshot.layout;
  return {
    activeToolPanelTab,
    availableToolPanelTabs,
    toolPanelLayout,
    toolPanelFlashTick: snapshot.flashTick,
    toolPanelRef: controller.panelRef,
    openToolPanel: controller.open,
    closeToolPanel: controller.close,
    moveToolPanel: controller.move,
  };
};

export default useToolPanelController;