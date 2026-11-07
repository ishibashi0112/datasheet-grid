// 追加(motion-7 / M-9): saveStatusController の DOM テストです(jsdom)。pending → ok / failed / cleared の印と
//   インジケーター、ok / failed のバッジが時間で外れること、failed のチップ、無効時 / dispose を固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSaveStatusController,
  FAILED_CHIP_MS,
  OK_BADGE_MS,
  SAVE_FAILED_CHIP_CLASS_NAME,
  SAVE_INDICATOR_CLASS_NAME,
  SAVE_STATE_ATTRIBUTE,
} from './saveStatusController';

describe('saveStatusController', () => {
  let shell: HTMLDivElement;
  let container: HTMLDivElement;
  let rafQueue: FrameRequestCallback[];
  const flushFrames = () => {
    const queue = rafQueue;
    rafQueue = [];
    for (const cb of queue) {
      cb(0);
    }
  };
  const makeCell = (rowKey: string, colKey: string) => {
    let row = container.querySelector<HTMLElement>(`.ssg-body-row[data-row-key="${rowKey}"]`);
    if (!row) {
      row = document.createElement('div');
      row.className = 'ssg-body-row';
      row.setAttribute('data-row-key', rowKey);
      container.appendChild(row);
    }
    const cell = document.createElement('div');
    cell.className = 'ssg-body-cell';
    cell.setAttribute('data-ssg-col-key', colKey);
    const span = document.createElement('span');
    span.textContent = 'v';
    cell.appendChild(span);
    row.appendChild(cell);
    return cell;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    rafQueue = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    shell = document.createElement('div');
    container = document.createElement('div');
    shell.appendChild(container);
    document.body.appendChild(shell);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    shell.remove();
  });

  it('pending → ok で印とインジケーターが付き替わり、ok は時間で外れる', () => {
    const controller = createSaveStatusController();
    controller.update({ scrollContainerRef: { current: container }, shellRef: { current: shell }, enabled: true });
    const qty = makeCell('r1', 'qty');
    const name = makeCell('r1', 'name');
    controller.handle({ state: 'pending', cells: [{ rowKey: 'r1', columnKeys: ['qty'] }] });
    // 付与は rAF へ遅延。
    expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBeNull();
    flushFrames();
    expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBe('pending');
    expect(qty.querySelector(`.${SAVE_INDICATOR_CLASS_NAME}`)?.getAttribute('data-kind')).toBe('pending');
    expect(name.getAttribute(SAVE_STATE_ATTRIBUTE)).toBeNull();
    // React の内容(span)はそのまま。
    expect(qty.firstElementChild?.tagName).toBe('SPAN');
    controller.handle({ state: 'ok', cells: [{ rowKey: 'r1', columnKeys: ['qty'] }] });
    flushFrames();
    expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBe('ok');
    expect(qty.querySelector(`.${SAVE_INDICATOR_CLASS_NAME}`)?.textContent).toBe('✓');
    vi.advanceTimersByTime(OK_BADGE_MS + 10);
    expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBeNull();
    expect(qty.querySelector(`.${SAVE_INDICATOR_CLASS_NAME}`)).toBeNull();
    controller.dispose();
  });

  it('failed は印 + ✕ とチップを出し、チップは時間 / スクロールで消える。cleared は印だけ外す', () => {
    const controller = createSaveStatusController();
    controller.update({ scrollContainerRef: { current: container }, shellRef: { current: shell }, enabled: true });
    const qty = makeCell('r1', 'qty');
    controller.handle({ state: 'pending', cells: [{ rowKey: 'r1', columnKeys: ['qty'] }] });
    controller.handle({ state: 'failed', cells: [{ rowKey: 'r1', columnKeys: ['qty'] }] });
    flushFrames();
    expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBe('failed');
    expect(qty.querySelector(`.${SAVE_INDICATOR_CLASS_NAME}`)?.textContent).toBe('✕');
    const chip = shell.querySelector(`.${SAVE_FAILED_CHIP_CLASS_NAME}`);
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain('保存に失敗');
    container.dispatchEvent(new Event('scroll'));
    expect(shell.querySelector(`.${SAVE_FAILED_CHIP_CLASS_NAME}`)).toBeNull();
    // もう一度失敗 → 時間で消える。
    controller.handle({ state: 'failed', cells: [{ rowKey: 'r1', columnKeys: ['qty'] }] });
    flushFrames();
    expect(shell.querySelector(`.${SAVE_FAILED_CHIP_CLASS_NAME}`)).not.toBeNull();
    vi.advanceTimersByTime(FAILED_CHIP_MS + 10);
    expect(shell.querySelector(`.${SAVE_FAILED_CHIP_CLASS_NAME}`)).toBeNull();
    expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBeNull();
    // cleared。
    controller.handle({ state: 'pending', cells: [{ rowKey: 'r1', columnKeys: ['qty'] }] });
    flushFrames();
    controller.handle({ state: 'cleared', cells: [{ rowKey: 'r1', columnKeys: ['qty'] }] });
    flushFrames();
    expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBeNull();
    controller.dispose();
  });

  it('enabled=false では何も付かず、dispose は印とチップを外す', () => {
    const controller = createSaveStatusController();
    controller.update({ scrollContainerRef: { current: container }, shellRef: { current: shell }, enabled: false });
    const qty = makeCell('r1', 'qty');
    controller.handle({ state: 'pending', cells: [{ rowKey: 'r1', columnKeys: ['qty'] }] });
    flushFrames();
    expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBeNull();
    controller.update({ scrollContainerRef: { current: container }, shellRef: { current: shell }, enabled: true });
    controller.handle({ state: 'failed', cells: [{ rowKey: 'r1', columnKeys: ['qty'] }] });
    flushFrames();
    expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBe('failed');
    controller.dispose();
    expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBeNull();
    expect(shell.querySelector(`.${SAVE_FAILED_CHIP_CLASS_NAME}`)).toBeNull();
  });
  // 追加(dogfood DF-14): 保存中のセルが描き直されても(仮想化で外れて戻った行)保存中の印が付き直す。決着の後は付けない。
  describe('描き直されたセルへの保存中の印の付け直し(dogfood DF-14)', () => {
    const remountRow = (rowKey: string, colKeys: string[]) => {
      container.querySelector(`.ssg-body-row[data-row-key="${rowKey}"]`)?.remove();
      return colKeys.map((colKey) => makeCell(rowKey, colKey));
    };
    const flushMutations = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    it('保存中の間は、描き直された行のセルに保存中の印が付き直す', async () => {
      const controller = createSaveStatusController();
      controller.update({ scrollContainerRef: { current: container }, shellRef: { current: shell }, enabled: true });
      makeCell('r1', 'qty');
      makeCell('r1', 'name');
      controller.handle({ state: 'pending', cells: [{ rowKey: 'r1', columnKeys: ['qty'] }] });
      flushFrames();
      // 行がスクロールで外れて、戻ってきた(新しい要素)
      const [qty, name] = remountRow('r1', ['qty', 'name']);
      expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBeNull();
      await flushMutations();
      flushFrames();
      expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBe('pending');
      expect(qty.querySelector(`.${SAVE_INDICATOR_CLASS_NAME}`)?.getAttribute('data-kind')).toBe('pending');
      expect(name.getAttribute(SAVE_STATE_ATTRIBUTE)).toBeNull();
      // 印を付けたこと自体の変化で、インジケーターが増え続けない
      await flushMutations();
      flushFrames();
      expect(qty.querySelectorAll(`.${SAVE_INDICATOR_CLASS_NAME}`)).toHaveLength(1);
      // 決着の後は、描き直されても保存中にしない
      controller.handle({ state: 'ok', cells: [{ rowKey: 'r1', columnKeys: ['qty'] }] });
      flushFrames();
      const [qty2] = remountRow('r1', ['qty']);
      await flushMutations();
      flushFrames();
      expect(qty2.getAttribute(SAVE_STATE_ATTRIBUTE)).toBeNull();
      controller.dispose();
    });

    it('同じセルの新しい書き込みが保存中なら、古い書き込みの決着(列なし)では外さない。数値の rowKey も扱う', async () => {
      const controller = createSaveStatusController();
      controller.update({ scrollContainerRef: { current: container }, shellRef: { current: shell }, enabled: true });
      makeCell('7', 'qty');
      controller.handle({ state: 'pending', cells: [{ rowKey: 7, columnKeys: ['qty'] }] });
      controller.handle({ state: 'pending', cells: [{ rowKey: 7, columnKeys: ['qty'] }] });
      // 古い書き込みの決着: 新しい書き込みが保存中なのでモデルは列を渡さない
      controller.handle({ state: 'failed', cells: [{ rowKey: 7, columnKeys: [] }] });
      flushFrames();
      const [qty] = remountRow('7', ['qty']);
      await flushMutations();
      flushFrames();
      expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBe('pending');
      controller.handle({ state: 'failed', cells: [{ rowKey: 7, columnKeys: ['qty'] }] });
      flushFrames();
      expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBe('failed');
      vi.advanceTimersByTime(FAILED_CHIP_MS + 10);
      const [qty2] = remountRow('7', ['qty']);
      await flushMutations();
      flushFrames();
      expect(qty2.getAttribute(SAVE_STATE_ATTRIBUTE)).toBeNull();
      controller.dispose();
    });

    it('無効にしたときと dispose の後は付け直さない', async () => {
      const controller = createSaveStatusController();
      controller.update({ scrollContainerRef: { current: container }, shellRef: { current: shell }, enabled: true });
      makeCell('r1', 'qty');
      controller.handle({ state: 'pending', cells: [{ rowKey: 'r1', columnKeys: ['qty'] }] });
      flushFrames();
      controller.update({ scrollContainerRef: { current: container }, shellRef: { current: shell }, enabled: false });
      const [qty] = remountRow('r1', ['qty']);
      await flushMutations();
      flushFrames();
      expect(qty.getAttribute(SAVE_STATE_ATTRIBUTE)).toBeNull();

      controller.update({ scrollContainerRef: { current: container }, shellRef: { current: shell }, enabled: true });
      controller.handle({ state: 'pending', cells: [{ rowKey: 'r1', columnKeys: ['qty'] }] });
      flushFrames();
      controller.dispose();
      const [qty2] = remountRow('r1', ['qty']);
      await flushMutations();
      flushFrames();
      expect(qty2.getAttribute(SAVE_STATE_ATTRIBUTE)).toBeNull();
    });
  });
});
