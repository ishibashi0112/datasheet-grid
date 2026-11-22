// 追加(非依存化 ③-13): セル / 行のコンテキストメニュー(完全カスタム項目)の開閉と配置のコントローラです
//   (React 非依存。旧 hooks/useCellContextMenuController の本体を移設)。
//   - open(params, items): フォーカスを外し、右クリック位置をアンカーに配置を決め、window リスナーを付ける。
//   - close(): 状態を消し、リスナーを外し、rAF でグリッド root へフォーカスを戻す。
//   - 開いている間: resize で再配置、scroll(capture)/ 外側 pointerdown / Escape で閉じる。
//   - パネル要素は panelRef({ current })で受け取り、外側判定に使います(view が ref に渡します)。
import type { GridContextMenuItem, GridContextMenuParams } from '../model/gridTypes.unbound';
import { createValueStore } from '../logic/valueStore';
import {
  blurForPopover,
  focusPanelIfIdle,
  handleMenuKeyNavigation,
  createPopoverWindowBindings,
  isInsideGridRoot,
  restoreGridFocus,
  type ReadonlyElementRef,
} from './popoverSupport';
import { getActiveElement } from '../utils/shadowDom';

export type CellContextMenuLayout = {
  top: number;
  left: number;
  width: number;
  // 追加(1.2.0 の見直し QH-2): 上にも下にも収まらないときの高さの上限(view が overflow: auto で付ける)。収まるときは undefined。
  maxHeight?: number | undefined;
};

export type CellContextMenuState<T> = {
  params: GridContextMenuParams<T>;
  items: GridContextMenuItem[];
};

export type ContextMenuSnapshot<T> = {
  state: CellContextMenuState<T> | null;
  layout: CellContextMenuLayout | null;
};

export type ContextMenuOpenOptions = {
  focus?: 'panel' | 'firstItem';
};

export type ContextMenuControllerArgs = {
  gridRootRef: ReadonlyElementRef;
};

export type ContextMenuController<T> = {
  update: (args: ContextMenuControllerArgs) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ContextMenuSnapshot<T>;
  panelRef: { current: HTMLDivElement | null };
  // 変更(1.1.0 / 2026-11-09 実アプリの総点検 AP-33): focus = 開いた後のフォーカスの置き場所。'panel'(既定。右クリック)はパネル
  //   (↓ で先頭、↑ で末尾の項目へ)、'firstItem'(キーボードの Shift+F10 / メニューキー)は先頭の使える項目。
  open: (params: GridContextMenuParams<T>, items: GridContextMenuItem[], options?: ContextMenuOpenOptions) => void;
  close: () => void;
  dispose: () => void;
};

const MENU_WIDTH = 220;
const VIEWPORT_MARGIN = 8;
// 実測前の見積もり(項目高さ × 件数 + パネルの上下 padding)。
// 変更(1.2.0 の見直し QH-2): 開いた後(次のフレーム)にパネルの実高で置き直します(タッチが主の端末は項目が 44px になり、
//   34px の見積もりのままだと下の項目が画面の外へ出ていた。項目の custom / 区切り / 見出しも高さが違う)。
const ESTIMATED_ITEM_HEIGHT = 34;
const PANEL_VPAD = 16;

