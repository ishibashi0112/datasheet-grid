// 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-17): グリッドが使う Escape(編集の取り消し・グリッドのメニューや
//   ポップアップを閉じる・範囲の選択を外す)で、グリッドを入れたダイアログ(Radix / Headless UI / Mantine / 素の <dialog>)
//   まで閉じないようにします(React 非依存)。
//   - ダイアログの多くは window / document の capture で Escape を聞き、グリッドの keydown より先に閉じていた。
//   - グリッドが表示されている間、window の keydown を capture で聞き、グリッドが使う Escape だけを
//     「使う」と印を付けます: preventDefault(Radix / Headless UI / 素の <dialog> はこれで閉じない)、Mantine の Modal が見る
//     `data-mantine-stop-propagation` をその要素へ一時的に付ける、印(isEscapeClaimedByGrid)。印の付いた Escape はグリッドの
//     ルートの keydown で伝播も止めます(React Aria = HeroUI のモーダルは React のイベントで閉じるため)。
//   - グリッドが使わない Escape(セルを選んでいるだけ・上部バーの入力欄など)には何もしません(ダイアログが閉じる)。
//   - 窓の capture に先に付いたリスナー(グリッドより後に開いたダイアログなど)より先には動けません。
import type { GridSelection } from '../model/gridTypes.unbound';

type ReadonlyRef<T> = { readonly current: T };

// グリッドのポップアップ(body 直下に描くパネル)。この中の Escape は、パネルを閉じるのに使う。
export const GRID_POPUP_SELECTOR = '.ssg-menu-panel, .ssg-filter-popover, .ssg-toolpanel, .ssg-select-editor-popover';

// Escape で外す選択があるか(1 セルだけの選択はアクティブセルと同じで、外しても見た目が変わらない)。
export const isClearableSelection = (selection: GridSelection): boolean => {
  if (selection === null) {
    return false;
  }
  if (selection.type !== 'cell') {
    return true;
  }
  const { start, end } = selection.range;
  return start.row !== end.row || start.col !== end.col;
};

export type EscapeClaimArgs = {
  gridRootRef: ReadonlyRef<HTMLElement | null>;
  // keydown の対象の要素で、グリッドがその Escape を使うか(グリッドの今の状態で決める)。
  isClaimedTarget: (target: Element, root: HTMLElement) => boolean;
};

export type EscapeClaimController = {
  update: (args: EscapeClaimArgs) => void;
  dispose: () => void;
};

const claimedEvents = new WeakSet<Event>();
const preventedAfterClaim = new WeakSet<Event>();

// グリッドが使うと印を付けた Escape か(グリッドのルートの keydown で伝播を止めるのに使う)。
export const isEscapeClaimedByGrid = (event: Event): boolean => claimedEvents.has(event);

// Escape を中の部品(日付のカレンダー・利用側の入力部品など)が先に扱ったか(preventDefault したか)。印を付けた Escape は
//   ここで既に preventDefault 済みなので、その後に呼ばれた preventDefault だけを数えます。
export const isEscapePreventedInside = (event: Event): boolean =>
  claimedEvents.has(event) ? preventedAfterClaim.has(event) : event.defaultPrevented;

const MANTINE_STOP_ATTRIBUTE = 'data-mantine-stop-propagation';

export const createEscapeClaimController = (): EscapeClaimController => {
  let args: EscapeClaimArgs | null = null;
  let listening = false;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || args === null) {
      return;
    }
    const root = args.gridRootRef.current;
    const target = event.target;
    if (root === null || !(target instanceof Element) || !args.isClaimedTarget(target, root)) {
      return;
    }
    claimedEvents.add(event);
    event.preventDefault();
    // この後の preventDefault(中の部品が扱った印)を数えられるようにします。
    const preventDefault = event.preventDefault.bind(event);
    event.preventDefault = () => {
      preventedAfterClaim.add(event);
      preventDefault();
    };
    if (!target.hasAttribute(MANTINE_STOP_ATTRIBUTE)) {
      target.setAttribute(MANTINE_STOP_ATTRIBUTE, 'true');
      setTimeout(() => {
        target.removeAttribute(MANTINE_STOP_ATTRIBUTE);
      }, 0);
    }
  };

  return {
    update: (next) => {
      args = next;
      if (!listening && typeof window !== 'undefined') {
        window.addEventListener('keydown', handleKeyDown, true);
        listening = true;
      }
    },
    dispose: () => {
      if (listening) {
        window.removeEventListener('keydown', handleKeyDown, true);
        listening = false;
      }
    },
  };
};