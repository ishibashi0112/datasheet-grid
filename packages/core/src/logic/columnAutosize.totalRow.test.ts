// 追加(見直し): 列幅の自動調整が合計行の表示(値 + 見出し)も幅に収めることを固定します。jsdom には canvas と
//   レイアウトが無いため、measureText と offsetWidth を「文字数 × 7px」のスタブにします(枠の分は実装の定数)。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createColumnWidthAccumulator } from './columnAutosize';
import type { GridColumn } from '../model/gridTypes.unbound';

type Row = { qty: number };

const columns: GridColumn<Row>[] = [{ key: 'qty', title: 'Q', width: 50 }];
const CHAR_PX = 7;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        font: '',
        measureText: (text: string) => ({ width: text.length * CHAR_PX }),
      }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return (this.textContent ?? '').length * CHAR_PX;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const measure = (gridRoot: HTMLElement | null, totalRowTexts?: ReadonlyMap<string, { text: string; caption?: string }>) => {
  const accumulator = createColumnWidthAccumulator(columns);
  accumulator.collect({ qty: 1 });
  return accumulator.finalize({ gridRoot, currentWidths: {}, totalRowTexts });
};

describe('createColumnWidthAccumulator(合計行)', () => {
  it('合計行の表示(見出し + 値)が本体の値より長ければ、その幅に合わせる(DOM 経路)', () => {
    const gridRoot = document.createElement('div');
    document.body.appendChild(gridRoot);
    const plain = measure(gridRoot).qty;
    const withTotal = measure(gridRoot, new Map([['qty', { text: '1,234,567', caption: '平均' }]])).qty;
    // 「平均1,234,567」= 11 文字。
    expect(withTotal).toBe(11 * CHAR_PX);
    expect(withTotal).toBeGreaterThan(plain);
    // 計測用のノードは後片付けされる。
    expect(gridRoot.childElementCount).toBe(0);
  });

  it('canvas だけの経路(DOM に置けない)でも合計行の表示を収める', () => {
    const plain = measure(null).qty;
    const withTotal = measure(null, new Map([['qty', { text: '1,234,567', caption: '平均' }]])).qty;
    expect(withTotal).toBeGreaterThan(plain);
  });

  it('合計行が無い / 表示が空なら従来どおり', () => {
    const gridRoot = document.createElement('div');
    document.body.appendChild(gridRoot);
    expect(measure(gridRoot, new Map([['qty', { text: '' }]]))).toEqual(measure(gridRoot));
  });
});