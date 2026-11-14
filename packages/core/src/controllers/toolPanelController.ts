// 追加(非依存化 ③-15): 統合ツールパネル(フィルター管理 / 列の表示 / 並び替え)の開閉・配置・移動の
//   コントローラです(React 非依存。旧 hooks/useToolPanelController の本体を移設)。
//   - タブは可用性(canUse*)で解決します: 要求タブが使えなければ先頭の可用タブ、可用タブが無ければ閉。
//   - 配置は既定でグリッド root の右上(GRID_INSET)、ヘッダードラッグ後はその位置を保持して
//     ビューポート内に clamp(resize / scroll でも root 基準へ戻さない)。
//   - 開いている間: resize / scroll(capture)で再配置、外側 pointerdown で閉じる(パネル内と allied 要素
//     = フィルターポップオーバーは除外)、Escape は suppressEscape のとき onSuppressedEscape へ委譲。
import { clampPanelDragPosition } from '../logic/panelDragGeometry';
import { createValueStore } from '../logic/valueStore';
import {
  blurForPopover,
  createPopoverWindowBindings,
  isInsideGridRoot,
  restoreGridFocus,
  type ReadonlyElementRef,
} from './popoverSupport';

export type ToolPanelTab = 'filter' | 'columns' | 'sort';

export type ToolPanelLayout = {
  top: number;
  left: number;
  width: number;
  // 追加(1.0.1 / 実アプリの総点検 AP-30): 画面の中に収まる高さの上限(px)。
  maxHeight: number;
};

export type ToolPanelControllerArgs = {
  canUseFilterTab: boolean;
  canUseColumnsTab: boolean;
  canUseSortTab: boolean;
  gridRootRef: ReadonlyElementRef;
  alliedRef?: ReadonlyElementRef;
  suppressEscape?: boolean;
  onSuppressedEscape?: () => void;
};

export type ToolPanelSnapshot = {
  requestedTab: ToolPanelTab | null;
  layout: ToolPanelLayout | null;
  flashTick: number;
};

export type ToolPanelController = {
  update: (args: ToolPanelControllerArgs) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ToolPanelSnapshot;
  panelRef: { current: HTMLDivElement | null };
  open: (tab: ToolPanelTab) => void;
  close: () => void;
  move: (top: number, left: number) => void;
  dispose: () => void;
};

const PANEL_WIDTH = 360;
// パネルの高さの上限(styles.css の .ssg-toolpanel の max-height と同じ)。
export const TOOL_PANEL_MAX_HEIGHT = 420;
// 追加(1.0.1 のレビュー RB-5): パネルの最小の高さ(styles.css の .ssg-toolpanel-body の min-height 240px + ヘッダーと
//   余白の 96px)。
const TOOL_PANEL_MIN_HEIGHT = 336;
const VIEWPORT_MARGIN = 8;
const GRID_INSET = 12;
const TAB_ORDER: ToolPanelTab[] = ['filter', 'columns', 'sort'];

// 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-30): 縦の位置と高さの上限を画面に収めます。スマホの横向き(高さ 390px)では
//   グリッドの右上から max-height 420px で出して画面の下にはみ出し、下の項目と「すべての列を初期状態に戻す」に届かなかった。
//   - 既定の位置(dragged = false): 上限(420px と画面の高さ - 余白 2 つの小さいほう)が下に入らなければ上へずらす。
//   - 掴んで動かした位置(dragged = true): 位置はそのままで、下に残る高さを上限にする(中の一覧が縮んでスクロールになる)。
//     変更(1.0.1 のレビュー RB-5): 下に残る高さが最小の高さ(min(336px, 上限))に足りない位置へは下げない(本体の最小の
//     高さが枠の外へはみ出し、背景なしで表に重なっていた)。
export const resolveToolPanelVerticalPlacement = (
  top: number,
  viewportHeight: number,
  dragged: boolean,
): { top: number; maxHeight: number } => {
  const cap = Math.max(0, Math.min(TOOL_PANEL_MAX_HEIGHT, viewportHeight - VIEWPORT_MARGIN * 2));
  const needed = dragged ? Math.min(TOOL_PANEL_MIN_HEIGHT, cap) : cap;
  let nextTop = top;
  if (nextTop + needed > viewportHeight - VIEWPORT_MARGIN) {
    nextTop = Math.max(VIEWPORT_MARGIN, viewportHeight - VIEWPORT_MARGIN - needed);
  }
  const maxHeight = Math.max(0, Math.min(TOOL_PANEL_MAX_HEIGHT, viewportHeight - VIEWPORT_MARGIN - nextTop));
  return { top: nextTop, maxHeight };
};

// 表示順どおりの可用タブ。
export const resolveAvailableToolPanelTabs = (
  args: Pick<ToolPanelControllerArgs, 'canUseFilterTab' | 'canUseColumnsTab' | 'canUseSortTab'>,
): ToolPanelTab[] => {
  const flags: Record<ToolPanelTab, boolean> = {
    filter: args.canUseFilterTab,
    columns: args.canUseColumnsTab,
    sort: args.canUseSortTab,
  };
  return TAB_ORDER.filter((tab) => flags[tab]);
};

