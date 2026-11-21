// ツールパネル(フィルター / 列 / 並び替えの 3 タブ。機能 features/toolPanel)のコントローラを Solid へつなぎます。React 版の
//   hooks/useToolPanelController.ts + features/toolPanel.ts の useToolPanel にあたるものです。中身は core の
//   controllers/toolPanelController(表の右上に置く、ヘッダーを掴んで動かした位置を覚える、外側の押下・Escape・グリッドが
//   隠れたときに閉じる、閉じたら開いた所へフォーカスを戻す、開いたまま開き直したら枠を光らせる)。
//   - 使えるタブは機能のフラグで決まります(フィルター = enableColumnFilter / 列 = enableColumnMenu / 並び替え = enableSorting)。
//   - 列フィルターのポップオーバーとの共存: ポップオーバーの中の押下では閉じず(alliedRef)、ポップオーバーが開いている間の
//     Escape はポップオーバーを閉じる(1 回目 = ポップオーバー / 2 回目 = パネル)。
import { createMemo } from 'solid-js';
import {
  createToolPanelController,
  resolveActiveToolPanelTab,
  resolveAvailableToolPanelTabs,
  type ToolPanelController,
  type ToolPanelLayout,
  type ToolPanelTab,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/toolPanelController';
import { connectController } from './controller';
import { createExternalStoreSignal } from './externalStore';

type ElementRef = { readonly current: HTMLDivElement | null };

export type ToolPanelInputs = {
  canUseFilterTab: () => boolean;
  canUseColumnsTab: () => boolean;
  canUseSortTab: () => boolean;
  gridRootRef: ElementRef;
  // 列フィルターのポップオーバーのパネル(無ければ undefined)。
  alliedRef?: ElementRef | undefined;
  // 列フィルターのポップオーバーが開いているか / そのときの Escape。
  suppressEscape: () => boolean;
  onSuppressedEscape: () => void;
};

export type ToolPanel = {
  // 開いているタブ(閉じていれば null。頼まれたタブが使えなければ使える最初のタブ)。
  activeTab: () => ToolPanelTab | null;
  // 使えるタブ(表示の順)。
  availableTabs: () => ToolPanelTab[];
  layout: () => ToolPanelLayout | null;
  // 開いたまま開き直した回数(増えたら枠を光らせる)。
  flashTick: () => number;
  // パネルの要素(外側の押下の判定。部品が渡す)。
  panelRef: ToolPanelController['panelRef'];
  open: ToolPanelController['open'];
  close: ToolPanelController['close'];
  move: ToolPanelController['move'];
};

const sameTabs = (a: ToolPanelTab[], b: ToolPanelTab[]): boolean =>
  a.length === b.length && a.every((tab, index) => tab === b[index]);

export function createToolPanel(inputs: ToolPanelInputs): ToolPanel {
  const controller = createToolPanelController();
  connectController(controller, () => ({
    canUseFilterTab: inputs.canUseFilterTab(),
    canUseColumnsTab: inputs.canUseColumnsTab(),
    canUseSortTab: inputs.canUseSortTab(),
    gridRootRef: inputs.gridRootRef,
    ...(inputs.alliedRef ? { alliedRef: inputs.alliedRef } : {}),
    suppressEscape: inputs.suppressEscape(),
    onSuppressedEscape: inputs.onSuppressedEscape,
  }), 'render', 'toolPanel');
  const snapshot = createExternalStoreSignal(controller, 'toolPanelStore');
  const availableTabs = createMemo(
    () =>
      resolveAvailableToolPanelTabs({
        canUseFilterTab: inputs.canUseFilterTab(),
        canUseColumnsTab: inputs.canUseColumnsTab(),
        canUseSortTab: inputs.canUseSortTab(),
      }),
    { equals: sameTabs },
  );
  return {
    activeTab: createMemo(() => resolveActiveToolPanelTab(snapshot().requestedTab, availableTabs())),
    availableTabs,
    layout: createMemo(() => snapshot().layout),
    flashTick: createMemo(() => snapshot().flashTick),
    panelRef: controller.panelRef,
    open: controller.open,
    close: controller.close,
    move: controller.move,
  };
}