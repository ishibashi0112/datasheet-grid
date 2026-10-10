// 追加(motion-2 / M-8): rowEnterController の DOM テストです(jsdom の MutationObserver を使う)。
//   skeleton 行 → 実行の同一バッチ差し替えだけに enter クラスが付くこと、段差インデックス、animationend /
//   フォールバックでの除去、無効時 / dispose で observer が付かないことを固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRowEnterController,
  ROW_ENTER_CLASS_NAME,
  ROW_ENTER_FALLBACK_MS,
  ROW_ENTER_INDEX_VAR,
  ROW_ENTER_STAGGER_CAP,
} from './rowEnterController';

const flushObservers = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const makeRow = (rowIndex: number, skeleton: boolean, pane = 'center') => {
  const el = document.createElement('div');
  el.className = 'ssg-body-row';
  el.setAttribute('data-row-index', String(rowIndex));
  el.setAttribute('data-pane', pane);
  if (skeleton) {
    el.setAttribute('data-skeleton-row', '');
  }
  return el;
};

describe('rowEnterController', () => {
  let container: HTMLDivElement;
  let pane: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    pane = document.createElement('div');
    container.appendChild(pane);
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('同一バッチで skeleton 行が実行へ差し替わった行だけに enter クラスと段差インデックスが付く', async () => {
    const controller = createRowEnterController();
    controller.update({ scrollContainerRef: { current: container }, skeletonEnter: true, mountEnter: false });
    const s3 = makeRow(3, true);
    const s4 = makeRow(4, true);
    const s9 = makeRow(9, true);
    pane.append(s3, s4, s9);
    await flushObservers();
    // 差し替え: 3 / 4 は実行へ、9 は skeleton のまま。10 は skeleton 由来でない(スクロールで入った)実行。
    const r3 = makeRow(3, false);
    const r4 = makeRow(4, false);
    const r10 = makeRow(10, false);
    s3.remove();
    s4.remove();
    pane.append(r3, r4, r10);
    await flushObservers();
    expect(r3.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(true);
    expect(r4.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(true);
    expect(r3.style.getPropertyValue(ROW_ENTER_INDEX_VAR)).toBe('0');
    expect(r4.style.getPropertyValue(ROW_ENTER_INDEX_VAR)).toBe('1');
    expect(r10.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(false);
    expect(s9.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(false);
    // animationend(セルからのバブル)で外れる。
    r3.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(r3.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(false);
    expect(r3.style.getPropertyValue(ROW_ENTER_INDEX_VAR)).toBe('');
    expect(r4.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(true);
    controller.dispose();
    // dispose は残りの付与も外す。
    expect(r4.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(false);
  });

  it('3 ペインで同じ行 index は同じ段差になり、段差は上限で頭打ちになる', async () => {
    const controller = createRowEnterController();
    controller.update({ scrollContainerRef: { current: container }, skeletonEnter: true, mountEnter: false });
    const count = ROW_ENTER_STAGGER_CAP + 3;
    const skeletons = Array.from({ length: count }, (_, i) => makeRow(i, true));
    const leftSkeletons = Array.from({ length: count }, (_, i) => makeRow(i, true, 'left'));
    pane.append(...skeletons, ...leftSkeletons);
    await flushObservers();
    const rows = Array.from({ length: count }, (_, i) => makeRow(i, false));
    const leftRows = Array.from({ length: count }, (_, i) => makeRow(i, false, 'left'));
    for (const el of [...skeletons, ...leftSkeletons]) {
      el.remove();
    }
    // 追加順を逆にしても段差は index 昇順。
    pane.append(...[...rows].reverse(), ...leftRows);
    await flushObservers();
    expect(rows[0].style.getPropertyValue(ROW_ENTER_INDEX_VAR)).toBe('0');
    expect(leftRows[0].style.getPropertyValue(ROW_ENTER_INDEX_VAR)).toBe('0');
    expect(rows[5].style.getPropertyValue(ROW_ENTER_INDEX_VAR)).toBe('5');
    expect(leftRows[5].style.getPropertyValue(ROW_ENTER_INDEX_VAR)).toBe('5');
    expect(rows[count - 1].style.getPropertyValue(ROW_ENTER_INDEX_VAR)).toBe(String(ROW_ENTER_STAGGER_CAP));
    controller.dispose();
  });

  it('animationend が届かなくてもフォールバックのタイマーで外れる', async () => {
    const controller = createRowEnterController();
    controller.update({ scrollContainerRef: { current: container }, skeletonEnter: true, mountEnter: false });
    const s = makeRow(1, true);
    pane.append(s);
    await flushObservers();
    vi.useFakeTimers();
    try {
      const r = makeRow(1, false);
      s.remove();
      pane.append(r);
      // MutationObserver のコールバックはマイクロタスク(フェイクタイマーの影響を受けない)。
      await Promise.resolve();
      expect(r.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(true);
      vi.advanceTimersByTime(ROW_ENTER_FALLBACK_MS + 10);
      expect(r.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
    controller.dispose();
  });

  it('両モード false では observer を付けず、true → false で外れる', async () => {
    const controller = createRowEnterController();
    controller.update({ scrollContainerRef: { current: container }, skeletonEnter: false, mountEnter: false });
    const s = makeRow(2, true);
    pane.append(s);
    await flushObservers();
    const r = makeRow(2, false);
    s.remove();
    pane.append(r);
    await flushObservers();
    expect(r.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(false);
    // 有効化 → 無効化。
    controller.update({ scrollContainerRef: { current: container }, skeletonEnter: true, mountEnter: false });
    controller.update({ scrollContainerRef: { current: container }, skeletonEnter: false, mountEnter: false });
    const s2 = makeRow(5, true);
    pane.append(s2);
    await flushObservers();
    const r2 = makeRow(5, false);
    s2.remove();
    pane.append(r2);
    await flushObservers();
    expect(r2.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(false);
    controller.dispose();
  });

  // 追加(motion-3 / M-4・M-5): mountEnter。
  it('mountEnter: スクロール中でなく現れた実行に enter が付き、スクロール中(修飾子あり)や skeleton 行には付かない', async () => {
    const controller = createRowEnterController();
    controller.update({ scrollContainerRef: { current: container }, skeletonEnter: false, mountEnter: true });
    const r1 = makeRow(1, false);
    const r2 = makeRow(2, false);
    const s3 = makeRow(3, true);
    pane.append(r2, r1, s3);
    await flushObservers();
    expect(r1.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(true);
    expect(r2.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(true);
    expect(r1.style.getPropertyValue(ROW_ENTER_INDEX_VAR)).toBe('0');
    expect(r2.style.getPropertyValue(ROW_ENTER_INDEX_VAR)).toBe('1');
    expect(s3.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(false);
    // スクロール中(修飾子あり)に現れた行には付かない。
    container.classList.add('ssg-scroll-container--scrolling');
    const r7 = makeRow(7, false);
    pane.append(r7);
    await flushObservers();
    expect(r7.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(false);
    container.classList.remove('ssg-scroll-container--scrolling');
    // 同一バッチ内の DOM 移動(React の並べ替え = remove + insert)は mount ではないので付かない。
    r1.classList.remove(ROW_ENTER_CLASS_NAME);
    r2.classList.remove(ROW_ENTER_CLASS_NAME);
    pane.insertBefore(r1, r2);
    await flushObservers();
    expect(r1.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(false);
    // mountEnter を切ると付かない(observer は skeletonEnter のために残り得る)。
    controller.update({ scrollContainerRef: { current: container }, skeletonEnter: true, mountEnter: false });
    const r8 = makeRow(8, false);
    pane.append(r8);
    await flushObservers();
    expect(r8.classList.contains(ROW_ENTER_CLASS_NAME)).toBe(false);
    controller.dispose();
  });
});
