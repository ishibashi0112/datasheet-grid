// 追加(date-picker B): 内製日付ピッカー(FilterDateField)のカレンダー計算(純ロジック)です。
//   ドリルアップ方式(日 → 月 → 年)の各ビューが使う「表示セルの列挙」と表示整形を担います。
//   キーは既存フィルター評価と同じ 'YYYY-MM-DD'(ローカルタイム基準)で統一します。

import { formatDateKey } from './filtering';

// 日ビュー 1 セルです。key はローカルタイム基準の日付キー、inCurrentMonth=false は前後月の埋めです。
export type CalendarDayCell = {
  key: string;
  day: number;
  inCurrentMonth: boolean;
};

// 変更(英語対応): 曜日(日曜始まり)と月のラベル・日ビューのタイトルは文言の表(localeText の calendarWeekdays /
//   calendarMonths / calendarTitle)へ移しました。

// 日ビューのセルを列挙します。日曜始まり・常に 6 週 42 セル固定です
//   (月によって行数が変わるとパネル高さが揺れ、ナビ操作でボタン位置がずれるため)。
export const buildCalendarDayCells = (
  year: number,
  monthIndex: number,
): CalendarDayCell[] => {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startOffset = firstOfMonth.getDay(); // 日曜 = 0
  const cells: CalendarDayCell[] = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(year, monthIndex, 1 - startOffset + index);
    cells.push({
      key: formatDateKey(date),
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === monthIndex,
    });
  }
  return cells;
};

// 'YYYY-MM-DD' → 'YYYY/MM/DD'(入力フィールドの表示形式)。空はそのまま空です。
export const formatFilterDateDisplay = (key: string): string =>
  key === '' ? '' : key.replaceAll('-', '/');

// 年ビュー(12 年 / ページ)の先頭年です。12 年境界へ揃えます(2026 → 2016)。
export const yearGridStart = (year: number): number => year - (year % 12);

// 年ビューに列挙する 12 年です。
export const buildYearGrid = (year: number): number[] => {
  const start = yearGridStart(year);
  const years: number[] = [];
  for (let offset = 0; offset < 12; offset += 1) {
    years.push(start + offset);
  }
  return years;
};
