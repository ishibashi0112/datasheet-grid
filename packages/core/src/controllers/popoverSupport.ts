// 追加(非依存化 ③-13): ポータル系パネル(コンテキストメニュー / 列メニュー / ツールパネル / フィルター
//   ポップオーバー)が共有する DOM 周りの小道具です(React 非依存)。
//   - blurForPopover: 開く直前にフォーカスを外します(グリッドのキーボード処理が popover に干渉しない
//     ように。旧 4 hook の open 冒頭と同じ)。
//   - restoreGridFocus: 閉じた直後の rAF でグリッド root へフォーカスを戻します(展開行カード内に
//     フォーカスがあるときは奪いません)。
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

export type PopoverWindowHandlers = {
  onResize?: () => void;
  // scroll は capture 相で受けます(内部スクロールも含めて拾う)。
  onScroll?: (event: Event) => void;
  // pointerdown の target がパネル(や許容要素)の内側なら true を返します。外側なら onOutsidePointerDown。
  isInside: (target: Node) => boolean;
  onOutsidePointerDown: () => void;
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
    handlers.onOutsidePointerDown();
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