// 要求タブ → 実際に表示するタブ(null = 閉)。
export const resolveActiveToolPanelTab = (
  requestedTab: ToolPanelTab | null,
  availableTabs: ToolPanelTab[],
): ToolPanelTab | null =>
  requestedTab === null
    ? null
    : availableTabs.includes(requestedTab)
      ? requestedTab
      : (availableTabs[0] ?? null);

export const createToolPanelController = (): ToolPanelController => {
  let args: ToolPanelControllerArgs | null = null;
  const store = createValueStore<ToolPanelSnapshot>({ requestedTab: null, layout: null, flashTick: 0 });
  const panelRef: { current: HTMLDivElement | null } = { current: null };
  let draggedPosition: { top: number; left: number } | null = null;

  const patch = (next: Partial<ToolPanelSnapshot>) => {
    store.setSnapshot({ ...store.getSnapshot(), ...next });
  };
  const setLayout = (next: ToolPanelLayout | null) => {
    const prev = store.getSnapshot().layout;
    if (
      prev === next ||
      (prev !== null &&
        next !== null &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.maxHeight === next.maxHeight)
    ) {
      return;
    }
    patch({ layout: next });
  };

  const clampDragged = (position: { top: number; left: number }) =>
    clampPanelDragPosition({
      top: position.top,
      left: position.left,
      panelWidth: PANEL_WIDTH,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });

  const draggedLayout = (clamped: { top: number; left: number }): ToolPanelLayout => {
    const vertical = resolveToolPanelVerticalPlacement(clamped.top, window.innerHeight, true);
    return { top: vertical.top, left: clamped.left, width: PANEL_WIDTH, maxHeight: vertical.maxHeight };
  };

  const updateLayout = () => {
    if (draggedPosition) {
      setLayout(draggedLayout(clampDragged(draggedPosition)));
      return;
    }
    const root = args?.gridRootRef.current ?? null;
    if (!root) {
      setLayout(null);
      return;
    }
    const rect = root.getBoundingClientRect();
    let left = rect.right - PANEL_WIDTH - GRID_INSET;
    let top = rect.top + GRID_INSET;
    left = Math.max(VIEWPORT_MARGIN, left);
    left = Math.min(left, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN);
    top = Math.max(VIEWPORT_MARGIN, top);
    const vertical = resolveToolPanelVerticalPlacement(top, window.innerHeight, false);
    setLayout({ top: vertical.top, left, width: PANEL_WIDTH, maxHeight: vertical.maxHeight });
  };

  const isOpen = () =>
    args !== null &&
    resolveActiveToolPanelTab(
      store.getSnapshot().requestedTab,
      resolveAvailableToolPanelTabs(args),
    ) !== null;

  const closeWith = (restoreFocus: boolean) => {
    patch({ requestedTab: null, layout: null });
    syncOpenState();
    if (args !== null && restoreFocus) {
      restoreGridFocus(args.gridRootRef);
    }
  };
  const close = () => closeWith(true);

  const bindings = createPopoverWindowBindings({
    onResize: updateLayout,
    onScroll: updateLayout,
    isInside: (target) =>
      panelRef.current?.contains(target) === true ||
      args?.alliedRef?.current?.contains(target) === true,
    // グリッド外を押して閉じたときは押下先にフォーカスを残します(監査 C-3)。
    onOutsidePointerDown: (target) =>
      closeWith(args !== null && isInsideGridRoot(args.gridRootRef, target)),
    // 追加(段階 2 DF-23): グリッドが隠れたら閉じます(隠れたグリッドへフォーカスは戻さない)。
    getGridRoot: () => args?.gridRootRef.current ?? null,
    onGridHidden: () => closeWith(false),
    onKeyDown: (event) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (args?.suppressEscape) {
        args.onSuppressedEscape?.();
        return;
      }
      event.preventDefault();
      close();
    },
  });

  // 開閉状態(可用性の変化を含む)とリスナーの付け外しを同期します(旧 effect [isToolPanelOpen] 相当)。
  const syncOpenState = () => {
    const open = isOpen();
    if (open && !bindings.isAttached()) {
      updateLayout();
      bindings.attach();
    } else if (!open && bindings.isAttached()) {
      bindings.detach();
    }
  };

  const open = (tab: ToolPanelTab) => {
    if (args === null || !resolveAvailableToolPanelTabs(args).includes(tab)) {
      return;
    }
    const current = store.getSnapshot();
    blurForPopover(args.gridRootRef.current);
    patch({
      requestedTab: tab,
      // 既に開いているときの再 open はパネル枠をフラッシュ(tick を進める)。
      flashTick: current.requestedTab !== null ? current.flashTick + 1 : current.flashTick,
    });
    syncOpenState();
  };

  const move = (top: number, left: number) => {
    const clamped = clampDragged({ top, left });
    draggedPosition = clamped;
    patch({ layout: draggedLayout(clamped) });
  };

  return {
    update: (next) => {
      args = next;
      syncOpenState();
    },
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    panelRef,
    open,
    close,
    move,
    dispose: () => {
      bindings.detach();
    },
  };
};