export const createContextMenuController = <T,>(): ContextMenuController<T> => {
  let args: ContextMenuControllerArgs | null = null;
  const store = createValueStore<ContextMenuSnapshot<T>>({ state: null, layout: null });
  const panelRef: { current: HTMLDivElement | null } = { current: null };
  let anchorPoint: { x: number; y: number } | null = null;
  let itemCount = 0;
  let focusFrame: number | null = null;
  const cancelFocusFrame = () => {
    if (focusFrame !== null) {
      cancelAnimationFrame(focusFrame);
      focusFrame = null;
    }
  };

  const setLayout = (next: CellContextMenuLayout | null) => {
    const current = store.getSnapshot();
    if (
      current.layout === next ||
      (current.layout !== null &&
        next !== null &&
        current.layout.top === next.top &&
        current.layout.left === next.left &&
        current.layout.width === next.width &&
        current.layout.maxHeight === next.maxHeight)
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
    const panel = panelRef.current;
    const menuHeight = panel
      ? panel.scrollHeight + (panel.offsetHeight - panel.clientHeight)
      : itemCount * ESTIMATED_ITEM_HEIGHT + PANEL_VPAD;
    let left = anchorPoint.x;
    let top = anchorPoint.y;
    const flipTop = anchorPoint.y - menuHeight;
    left = Math.max(VIEWPORT_MARGIN, left);
    left = Math.min(left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);
    const viewportBottom = window.innerHeight - VIEWPORT_MARGIN;
    // 下にはみ出すなら上へ反転。上にも収まらないときは、広い方(下から始めて上端へ寄せる)に置いて高さを抑えます。
    if (top + menuHeight > viewportBottom) {
      top = flipTop;
    }
    top = Math.max(VIEWPORT_MARGIN, top);
    const availableHeight = viewportBottom - top;
    const maxHeight = menuHeight > availableHeight ? Math.max(availableHeight, 0) : undefined;
    setLayout({ top, left, width: MENU_WIDTH, maxHeight });
  };

  const closeWith = (restoreFocus: boolean) => {
    cancelFocusFrame();
    store.setSnapshot({ state: null, layout: null });
    anchorPoint = null;
    itemCount = 0;
    bindings.detach();
    if (args !== null && restoreFocus) {
      restoreGridFocus(args.gridRootRef);
    }
  };
  const close = () => closeWith(true);

  const bindings = createPopoverWindowBindings({
    onResize: updateLayout,
    onScroll: close,
    isInside: (target) => panelRef.current?.contains(target) === true,
    // グリッド外を押して閉じたときは押下先にフォーカスを残します(監査 C-3)。
    onOutsidePointerDown: (target) =>
      closeWith(args !== null && isInsideGridRoot(args.gridRootRef, target)),
    // 追加(段階 2 DF-23): グリッドが隠れたら閉じます(隠れたグリッドへフォーカスは戻さない)。
    getGridRoot: () => args?.gridRootRef.current ?? null,
    onGridHidden: () => closeWith(false),
    // 追加(1.3.0 / S6-21): 別のグリッドのポップアップが開いたら閉じます(押した先にフォーカスを残す)。
    onOtherGridPopupOpen: () => closeWith(false),
    onKeyDown: (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      // 追加(dogfood DF-17): ↓ / ↑ / Home / End で項目を移る(Enter / Space で実行)。Tab はメニューを閉じてグリッドへ戻る。
      const panel = panelRef.current;
      if (!panel || handleMenuKeyNavigation(panel, event)) {
        return;
      }
      if (event.key === 'Tab') {
        const active = getActiveElement(panel);
        if (
          !(active instanceof HTMLElement && panel.contains(active)) ||
          active === panel ||
          active.getAttribute('role') === 'menuitem'
        ) {
          event.preventDefault();
          close();
        }
      }
    },
  });

  const open = (params: GridContextMenuParams<T>, items: GridContextMenuItem[], options?: ContextMenuOpenOptions) => {
    blurForPopover(args?.gridRootRef.current ?? null);
    anchorPoint = { x: params.clientX, y: params.clientY };
    itemCount = items.length;
    store.setSnapshot({ ...store.getSnapshot(), state: { params, items } });
    updateLayout();
    bindings.attach();
    // 追加(1.1.0 / AP-33): 描かれた後(次のフレーム)にフォーカスを移します。それまでに ↓ などで項目へ移っていれば何もしません。
    cancelFocusFrame();
    const focusMode = options?.focus ?? 'panel';
    focusFrame = requestAnimationFrame(() => {
      focusFrame = null;
      // 追加(1.2.0 の見直し QH-2): 描かれたパネルの実高で置き直します。
      updateLayout();
      const panel = panelRef.current;
      if (panel === null || panel.contains(getActiveElement(panel))) {
        return;
      }
      if (focusMode === 'firstItem') {
        const first = panel.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled):not([aria-disabled="true"])');
        if (first !== null) {
          first.focus({ preventScroll: true });
          return;
        }
      }
      focusPanelIfIdle(panel, args?.gridRootRef.current ?? null);
    });
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
      cancelFocusFrame();
      bindings.detach();
    },
  };
};