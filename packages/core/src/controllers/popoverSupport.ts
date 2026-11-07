// 追加(非依存化 ③-13): ポータル系パネル(コンテキストメニュー / 列メニュー / ツールパネル / フィルター
//   ポップオーバー)が共有する DOM 周りの小道具です(React 非依存)。
//   - blurForPopover: 開く直前にフォーカスを外します(グリッドのキーボード処理が popover に干渉しない
//     ように。旧 4 hook の open 冒頭と同じ)。
//   - restoreGridFocus: 閉じた直後の rAF でグリッド root へフォーカスを戻します(展開行カード内に
//     フォーカスがあるときは奪いません)。
//   - isInsideGridRoot: 外側 pointerdown で閉じるとき、復帰してよいか(押下先がグリッド内か)の判定です。
//     グリッド外の要素を押して閉じた場合はその要素にフォーカスを残します(監査 C-3)。
//   - createPopoverWindowBindings: 開いている間だけ window に付ける 4 種のリスナー(resize / scroll
//     capture / pointerdown / keydown capture)を attach / detach で管理します。判定(パネル内か・
//     Escape の扱い)は各コントローラが handlers で与えます。
import { isFocusInsideDetailCard } from '../logic/detailRow';

export type ReadonlyElementRef<E extends HTMLElement = HTMLElement> = {
  readonly current: E | null;
};

export const blurForPopover = (gridRoot: HTMLElement | null): void => {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  gridRoot?.blur();
};

export const restoreGridFocus = (gridRootRef: ReadonlyElementRef): void => {
  requestAnimationFrame(() => {
    if (!isFocusInsideDetailCard()) {
      gridRootRef.current?.focus();
    }
  });
};

export const isInsideGridRoot = (gridRootRef: ReadonlyElementRef, target: Node): boolean =>
  gridRootRef.current?.contains(target) === true;

// 追加(dogfood DF-17): メニュー(role="menu" のパネル)のキー操作です。↓ / ↑ で項目(role="menuitem"。使えない項目は飛ばす)の
//   間を移り(端で反対側へ回る。項目にフォーカスが無ければ ↓ は先頭、↑ は末尾へ)、Home / End で先頭 / 末尾へ。項目の実行は
//   ボタンの Enter / Space(ブラウザの既定)。パネルの外にフォーカスがある間は、そのほかのスクロールするキー(PageUp / PageDown /
//   Space / ← / →)の既定の動作も止めます(これまでは ↓ で後ろのグリッドがスクロールし、メニューが閉じていた)。
//   パネルの中の項目以外の要素(custom 項目の入力欄など)にフォーカスがあるときは何もしません。扱ったら true。
const MENU_ITEM_SELECTOR = '[role="menuitem"]:not(:disabled):not([aria-disabled="true"])';
export const handleMenuKeyNavigation = (panel: HTMLElement, event: KeyboardEvent): boolean => {
  const active = document.activeElement;
  const focusInside = active instanceof HTMLElement && panel.contains(active);
  if (focusInside && active.getAttribute('role') !== 'menuitem') {
    return false;
  }
  const key = event.key;
  if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
    event.preventDefault();
    const items = Array.from(panel.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR));
    if (items.length === 0) {
      return true;
    }
    const current = focusInside ? items.indexOf(active) : -1;
    let next: number;
    if (key === 'Home') {
      next = 0;
    } else if (key === 'End') {
      next = items.length - 1;
    } else if (key === 'ArrowDown') {
      next = current < 0 ? 0 : (current + 1) % items.length;
    } else {
      next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
    }
    items[next]?.focus();
    return true;
  }
  if (!focusInside && (key === 'PageUp' || key === 'PageDown' || key === ' ' || key === 'ArrowLeft' || key === 'ArrowRight')) {
    event.preventDefault();
    return true;
  }
  return false;
};

export type PopoverWindowHandlers = {
  onResize?: () => void;
  // scroll は capture 相で受けます(内部スクロールも含めて拾う)。
  onScroll?: (event: Event) => void;
  // pointerdown の target がパネル(や許容要素)の内側なら true を返します。外側なら onOutsidePointerDown。
  isInside: (target: Node) => boolean;
  onOutsidePointerDown: (target: Node) => void;
  // keydown(capture)。Escape の扱い(preventDefault して閉じる / 抑止して別処理)は呼び出し側が決めます。
  onKeyDown?: (event: KeyboardEvent) => void;
};

export type PopoverWindowBindings = {
  attach: () => void;
  detach: () => void;
  isAttached: () => boolean;
};

export const createPopoverWindowBindings = (
  handlers: PopoverWindowHandlers,
): PopoverWindowBindings => {
  let attached = false;
  const handleResize = () => handlers.onResize?.();
  const handleScroll = (event: Event) => handlers.onScroll?.(event);
  const handlePointerDown = (event: PointerEvent) => {
    const target = event.target as Node | null;
    if (!target) {
      return;
    }
    if (handlers.isInside(target)) {
      return;
    }
    handlers.onOutsidePointerDown(target);
  };
  const handleKeyDown = (event: KeyboardEvent) => handlers.onKeyDown?.(event);

  return {
    attach: () => {
      if (attached) {
        return;
      }
      attached = true;
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('pointerdown', handlePointerDown);
      window.addEventListener('keydown', handleKeyDown, true);
    },
    detach: () => {
      if (!attached) {
        return;
      }
      attached = false;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    },
    isAttached: () => attached,
  };
};