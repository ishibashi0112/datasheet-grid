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
import { IME_INPUT_ATTRIBUTE } from '../logic/domGuards';
import { GRID_POPUP_SELECTOR } from './escapeClaimController';
import { getActiveElement, getEventTarget } from '../utils/shadowDom';

export type ReadonlyElementRef<E extends HTMLElement = HTMLElement> = {
  readonly current: E | null;
};

// 変更(1.3.0 / S11-03 / S11-04): フォーカスのある要素は Shadow root の中も見ます(core utils/shadowDom)。
export const blurForPopover = (gridRoot: HTMLElement | null): void => {
  const active = getActiveElement(gridRoot);
  if (active instanceof HTMLElement) {
    active.blur();
  }
  gridRoot?.blur();
};

// 変更(1.0.1 / 2026-11-09 実アプリの総点検 AP-10): セルのエディタにフォーカスがあるときも奪いません。右クリックメニューの
//   onSelect で startEditing() を呼ぶと、開いたエディタがこの復帰で blur して確定され、すぐ閉じていた。
// 変更(1.0.2 / 2026-11-09 実アプリの総点検 RV-K2): 閉じるパネル(グリッドのポップアップ)の中にフォーカスがあるときは、その場で
//   グリッドへ移します(パネルが消えてから次のフレームまでフォーカスが body にあった。jsdom のテストでは最大約 50ms)。
//   次のフレームの確かめは従来どおり(押したセルなどへ移ったフォーカスを最後にグリッドへ)。
// 変更(1.0.2 / レビュー QA-1): フォーカスが入力欄(input / textarea / select / contenteditable)にあるときは、パネルが外れてから
//   (React の確定はマイクロタスク)移します。その場で移すと、blur で打った文字を確定する入力欄(列フィルターの日付欄 / 利用側の
//   renderFilterDateInput)が Escape で閉じたときにも確定していた。外れた後のフォーカスが body のときだけ移し、まだ外れて
//   いなければ次のフレームの確かめに任せます(1.0.1 と同じ)。
const TEXT_ENTRY_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export const restoreGridFocus = (gridRootRef: ReadonlyElementRef): void => {
  const current = gridRootRef.current;
  const focused = current === null ? null : getActiveElement(current);
  if (
    current !== null &&
    focused !== null &&
    !current.contains(focused) &&
    focused.closest(GRID_POPUP_SELECTOR) !== null
  ) {
    if (focused.matches(TEXT_ENTRY_SELECTOR)) {
      queueMicrotask(() => {
        const root = gridRootRef.current;
        const active = root === null ? null : getActiveElement(root);
        if (root !== null && (active === null || active === root.ownerDocument.body)) {
          root.focus({ preventScroll: true });
        }
      });
    } else {
      current.focus({ preventScroll: true });
    }
  }
  requestAnimationFrame(() => {
    const root = gridRootRef.current;
    if (root === null || isFocusInsideDetailCard()) {
      return;
    }
    const active = getActiveElement(root);
    if (active !== null && active !== root && root.contains(active) && active.closest('.ssg-cell-editor') !== null) {
      return;
    }
    // 変更(1.1.0 / RV2-L2 の見直し): 閉じた後に別のポップアップ(列メニューから開いたツールパネル / 列フィルターなど)へ
    //   フォーカスが移っていれば、そちらに残します(閉じたパネルはこの時点で外れているので、残っているのは新しく開いた方)。
    if (active !== null && !root.contains(active) && active.closest(GRID_POPUP_SELECTOR) !== null) {
      return;
    }
    root.focus();
  });
};

export const isInsideGridRoot = (gridRootRef: ReadonlyElementRef, target: Node): boolean =>
  gridRootRef.current?.contains(target) === true;

