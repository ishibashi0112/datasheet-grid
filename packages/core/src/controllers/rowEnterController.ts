// 追加(motion-2 / M-8): SSRM のブロック到着でスケルトン行が実行へ差し替わったとき、差し替わった行へ一過性の
//   enter クラス(ssg-body-row--enter)と段差インデックス(--ssg-row-enter-index)を直付けする DOM コントローラです
//   (React 非依存)。styles.css はこのクラスでセルを「3px 下からフェードイン」させ、インデックス × 一定時間で
//   上から順に出します(stagger)。
//   - React は差し替えを「skeleton 行(data-skeleton-row)の削除 + 実行の追加」の同一コミットで行うため、
//     MutationObserver の 1 バッチ内で両者の data-row-index を突き合わせます。仮想化のスクロールで出入りする行は
//     skeleton 由来ではないので対象外(= スクロール中に行がちらつかない)。
//   - クラスは animationend(セルからのバブル)で外します。motion='off' で継続時間が 0 のときや animationend が
//     届かない環境のため、フォールバックのタイマーでも外します。
//   - 追加(motion-3 / M-4・M-5): mountEnter が true のとき、スクロール中でないタイミング(スクロールコンテナに
//     ssg-scroll-container--scrolling が無い)で現れた実行にも同じ enter を付けます(ソートで窓に入った行 / 展開した
//     グループの子行 / 差し替えた rows の行)。スクロールで出入りする行は修飾子の有無で除外します。
//   - skeletonEnter / mountEnter が両方 false(clientSide + animateRows=false / motion='off')では observer を付けません。
//   - 追加(animateRows の修正): ソート / rows の並べ替えで React が行要素を DOM 上で移動(remove + insert)すると、
//     ブラウザはその要素の transition を始めません(再挿入された要素には変化前のスタイルが無い)。そのため
//     styles.css の transform transition が「移動されなかった行」にしか効かず、大半の行が新しい位置へ瞬間移動して
//     いました。mountEnter のときは style 属性の変化も旧値付きで観測し、移動された行だけ旧 translateY → 新しい値を
//     インラインで付け直して(1 回のリフローを挟む)同じ transition を走らせます。インラインの transition を持つ行
//     (行ドラッグの settle / live 方式が管理中)とスクロール中は触りません。
type ReadonlyRef<V> = { readonly current: V };

export type RowEnterArgs = {
  scrollContainerRef: ReadonlyRef<HTMLElement | null>;
  // SSRM のブロック到着(skeleton → 実行)で付ける。
  skeletonEnter: boolean;
  // スクロール以外で現れた実行に付ける(animateRows)。
  mountEnter: boolean;
};

export type RowEnterController = {
  update: (args: RowEnterArgs) => void;
  dispose: () => void;
};

export const ROW_ENTER_CLASS_NAME = 'ssg-body-row--enter';
export const ROW_ENTER_INDEX_VAR = '--ssg-row-enter-index';
// 段差インデックスの上限(これ以上は同時に出す。1 画面に 30 行以上あるとき末尾まで待たせない)。
export const ROW_ENTER_STAGGER_CAP = 12;
// animationend が届かないときのフォールバック(stagger 上限 + 継続時間の余裕)。
export const ROW_ENTER_FALLBACK_MS = 1500;

const rowIndexOf = (el: HTMLElement): number => Number(el.getAttribute('data-row-index'));

// style 属性の文字列(例 "height: 36px; transform: translateY(76px);")から transform の値を取り出します。
const TRANSFORM_IN_STYLE_PATTERN = /(?:^|;)\s*transform\s*:\s*([^;]+)/;
export const transformOfStyleText = (styleText: string | null): string | null => {
  if (!styleText) {
    return null;
  }
  const match = TRANSFORM_IN_STYLE_PATTERN.exec(styleText);
  return match ? match[1].trim() : null;
};

const isBodyRow = (node: Node): node is HTMLElement =>
  node instanceof HTMLElement && node.classList.contains('ssg-body-row');

// scrollSyncController がスクロール中に付ける修飾子(循環 import を避けるため文字列を重複定義。値は同一)。
const SCROLLING_CLASS_NAME = 'ssg-scroll-container--scrolling';

