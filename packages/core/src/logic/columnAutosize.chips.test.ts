// 追加(1.0.2 / 2026-11-09 実アプリの総点検 D-02): 列幅の自動調整が状態チップのセルをチップの枠(余白とアイコン)ごと
//   測ることを固定します。jsdom には canvas とレイアウトが無いため、measureText と offsetWidth をスタブにします
//   (文字は 1 字 7px、チップはアイコン 12px + 枠 19px を足す = 実際の CSS の padding 6 + 8 と間 5)。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createColumnWidthAccumulator, type AutosizeChipOf } from './columnAutosize';
import type { GridColumn } from '../model/gridTypes.unbound';

type Row = { status: string };

const CHAR_PX = 7;
const CHIP_FRAME_PX = 19;
const ICON_PX = 12;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        font: '',
        measureText: (text: string) => ({ width: text.length * CHAR_PX }),
      }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    const chip = this.querySelector('.ssg-chip');
    const text = (this.textContent ?? '').length * CHAR_PX;
    if (!chip) {
      return text;
    }
    return text + CHIP_FRAME_PX + (chip.querySelector('.ssg-chip-icon') ? ICON_PX : 0);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const chipColumn: GridColumn<Row> = {
  key: 'status',
  title: 'S',
  width: 50,
  conditionalFormat: { chips: { suspended: 'warning', active: { tone: 'good', label: 'Active now!', icon: false } } },
};

const measure = (column: GridColumn<Row>, rows: Row[], chipOf?: AutosizeChipOf<Row>) => {
  const gridRoot = document.createElement('div');
  document.body.appendChild(gridRoot);
  const accumulator = createColumnWidthAccumulator([column]);
  rows.forEach((row, index) => accumulator.collect(row, index));
  return accumulator.finalize({ gridRoot, currentWidths: {}, chipOf }).status;
};

describe('createColumnWidthAccumulator(状態チップ)', () => {
  it('チップのセルは枠とアイコンごと測り、label があれば label を測る', () => {
    const seen: number[] = [];
    const chipOf: AutosizeChipOf<Row> = (row, _column, viewIndex) => {
      seen.push(viewIndex);
      return row.status === 'suspended'
        ? { label: undefined, icon: true }
        : row.status === 'active'
          ? { label: 'Active now!', icon: false }
          : null;
    };
    // 「suspended」9 文字 + 枠 + アイコン(+ 丸めの 1px)。
    expect(measure(chipColumn, [{ status: 'suspended' }], chipOf)).toBe(9 * CHAR_PX + CHIP_FRAME_PX + ICON_PX + 1);
    // label「Active now!」11 文字 + 枠(アイコンなし)。
    expect(measure(chipColumn, [{ status: 'active' }], chipOf)).toBe(11 * CHAR_PX + CHIP_FRAME_PX + 1);
    // チップを出さないセルは文字だけ。
    expect(measure(chipColumn, [{ status: 'closed-permanently' }], chipOf)).toBe(18 * CHAR_PX + 1);
    expect(seen).toEqual([0, 0, 0]);
  });

  it('候補を選ぶ推定にもチップの label を使う(値が短く label が長い行を取りこぼさない。レビュー QB-2)', () => {
    const column: GridColumn<Row> = {
      key: 'status',
      title: 'S',
      width: 50,
      conditionalFormat: { chips: { A: { tone: 'good', label: 'Approved by the manager', icon: false } } },
    };
    const chipOf: AutosizeChipOf<Row> = (row) =>
      row.status === 'A' ? { label: 'Approved by the manager', icon: false } : null;
    // 生の値が 16 文字の行が 20 行(候補の上限 16 を埋める)+ 値 1 文字・label 23 文字の行が 1 行。
    const rows: Row[] = [...Array.from({ length: 20 }, () => ({ status: 'pending-review-x' })), { status: 'A' }];
    const gridRoot = document.createElement('div');
    document.body.appendChild(gridRoot);
    const accumulator = createColumnWidthAccumulator([column], chipOf);
    rows.forEach((row, index) => accumulator.collect(row, index));
    expect(accumulator.finalize({ gridRoot, currentWidths: {}, chipOf }).status).toBe(23 * CHAR_PX + CHIP_FRAME_PX + 1);
  });

  it('chipOf を渡さないとき(条件付き書式の機能が無い構成)は文字だけ', () => {
    expect(measure(chipColumn, [{ status: 'suspended' }])).toBe(9 * CHAR_PX + 1);
  });
});