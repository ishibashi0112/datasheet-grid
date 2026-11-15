// 追加(非依存化 ③-14): 列メニュー(ヘッダーの ⋮ / 右クリック)の開閉と配置のコントローラです
//   (React 非依存。旧 hooks/useColumnMenuController の本体を移設)。
//   - アンカーは「ボタン要素」(⋮ から開く。配置はボタン矩形基準、消えたら閉じる)または「座標」
//     (右クリック。スクロールで閉じる)。
//   - 開いている間: resize / scroll で再配置(座標アンカーの scroll は閉じる)、外側 pointerdown / Escape で
//     閉じる。パネルの実高は panelRef の scrollHeight から取り、開いた直後の rAF で再測定します。
//   - タッチは pointerdown では開かず、同じボタンの click で開きます(タッチの pointerdown → click の
//     順序で二重に開かないため)。
//   - イベントは構造的型で受けます(React 合成イベント / ネイティブどちらも可)。
import type { GridColumn } from '../model/gridTypes.unbound';
import { createValueStore } from '../logic/valueStore';
import {
  blurForPopover,
  createPopoverWindowBindings,
  handleMenuKeyNavigation,
  isInsideGridRoot,
  restoreGridFocus,
  type ReadonlyElementRef,
} from './popoverSupport';

export type ColumnMenuLayout = {
  top: number;
  left: number;
  width: number;
  maxHeight?: number;
};

export type ColumnMenuSnapshot = {
  columnKey: string | null;
  layout: ColumnMenuLayout | null;
};

export type ColumnMenuControllerArgs<T> = {
  visibleColumns: GridColumn<T>[];
  enableColumnMenu: boolean;
  gridRootRef: ReadonlyElementRef;
};

export type MenuButtonPointerEvent = {
  button: number;
  pointerType: string;
  currentTarget: HTMLButtonElement;
  preventDefault: () => void;
  stopPropagation: () => void;
};
export type MenuButtonClickEvent = {
  currentTarget: HTMLButtonElement;
  // 追加(別視点のレビュー): 0 ならキーボード / 支援技術からの click(ポインタの押下を伴わない)。
  detail: number;
  preventDefault: () => void;
  stopPropagation: () => void;
};
export type MenuContextEvent = {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
  stopPropagation: () => void;
};

export type ColumnMenuController<T> = {
  update: (args: ColumnMenuControllerArgs<T>) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ColumnMenuSnapshot;
  panelRef: { current: HTMLDivElement | null };
  openFromButton: (column: GridColumn<T>, event: MenuButtonPointerEvent) => void;
  openFromButtonClick: (column: GridColumn<T>, event: MenuButtonClickEvent) => void;
  openFromContextMenu: (column: GridColumn<T>, event: MenuContextEvent) => void;
  // 追加(別視点のレビュー): キーボード(アクティブセルの Alt+↓)で開きます。anchor は列の見出しのセル(その下に出す)。
  //   開いた後に先頭の項目へフォーカスを移します。
  openFromKeyboard: (column: GridColumn<T>, anchor: HTMLElement) => void;
  close: () => void;
  dispose: () => void;
};

// 変更(1.0.2 / 2026-11-09 実アプリの総点検 H-10): 200 → 220px。日本語の「すべての列の幅を自動調整」(12 字)が 2 行に
//   折り返し、その項目だけ高さが 44px になっていました(右クリックメニューと同じ幅)。
const MENU_WIDTH = 220;
// 追加(別視点のレビュー): キーボードで移る項目(列メニューの項目は role を持たないのでクラスで探す)。
const COLUMN_MENU_ITEM = '.ssg-menu-item';
const VIEWPORT_MARGIN = 8;
const OFFSET_Y = 6;
// パネル実測前の見積もり高さ(全項目表示時)。
const ESTIMATED_MENU_HEIGHT = 289;

