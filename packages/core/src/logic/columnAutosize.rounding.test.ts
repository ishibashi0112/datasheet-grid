// 追加(DevBI の報告 2026-11-07): 列幅の自動調整(実 DOM の経路)が、offsetWidth の丸めで実際の幅より小さい列幅を
//   出さないことを固定します。offsetWidth は整数へ丸めた値で、実際の幅より最大 0.5px 小さくなります(Chromium で
//   「¥10,245,135」の文字 67.14px に対し、決まった列幅の中で使える幅が 67px になり「…」で切れていた)。
//   jsdom にはレイアウトが無いので、「実際の幅 = 文字数 × 6.87px」を作り、offsetWidth はその四捨五入を返すスタブにします。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createColumnWidthAccumulator } from './columnAutosize';
import type { GridColumn } from '../model/gridTypes.unbound';

type Row = { amount: string };

const TRUE_CHAR_PX = 6.87;
const trueWidth = (text: string) => text.length * TRUE_CHAR_PX;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        font: '',
        // 見出しは短くして、列幅がセルの計測で決まるようにします。
        measureText: () => ({ width: 1 }),
      }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return Math.round(trueWidth(this.textContent ?? ''));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const columns: GridColumn<Row>[] = [{ key: 'amount', title: 'A', width: 50, minWidth: 0 }];

const measure = (values: string[], totalText?: string) => {
  const gridRoot = document.createElement('div');
  document.body.appendChild(gridRoot);
  const accumulator = createColumnWidthAccumulator(columns);
  for (const amount of values) {
    accumulator.collect({ amount });
  }
  return accumulator.finalize({
    gridRoot,
    currentWidths: {},
    totalRowTexts: totalText === undefined ? undefined : new Map([['amount', { text: totalText }]]),
  }).amount;
};

describe('createColumnWidthAccumulator(offsetWidth の丸め)', () => {
  it('切り捨て側に丸まる幅でも、決まった列幅は実際の幅以上になる', () => {
    // 12 文字 = 82.44px → offsetWidth 82(0.44px 足りない)。
    const text = '¥10,489,5200';
    expect(Math.round(trueWidth(text))).toBeLessThan(trueWidth(text));
    const width = measure([text]);
    expect(width).toBeGreaterThanOrEqual(trueWidth(text));
    expect(width).toBe(83);
  });

  it('いろいろな長さで、決まった列幅が実際の幅を下回らない(多くても 1px 余分なだけ)', () => {
    // 見出しの幅(1 + 4 + 41 = 46px)より長い値だけを見ます(短い値は見出しの幅で決まる)。
    for (let length = 7; length <= 40; length += 1) {
      const text = '9'.repeat(length);
      const width = measure([text]);
      expect(width).toBeGreaterThanOrEqual(trueWidth(text));
      expect(width - trueWidth(text)).toBeLessThan(2);
    }
  });

  it('合計行の表示でも同じく丸めの不足を吸収する', () => {
    const total = '¥10,489,5200';
    const width = measure(['1'], total);
    expect(width).toBeGreaterThanOrEqual(trueWidth(total));
  });

  it('空の値だけの列は、従来どおり見出しと最小幅で決まる(1px を足さない)', () => {
    expect(measure([''])).toBe(Math.ceil(1 + 4 + 41));
  });
});