// 追加(dogfood DF-17): メニュー(role="menu" のパネル)のキー操作です。↓ / ↑ で項目(role="menuitem"。使えない項目は飛ばす)の
//   間を移り(端で反対側へ回る。項目にフォーカスが無ければ ↓ は先頭、↑ は末尾へ)、Home / End で先頭 / 末尾へ。項目の実行は
//   ボタンの Enter / Space(ブラウザの既定)。パネルの外にフォーカスがある間は、そのほかのスクロールするキー(PageUp / PageDown /
//   Space / ← / →)の既定の動作も止めます(これまでは ↓ で後ろのグリッドがスクロールし、メニューが閉じていた)。
//   パネルの中の項目以外の要素(custom 項目の入力欄など)にフォーカスがあるときは何もしません。扱ったら true。
// 変更(別視点のレビュー): 項目のセレクタを渡せるようにしました(列メニューは role の無い `.ssg-menu-item`)。
export const handleMenuKeyNavigation = (
  panel: HTMLElement,
  event: KeyboardEvent,
  itemSelector = '[role="menuitem"]',
): boolean => {
  const active = getActiveElement(panel);
  // 変更(1.1.0 / AP-33 の回帰): パネルそのもの(マウスで開いたときのフォーカスの置き場)は「項目にフォーカスが無い」と同じに扱い、
  //   ↓ で先頭・↑ で末尾の項目へ移ります(パネルを中の要素と数えて何もしなかった)。
  const focusInside = active instanceof HTMLElement && active !== panel && panel.contains(active);
  if (focusInside && !active.matches(itemSelector)) {
    return false;
  }
  const key = event.key;
  if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
    event.preventDefault();
    const items = Array.from(
      panel.querySelectorAll<HTMLElement>(`${itemSelector}:not(:disabled):not([aria-disabled="true"])`),
    );
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

// 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-33): マウスで開いたメニューのパネル(tabIndex=-1)にフォーカスを置きます。フォーカスが
//   どこにも無い(body)ときだけで、ほかの要素(利用側の入力欄など)からは奪いません。
// 変更(1.1.0 の確かめ直し): グリッドのシェル(と IME の入力受け)にあるときも置きます(列フィルターを開いたまま別の列の ⋮ を
//   押すと、閉じた列フィルターがフォーカスをシェルへ戻した後にメニューが開き、パネルへ移らなかった)。
export const focusPanelIfIdle = (panel: HTMLElement | null, gridRoot?: HTMLElement | null): void => {
  if (panel === null || !panel.isConnected) {
    return;
  }
  const active = getActiveElement(panel);
  const onGrid =
    active !== null &&
    gridRoot != null &&
    (active === gridRoot || (gridRoot.contains(active) && active.hasAttribute(IME_INPUT_ATTRIBUTE)));
  if (active === null || active === panel.ownerDocument.body || onGrid) {
    panel.focus({ preventScroll: true });
  }
};

// 追加(1.3.0 / Solid 版の品質の段 2 S5-02): パネルの中の押しても focus を取らないボタン(pointerdown を preventDefault する
//   日付のプリセットのチップなど)を押した結果、フォーカスのあった要素(日付の入力欄)が消えて body に落ちたときは、押した
//   ボタンへフォーカスを置きます(body に落ちると、パネルの Escape や Tab が効かなかった)。描き直しの後(次のフレーム)に
//   見ます。フォーカスがほかの要素へ移っていれば奪いません。
export const keepFocusAfterPress = (trigger: HTMLElement): void => {
  const view = trigger.ownerDocument.defaultView;
  if (view === null) {
    return;
  }
  view.requestAnimationFrame(() => {
    if (!trigger.isConnected) {
      return;
    }
    const active = getActiveElement(trigger);
    if (active === null || active === trigger.ownerDocument.body || active === trigger.ownerDocument.documentElement) {
      trigger.focus({ preventScroll: true });
    }
  });
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
  // 追加(段階 2 DF-23): 開いている間にグリッドが隠れた(display: none のタブへ切り替えた等で 0 × 0 になった)とき。
  //   クリックで切り替えたときは pointerdown で閉じますが、element.click() やショートカットで隠すと、ポップオーバーが
  //   別の画面の上に残っていました。グリッドの要素を ResizeObserver で見張ります(開いている間だけ)。
  getGridRoot?: () => HTMLElement | null;
  onGridHidden?: () => void;
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
  // 変更(1.3.0 / S11-05): window で受けるので、Shadow root の中で押したときの target は host です。押した要素は composedPath の先頭。
  const handlePointerDown = (event: PointerEvent) => {
    const target = getEventTarget(event) as Node | null;
    if (!target) {
      return;
    }
    if (handlers.isInside(target)) {
      return;
    }
    handlers.onOutsidePointerDown(target);
  };
  const handleKeyDown = (event: KeyboardEvent) => handlers.onKeyDown?.(event);
  let hiddenObserver: ResizeObserver | null = null;
  const watchGridHidden = () => {
    const root = handlers.getGridRoot?.() ?? null;
    const onGridHidden = handlers.onGridHidden;
    if (!root || !onGridHidden || typeof ResizeObserver === 'undefined') {
      return;
    }
    hiddenObserver = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!attached || !entry || entry.contentRect.width !== 0 || entry.contentRect.height !== 0) {
        return;
      }
      // 通知の大きさと今の矩形の両方が 0 × 0 のときだけ(大きさを差し替えるテスト用のスタブで誤って閉じないため)。
      const rect = root.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        onGridHidden();
      }
    });
    hiddenObserver.observe(root);
  };

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
      watchGridHidden();
    },
    detach: () => {
      if (!attached) {
        return;
      }
      attached = false;
      hiddenObserver?.disconnect();
      hiddenObserver = null;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    },
    isAttached: () => attached,
  };
};