export const createColumnMenuController = <T,>(): ColumnMenuController<T> => {
  let args: ColumnMenuControllerArgs<T> | null = null;
  const store = createValueStore<ColumnMenuSnapshot>({ columnKey: null, layout: null });
  const panelRef: { current: HTMLDivElement | null } = { current: null };
  let anchorButton: HTMLElement | null = null;
  // 追加(別視点のレビュー): キーボードで開いたとき、開いた後(実高を測る rAF)に先頭の項目へフォーカスを移す印。
  let focusFirstItem = false;
  let anchorPoint: { x: number; y: number } | null = null;
  let touchPendingAnchor: HTMLButtonElement | null = null;
  let measureFrame: number | null = null;

  const setLayout = (next: ColumnMenuLayout | null) => {
    const current = store.getSnapshot();
    const prev = current.layout;
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
    store.setSnapshot({ ...current, layout: next });
  };

  // 状態を消してリスナーを外します(フォーカス復帰なし。アンカー消失時と dispose で使用)。
  const clearOpenState = () => {
    if (measureFrame !== null) {
      cancelAnimationFrame(measureFrame);
      measureFrame = null;
    }
    bindings.detach();
    store.setSnapshot({ columnKey: null, layout: null });
  };

  const updateLayout = () => {
    if (store.getSnapshot().columnKey === null) {
      setLayout(null);
      return;
    }
    let top: number;
    let left: number;
    let flipTop: number;
    const panel = panelRef.current;
    const menuHeight = panel
      ? panel.scrollHeight + (panel.offsetHeight - panel.clientHeight)
      : ESTIMATED_MENU_HEIGHT;

    if (anchorButton) {
      if (!anchorButton.isConnected) {
        // アンカーのボタンが消えた(列の非表示 / 仮想化のアンマウント等)→ 閉じる(フォーカス復帰なし)。
        anchorButton = null;
        clearOpenState();
        return;
      }
      const anchorRect = anchorButton.getBoundingClientRect();
      left = anchorRect.right - MENU_WIDTH;
      top = anchorRect.bottom + OFFSET_Y;
      flipTop = anchorRect.top - menuHeight - OFFSET_Y;
    } else if (anchorPoint) {
      left = anchorPoint.x;
      top = anchorPoint.y;
      flipTop = anchorPoint.y - menuHeight;
    } else {
      setLayout(null);
      return;
    }

    left = Math.max(VIEWPORT_MARGIN, left);
    left = Math.min(left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);
    const viewportBottom = window.innerHeight - VIEWPORT_MARGIN;
    if (top + menuHeight > viewportBottom && flipTop >= VIEWPORT_MARGIN) {
      top = flipTop;
    }
    top = Math.max(VIEWPORT_MARGIN, top);
    const availableHeight = viewportBottom - top;
    const maxHeight =
      menuHeight > availableHeight ? Math.max(availableHeight, 0) : undefined;
    setLayout({ top, left, width: MENU_WIDTH, maxHeight });
  };

  const closeWith = (restoreFocus: boolean) => {
    clearOpenState();
    anchorButton = null;
    anchorPoint = null;
    if (args !== null && restoreFocus) {
      restoreGridFocus(args.gridRootRef);
    }
  };
  const close = () => closeWith(true);

  const bindings = createPopoverWindowBindings({
    onResize: updateLayout,
    onScroll: () => {
      if (anchorPoint) {
        close();
        return;
      }
      updateLayout();
    },
    isInside: (target) =>
      panelRef.current?.contains(target) === true ||
      anchorButton?.contains(target) === true,
    // グリッド外を押して閉じたときは押下先にフォーカスを残します(監査 C-3)。
    onOutsidePointerDown: (target) =>
      closeWith(args !== null && isInsideGridRoot(args.gridRootRef, target)),
    // 追加(段階 2 DF-23): グリッドが隠れたら閉じます(隠れたグリッドへフォーカスは戻さない)。
    getGridRoot: () => args?.gridRootRef.current ?? null,
    onGridHidden: () => closeWith(false),
    onKeyDown: (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      // 追加(別視点のレビュー): ↓ / ↑ / Home / End で項目を移る(Enter / Space で実行。右クリックメニューと同じ)。
      //   項目にフォーカスがあるときの Tab はメニューを閉じてグリッドへ戻ります。
      const panel = panelRef.current;
      if (!panel || handleMenuKeyNavigation(panel, event, COLUMN_MENU_ITEM)) {
        return;
      }
      const active = document.activeElement;
      if (event.key === 'Tab' && active instanceof HTMLElement && active.matches(COLUMN_MENU_ITEM) && panel.contains(active)) {
        event.preventDefault();
        close();
      }
    },
  });

  // 状態を立てて配置し、rAF で実高を再測定、リスナーを付けます(旧 open 系 + effect に相当)。
  const openInternal = (columnKey: string) => {
    store.setSnapshot({ ...store.getSnapshot(), columnKey });
    updateLayout();
    if (measureFrame !== null) {
      cancelAnimationFrame(measureFrame);
    }
    measureFrame = requestAnimationFrame(() => {
      measureFrame = null;
      updateLayout();
      if (focusFirstItem) {
        focusFirstItem = false;
        panelRef.current?.querySelector<HTMLElement>(COLUMN_MENU_ITEM)?.focus();
      }
    });
    bindings.attach();
  };

  const openAtButton = (column: GridColumn<T>, button: HTMLElement, fromKeyboard = false) => {
    blurForPopover(args?.gridRootRef.current ?? null);
    anchorButton = button;
    anchorPoint = null;
    focusFirstItem = fromKeyboard;
    openInternal(column.key);
  };

  const openFromButton = (column: GridColumn<T>, event: MenuButtonPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!args?.enableColumnMenu || event.button !== 0) {
      return;
    }
    const button = event.currentTarget;
    if (store.getSnapshot().columnKey === column.key && anchorButton === button) {
      close();
      return;
    }
    if (event.pointerType === 'touch') {
      touchPendingAnchor = button;
      return;
    }
    openAtButton(column, button);
  };

  const openFromButtonClick = (column: GridColumn<T>, event: MenuButtonClickEvent) => {
    const pending = touchPendingAnchor;
    touchPendingAnchor = null;
    // 変更(別視点のレビュー): ポインタの押下を伴わない click(支援技術の仮想カーソルなど。detail が 0)でも開きます
    //   (これまではタッチの押下の後の click だけで開き、キーボード / 支援技術からは開けなかった)。
    const fromKeyboard = pending === null && event.detail === 0;
    if (!args?.enableColumnMenu || (pending !== event.currentTarget && !fromKeyboard)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openAtButton(column, event.currentTarget, fromKeyboard);
  };

  const openFromContextMenu = (column: GridColumn<T>, event: MenuContextEvent) => {
    if (!args?.enableColumnMenu) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    blurForPopover(args.gridRootRef.current);
    anchorButton = null;
    anchorPoint = { x: event.clientX, y: event.clientY };
    focusFirstItem = false;
    openInternal(column.key);
  };

  const openFromKeyboard = (column: GridColumn<T>, anchor: HTMLElement) => {
    if (args?.enableColumnMenu) {
      openAtButton(column, anchor, true);
    }
  };

  return {
    update: (next) => {
      args = next;
    },
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    panelRef,
    openFromButton,
    openFromButtonClick,
    openFromContextMenu,
    openFromKeyboard,
    close,
    dispose: () => {
      if (measureFrame !== null) {
        cancelAnimationFrame(measureFrame);
        measureFrame = null;
      }
      bindings.detach();
    },
  };
};