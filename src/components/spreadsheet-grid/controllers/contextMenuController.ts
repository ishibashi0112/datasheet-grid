// 追加(非依存化 ③-13): セル / 行のコンテキストメニュー(完全カスタム項目)の開閉と配置のコントローラです
//   (React 非依存。旧 hooks/useCellContextMenuController の本体を移設)。
//   - open(params, items): フォーカスを外し、右クリック位置をアンカーに配置を決め、window リスナーを付ける。
//   - close(): 状態を消し、リスナーを外し、rAF でグリッド root へフォーカスを戻す。
//   - 開いている間: resize で再配置、scroll(capture)/ 外側 pointerdown / Escape で閉じる。
//   - パネル要素は panelRef({ current })で受け取り、外側判定に使います(view が ref に渡します)。
import type { GridContextMenuItem, GridContextMenuParams } from '../model/gridTypes';
import { createValueStore } from '../logic/valueStore';
import {
  blurForPopover,
  createPopoverWindowBindings,
  restoreGridFocus,
  type ReadonlyElementRef,
} from './popoverSupport';

export type CellContextMenuLayout = {
  top: number;
  left: number;
  width: number;
};

export type CellContextMenuState<T> = {
  params: GridContextMenuParams<T>;
  items: GridContextMenuItem[];
};

export type ContextMenuSnapshot<T> = {
  state: CellContextMenuState<T> | null;
  layout: CellContextMenuLayout | null;
};

export type ContextMenuControllerArgs = {
  gridRootRef: ReadonlyElementRef;
};

export type ContextMenuController<T> = {
  update: (args: ContextMenuControllerArgs) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ContextMenuSnapshot<T>;
  panelRef: { current: HTMLDivElement | null };
  open: (params: GridContextMenuParams<T>, items: GridContextMenuItem[]) => void;
  close: () => void;
  dispose: () => void;
};

const MENU_WIDTH = 220;
const VIEWPORT_MARGIN = 8;
// 実測前の見積もり(項目高さ × 件数 + パネルの上下 padding)。
const ESTIMATED_ITEM_HEIGHT = 34;
const PANEL_VPAD = 16;

export const createContextMenuController = <T,>(): ContextMenuController<T> => {
  let args: ContextMenuControllerArgs | null = null;
  const store = createValueStore<ContextMenuSnapshot<T>>({ state: null, layout: null });
  const panelRef: { current: HTMLDivElement | null } = { current: null };
  let anchorPoint: { x: number; y: number } | null = null;
  let itemCount = 0;

  const setLayout = (next: CellContextMenuLayout | null) => {
    const current = store.getSnapshot();
    if (
      current.layout === next ||
      (current.layout !== null &&
        next !== null &&
        current.layout.top === next.top &&
        current.layout.left === next.left &&
        current.layout.width === next.width)
    ) {
      return;
    }
    store.setSnapshot({ ...current, layout: next });
  };

  const updateLayout = () => {
    if (!anchorPoint) {
      setLayout(null);
      return;
    }
    const estimatedHeight = itemCount * ESTIMATED_ITEM_HEIGHT + PANEL_VPAD;
    let left = anchorPoint.x;
    let top = anchorPoint.y;
    const flipTop = anchorPoint.y - estimatedHeight;
    left = Math.max(VIEWPORT_MARGIN, left);
    left = Math.min(left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);
    // 下にはみ出すなら上へ反転。
    if (top + estimatedHeight > window.innerHeight - VIEWPORT_MARGIN) {
      top = flipTop;
    }
    top = Math.max(VIEWPORT_MARGIN, top);
    setLayout({ top, left, width: MENU_WIDTH });
  };

  const close = () => {
    store.setSnapshot({ state: null, layout: null });
    anchorPoint = null;
    itemCount = 0;
    bindings.detach();
    if (args !== null) {
      restoreGridFocus(args.gridRootRef);
    }
  };

  const bindings = createPopoverWindowBindings({
    onResize: updateLayout,
    onScroll: close,
    isInside: (target) => panelRef.current?.contains(target) === true,
    onOutsidePointerDown: close,
    onKeyDown: (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    },
  });

  const open = (params: GridContextMenuParams<T>, items: GridContextMenuItem[]) => {
    blurForPopover(args?.gridRootRef.current ?? null);
    anchorPoint = { x: params.clientX, y: params.clientY };
    itemCount = items.length;
    store.setSnapshot({ ...store.getSnapshot(), state: { params, items } });
    updateLayout();
    bindings.attach();
  };

  return {
    update: (next) => {
      args = next;
    },
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    panelRef,
    open,
    close,
    dispose: () => {
      bindings.detach();
    },
  };
};