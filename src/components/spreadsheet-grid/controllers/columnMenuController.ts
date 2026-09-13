// 追加(非依存化 ③-14): 列メニュー(ヘッダーの ⋮ / 右クリック)の開閉と配置のコントローラです
//   (React 非依存。旧 hooks/useColumnMenuController の本体を移設)。
//   - アンカーは「ボタン要素」(⋮ から開く。配置はボタン矩形基準、消えたら閉じる)または「座標」
//     (右クリック。スクロールで閉じる)。
//   - 開いている間: resize / scroll で再配置(座標アンカーの scroll は閉じる)、外側 pointerdown / Escape で
//     閉じる。パネルの実高は panelRef の scrollHeight から取り、開いた直後の rAF で再測定します。
//   - タッチは pointerdown では開かず、同じボタンの click で開きます(タッチの pointerdown → click の
//     順序で二重に開かないため)。
//   - イベントは構造的型で受けます(React 合成イベント / ネイティブどちらも可)。
import type { GridColumn } from '../model/gridTypes';
import { createValueStore } from '../logic/valueStore';
import {
  blurForPopover,
  createPopoverWindowBindings,
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
  close: () => void;
  dispose: () => void;
};

const MENU_WIDTH = 200;
const VIEWPORT_MARGIN = 8;
const OFFSET_Y = 6;
// パネル実測前の見積もり高さ(全項目表示時)。
const ESTIMATED_MENU_HEIGHT = 289;

export const createColumnMenuController = <T,>(): ColumnMenuController<T> => {
  let args: ColumnMenuControllerArgs<T> | null = null;
  const store = createValueStore<ColumnMenuSnapshot>({ columnKey: null, layout: null });
  const panelRef: { current: HTMLDivElement | null } = { current: null };
  let anchorButton: HTMLButtonElement | null = null;
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

  const close = () => {
    clearOpenState();
    anchorButton = null;
    anchorPoint = null;
    if (args !== null) {
      restoreGridFocus(args.gridRootRef);
    }
  };

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
    onOutsidePointerDown: close,
    onKeyDown: (event) => {
      if (event.key === 'Escape') {
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
    });
    bindings.attach();
  };

  const openAtButton = (column: GridColumn<T>, button: HTMLButtonElement) => {
    blurForPopover(args?.gridRootRef.current ?? null);
    anchorButton = button;
    anchorPoint = null;
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
    if (!args?.enableColumnMenu || pending !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openAtButton(column, event.currentTarget);
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
    openInternal(column.key);
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