// 追加(date-picker B): 内製日付ピッカーのカレンダー計算(純ロジック)のテストです。
import { describe, it, expect } from 'vitest';

import {
  buildCalendarDayCells,
  buildYearGrid,
  formatCalendarTitle,
  formatFilterDateDisplay,
  yearGridStart,
} from './datePickerCalendar';

describe('buildCalendarDayCells', () => {
  it('日曜始まり・常に 42 セル固定で前後月の埋めを含む(2026 年 8 月)', () => {
    // 2026-08-01 は土曜 → 先頭は 2026-07-26(日)。
    const cells = buildCalendarDayCells(2026, 7);
    expect(cells).toHaveLength(42);
    expect(cells[0]).toEqual({ key: '2026-07-26', day: 26, inCurrentMonth: false });
    expect(cells[6]).toEqual({ key: '2026-08-01', day: 1, inCurrentMonth: true });
    expect(cells[36]).toEqual({ key: '2026-08-31', day: 31, inCurrentMonth: true });
    expect(cells[41]).toEqual({ key: '2026-09-05', day: 5, inCurrentMonth: false });
    expect(cells.filter((cell) => cell.inCurrentMonth)).toHaveLength(31);
  });

  it('1 日が日曜の月は前月の埋めなしで始まる(2026 年 11 月)', () => {
    const cells = buildCalendarDayCells(2026, 10);
    expect(cells[0]).toEqual({ key: '2026-11-01', day: 1, inCurrentMonth: true });
    expect(cells).toHaveLength(42);
  });

  it('うるう年 2 月を正しく列挙する(2028 年 2 月)', () => {
    const cells = buildCalendarDayCells(2028, 1);
    expect(cells.filter((cell) => cell.inCurrentMonth)).toHaveLength(29);
    expect(
      cells.find((cell) => cell.key === '2028-02-29')?.inCurrentMonth,
    ).toBe(true);
  });
});

describe('表示整形 / 年グリッド', () => {
  it('formatFilterDateDisplay: キーをスラッシュ区切りへ(空は空のまま)', () => {
    expect(formatFilterDateDisplay('2026-08-27')).toBe('2026/08/27');
    expect(formatFilterDateDisplay('')).toBe('');
  });

  it('formatCalendarTitle: 「YYYY年 M月」', () => {
    expect(formatCalendarTitle(2026, 7)).toBe('2026年 8月');
    expect(formatCalendarTitle(2026, 0)).toBe('2026年 1月');
  });

  it('yearGridStart / buildYearGrid: 12 年境界へ揃えた 12 年ページ', () => {
    expect(yearGridStart(2026)).toBe(2016);
    expect(yearGridStart(2016)).toBe(2016);
    expect(yearGridStart(2015)).toBe(2004);
    const years = buildYearGrid(2026);
    expect(years).toHaveLength(12);
    expect(years[0]).toBe(2016);
    expect(years[11]).toBe(2027);
  });
});
