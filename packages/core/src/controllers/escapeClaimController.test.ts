// 追加(1.0.1 / 実アプリの総点検 AP-17): グリッドが使う Escape に印を付けるコントローラの単体テストです。
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';

import {
  createEscapeClaimController,
  isClearableSelection,
  isEscapeClaimedByGrid,
  isEscapePreventedInside,
} from './escapeClaimController';

const disposers: Array<() => void> = [];
afterEach(() => {
  while (disposers.length > 0) {
    disposers.pop()?.();
  }
  document.body.innerHTML = '';
});

const setup = (claim: (target: Element) => boolean) => {
  const root = document.createElement('div');
  const inner = document.createElement('input');
  root.appendChild(inner);
  document.body.appendChild(root);
  const controller = createEscapeClaimController();
  controller.update({ gridRootRef: { current: root }, isClaimedTarget: (target) => claim(target) });
  disposers.push(() => controller.dispose());
  return { root, inner, controller };
};

const pressEscape = (target: Element, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

describe('isClearableSelection', () => {
  it('1 セルだけの選択と null は外す選択に数えない', () => {
    expect(isClearableSelection(null)).toBe(false);
    expect(isClearableSelection({ type: 'cell', range: { start: { row: 1, col: 1 }, end: { row: 1, col: 1 } } })).toBe(false);
    expect(isClearableSelection({ type: 'cell', range: { start: { row: 1, col: 1 }, end: { row: 2, col: 1 } } })).toBe(true);
  });
});

describe('createEscapeClaimController', () => {
  it('使う Escape は preventDefault し、Mantine 向けの印を次のタスクまで付ける', async () => {
    const { inner } = setup(() => true);
    const event = pressEscape(inner);
    expect(event.defaultPrevented).toBe(true);
    expect(isEscapeClaimedByGrid(event)).toBe(true);
    expect(inner.getAttribute('data-mantine-stop-propagation')).toBe('true');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(inner.hasAttribute('data-mantine-stop-propagation')).toBe(false);
  });

  it('使わない Escape・変換中の Escape・ほかのキーには何もしない', () => {
    const { inner } = setup(() => false);
    const notClaimed = pressEscape(inner);
    expect(notClaimed.defaultPrevented).toBe(false);
    expect(isEscapeClaimedByGrid(notClaimed)).toBe(false);
    expect(inner.hasAttribute('data-mantine-stop-propagation')).toBe(false);

    const claimAll = setup(() => true);
    const composing = pressEscape(claimAll.inner, { isComposing: true });
    expect(composing.defaultPrevented).toBe(false);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    claimAll.inner.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
  });

  it('利用側が付けていた data-mantine-stop-propagation は外さない', async () => {
    const { inner } = setup(() => true);
    inner.setAttribute('data-mantine-stop-propagation', 'true');
    pressEscape(inner);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(inner.getAttribute('data-mantine-stop-propagation')).toBe('true');
  });

  it('印を付けた後に中の部品が preventDefault したかを isEscapePreventedInside で見分ける', () => {
    const { inner } = setup(() => true);
    const untouched = pressEscape(inner);
    expect(untouched.defaultPrevented).toBe(true);
    expect(isEscapePreventedInside(untouched)).toBe(false);

    const handledInside = (event: Event) => event.preventDefault();
    inner.addEventListener('keydown', handledInside);
    const handled = pressEscape(inner);
    inner.removeEventListener('keydown', handledInside);
    expect(isEscapePreventedInside(handled)).toBe(true);
  });

  it('印を付けていない Escape は defaultPrevented をそのまま返す', () => {
    const { inner } = setup(() => false);
    const prevent = (event: Event) => event.preventDefault();
    inner.addEventListener('keydown', prevent);
    const event = pressEscape(inner);
    expect(isEscapePreventedInside(event)).toBe(true);
  });

  it('dispose の後は聞かない', () => {
    const { inner, controller } = setup(() => true);
    controller.dispose();
    const event = pressEscape(inner);
    expect(event.defaultPrevented).toBe(false);
  });
});