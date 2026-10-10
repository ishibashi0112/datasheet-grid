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
});