export const createRowEnterController = (): RowEnterController => {
  let observer: MutationObserver | null = null;
  let observed: HTMLElement | null = null;
  // 現在の observer が style 属性も観測しているか(mountEnter の切り替えで付け直す)。
  let observedAttributes = false;
  let modes = { skeletonEnter: false, mountEnter: false };
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  const clear = (el: HTMLElement) => {
    el.classList.remove(ROW_ENTER_CLASS_NAME);
    el.style.removeProperty(ROW_ENTER_INDEX_VAR);
    const timer = timers.get(el);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(el);
    }
  };

  const mark = (el: HTMLElement, staggerIndex: number) => {
    el.style.setProperty(ROW_ENTER_INDEX_VAR, String(staggerIndex));
    el.classList.add(ROW_ENTER_CLASS_NAME);
    const handleEnd = () => {
      el.removeEventListener('animationend', handleEnd);
      clear(el);
    };
    el.addEventListener('animationend', handleEnd);
    timers.set(
      el,
      setTimeout(() => {
        el.removeEventListener('animationend', handleEnd);
        clear(el);
      }, ROW_ENTER_FALLBACK_MS),
    );
  };

  // DOM 移動で transition が始まらなかった行へ、旧 transform → 新 transform を付け直して transition を走らせます。
  const restartMovedRowTransitions = (moved: HTMLElement[], previousStyleByRow: Map<HTMLElement, string | null>) => {
    const targets: { el: HTMLElement; from: string; to: string }[] = [];
    for (const el of moved) {
      // 行ドラッグ(settle / live)がインラインの transition で動かしている行は任せる。
      if (el.style.transition) {
        continue;
      }
      const from = transformOfStyleText(previousStyleByRow.get(el) ?? null);
      const to = el.style.transform;
      if (!from || !to || from === to) {
        continue;
      }
      targets.push({ el, from, to });
    }
    if (targets.length === 0) {
      return;
    }
    for (const { el, from } of targets) {
      el.style.transform = from;
    }
    // 旧位置を確定させるため 1 回だけ強制リフロー(再挿入後の要素に「変化前のスタイル」を持たせる)。
    void observed?.getBoundingClientRect();
    for (const { el, to } of targets) {
      el.style.transform = to;
    }
  };

  const handleMutations = (records: MutationRecord[]) => {
    // 同一バッチで消えた skeleton 行の index 集合と、現れた実行の一覧。
    const removedSkeletonIndexes = new Set<number>();
    // 行要素ごとのバッチ内で最初の style 旧値(= コミット前のスタイル)。
    const previousStyleByRow = new Map<HTMLElement, string | null>();
    // 同一バッチで削除もされた要素 = React の並べ替えによる DOM 移動(remove + insert)。mount ではないので除外。
    const movedRows = new Set<Node>();
    const addedRows: HTMLElement[] = [];
    for (const record of records) {
      if (record.type === 'attributes') {
        const target = record.target;
        if (isBodyRow(target) && !previousStyleByRow.has(target)) {
          previousStyleByRow.set(target, record.oldValue);
        }
        continue;
      }
      record.removedNodes.forEach((node) => {
        if (!isBodyRow(node)) {
          return;
        }
        if (node.hasAttribute('data-skeleton-row')) {
          removedSkeletonIndexes.add(rowIndexOf(node));
        } else {
          movedRows.add(node);
        }
      });
      record.addedNodes.forEach((node) => {
        if (isBodyRow(node) && !node.hasAttribute('data-skeleton-row')) {
          addedRows.push(node);
        }
      });
    }
    if (addedRows.length === 0) {
      return;
    }
    // mountEnter: スクロール中でなければ、現れた実行すべてが対象。skeletonEnter: skeleton と差し替わった行だけ。
    const scrolling = observed?.classList.contains(SCROLLING_CLASS_NAME) === true;
    if (modes.mountEnter && !scrolling) {
      restartMovedRowTransitions(addedRows.filter((el) => movedRows.has(el)), previousStyleByRow);
    }
    const entering = addedRows.filter(
      (el) =>
        (modes.mountEnter && !scrolling && !movedRows.has(el)) ||
        (modes.skeletonEnter && removedSkeletonIndexes.has(rowIndexOf(el))),
    );
    if (entering.length === 0) {
      return;
    }
    // 上から順に段差を付けます。3 ペイン(左固定 / 中央 / 右固定)で同じ行 index は同じ段差にします。
    const orderedIndexes = Array.from(new Set(entering.map(rowIndexOf))).sort((a, b) => a - b);
    const staggerByIndex = new Map<number, number>();
    orderedIndexes.forEach((rowIndex, position) => {
      staggerByIndex.set(rowIndex, Math.min(position, ROW_ENTER_STAGGER_CAP));
    });
    for (const el of entering) {
      mark(el, staggerByIndex.get(rowIndexOf(el)) ?? 0);
    }
  };

  const disconnect = () => {
    observer?.disconnect();
    observer = null;
    observed = null;
    observedAttributes = false;
    for (const el of Array.from(timers.keys())) {
      clear(el);
    }
  };

  return {
    update: ({ scrollContainerRef, skeletonEnter, mountEnter }) => {
      modes = { skeletonEnter, mountEnter };
      const el = skeletonEnter || mountEnter ? scrollContainerRef.current : null;
      if (el === observed && mountEnter === observedAttributes) {
        return;
      }
      disconnect();
      if (!el || typeof MutationObserver === 'undefined') {
        return;
      }
      observer = new MutationObserver(handleMutations);
      // mountEnter(animateRows)では DOM 移動された行の旧 transform を知るため style 属性も旧値付きで観測します。
      observer.observe(
        el,
        mountEnter
          ? { childList: true, subtree: true, attributes: true, attributeFilter: ['style'], attributeOldValue: true }
          : { childList: true, subtree: true },
      );
      observed = el;
      observedAttributes = mountEnter;
    },
    dispose: disconnect,
  };
};
