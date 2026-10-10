// 追加(motion-2 / M-8): SSRM のブロック到着でスケルトン行が実行へ差し替わったとき、差し替わった行へ一過性の
//   enter クラス(ssg-body-row--enter)と段差インデックス(--ssg-row-enter-index)を直付けする DOM コントローラです
//   (React 非依存)。styles.css はこのクラスでセルを「3px 下からフェードイン」させ、インデックス × 一定時間で
//   上から順に出します(stagger)。
//   - React は差し替えを「skeleton 行(data-skeleton-row)の削除 + 実行の追加」の同一コミットで行うため、
//     MutationObserver の 1 バッチ内で両者の data-row-index を突き合わせます。仮想化のスクロールで出入りする行は
//     skeleton 由来ではないので対象外(= スクロール中に行がちらつかない)。
//   - クラスは animationend(セルからのバブル)で外します。motion='off' で継続時間が 0 のときや animationend が
//     届かない環境のため、フォールバックのタイマーでも外します。
//   - enabled=false(clientSide / motion='off')では observer を付けません。
type ReadonlyRef<V> = { readonly current: V };

export type RowEnterArgs = {
  scrollContainerRef: ReadonlyRef<HTMLElement | null>;
  enabled: boolean;
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

const isBodyRow = (node: Node): node is HTMLElement =>
  node instanceof HTMLElement && node.classList.contains('ssg-body-row');

export const createRowEnterController = (): RowEnterController => {
  let observer: MutationObserver | null = null;
  let observed: HTMLElement | null = null;
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

  const handleMutations = (records: MutationRecord[]) => {
    // 同一バッチで消えた skeleton 行の index 集合と、現れた実行の一覧。
    const removedSkeletonIndexes = new Set<number>();
    const addedRows: HTMLElement[] = [];
    for (const record of records) {
      record.removedNodes.forEach((node) => {
        if (isBodyRow(node) && node.hasAttribute('data-skeleton-row')) {
          removedSkeletonIndexes.add(rowIndexOf(node));
        }
      });
      record.addedNodes.forEach((node) => {
        if (isBodyRow(node) && !node.hasAttribute('data-skeleton-row')) {
          addedRows.push(node);
        }
      });
    }
    if (removedSkeletonIndexes.size === 0 || addedRows.length === 0) {
      return;
    }
    const entering = addedRows.filter((el) => removedSkeletonIndexes.has(rowIndexOf(el)));
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
    for (const el of Array.from(timers.keys())) {
      clear(el);
    }
  };

  return {
    update: ({ scrollContainerRef, enabled }) => {
      const el = enabled ? scrollContainerRef.current : null;
      if (el === observed) {
        return;
      }
      disconnect();
      if (!el || typeof MutationObserver === 'undefined') {
        return;
      }
      observer = new MutationObserver(handleMutations);
      observer.observe(el, { childList: true, subtree: true });
      observed = el;
    },
    dispose: disconnect,
  };
};
