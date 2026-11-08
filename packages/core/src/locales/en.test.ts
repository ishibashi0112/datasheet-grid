// 追加(英語対応): 英語の文言の表が既定(日本語)と同じキーを持ち、日本語が 1 文字も残っていないこと。
import { describe, expect, it } from 'vitest';

import { DEFAULT_GRID_ASK_LOCALE_TEXT } from '../logic/gridAskLocaleText';
import { DEFAULT_GRID_LOCALE_TEXT, formatLocaleText } from '../logic/localeText';
import { DEFAULT_FILTER_LOCALE_TEXT } from '../logic/localeTextFilters';
import { DEFAULT_POPUP_LOCALE_TEXT } from '../logic/localeTextPopups';
import { DEFAULT_AGGREGATES_LOCALE_TEXT } from '../logic/localeTextFeatures';
import { DEFAULT_COLUMN_MENU_LOCALE_TEXT } from '../logic/localeTextFeatures';
import { DEFAULT_FILL_HANDLE_LOCALE_TEXT } from '../logic/localeTextFeatures';
import { DEFAULT_FILTERING_LOCALE_TEXT } from '../logic/localeTextFeatures';
import { DEFAULT_FIND_LOCALE_TEXT } from '../logic/localeTextFeatures';
import { DEFAULT_GROUPING_LOCALE_TEXT } from '../logic/localeTextFeatures';
import { DEFAULT_ROW_DRAG_LOCALE_TEXT } from '../logic/localeTextFeatures';
import { DEFAULT_SCROLL_HINT_LOCALE_TEXT } from '../logic/localeTextFeatures';
import { DEFAULT_SERVER_SIDE_LOCALE_TEXT } from '../logic/localeTextFeatures';
import { gridAskLocaleTextEn, localeTextEn } from './en';

const JAPANESE = /[぀-ヿ㐀-鿿！-｠]/;

// どのキーを読んでも同じ値を返す値の入れ物(関数の文言に渡す)。
const sampleValues = (value: string | number) =>
  new Proxy({}, { get: (_target, key) => (typeof key === 'string' ? value : undefined) }) as Record<string, string | number>;

// 文言を文字列にして集める(関数は 1 と 3 と文字列で呼ぶ。配列 / オブジェクトは中身)。
const collectTexts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') {
    return [1, 3, 'x'].map((sample) => formatLocaleText(value as (values: Record<string, string | number>) => string, sampleValues(sample)));
  }
  if (Array.isArray(value)) return value.flatMap(collectTexts);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(collectTexts);
  return [];
};

const sortedKeys = (value: object) => Object.keys(value).sort();

// 既定(日本語)の表: 本体・遅れて読み込む部品・機能ごと。合わせて GridLocaleText のすべてのキー。
const DEFAULT_TABLES = {
  main: DEFAULT_GRID_LOCALE_TEXT,
  popup: DEFAULT_POPUP_LOCALE_TEXT,
  aggregates: DEFAULT_AGGREGATES_LOCALE_TEXT,
  columnMenu: DEFAULT_COLUMN_MENU_LOCALE_TEXT,
  fillHandle: DEFAULT_FILL_HANDLE_LOCALE_TEXT,
  filtering: DEFAULT_FILTERING_LOCALE_TEXT,
  find: DEFAULT_FIND_LOCALE_TEXT,
  grouping: DEFAULT_GROUPING_LOCALE_TEXT,
  rowDrag: DEFAULT_ROW_DRAG_LOCALE_TEXT,
  scrollHint: DEFAULT_SCROLL_HINT_LOCALE_TEXT,
  serverSide: DEFAULT_SERVER_SIDE_LOCALE_TEXT,
};

describe('localeTextEn', () => {
  it('既定の表(本体・遅れて読み込む部品・機能ごと)を合わせたものと同じキーを持ち、表どうしのキーは重ならない', () => {
    const allKeys = Object.values(DEFAULT_TABLES).flatMap((table) => Object.keys(table));
    expect(allKeys.filter((key, index) => allKeys.indexOf(key) !== index)).toEqual([]);
    expect(sortedKeys(localeTextEn)).toEqual([...allKeys].sort());
  });

  it('条件の要約の文言は本体の既定にもあり、同じ値', () => {
    for (const [key, value] of Object.entries(DEFAULT_FILTER_LOCALE_TEXT)) {
      expect(DEFAULT_GRID_LOCALE_TEXT[key as keyof typeof DEFAULT_GRID_LOCALE_TEXT]).toBe(value);
    }
  });

  it('日本語が残っていない(関数の文言は値を入れて確かめる)', () => {
    const japanese = Object.entries(localeTextEn).flatMap(([key, value]) =>
      collectTexts(value)
        .filter((text) => JAPANESE.test(text))
        .map((text) => `${key}: ${text}`),
    );
    expect(japanese).toEqual([]);
  });

  it('数で言い方が変わる', () => {
    expect(formatLocaleText(localeTextEn.filterColumns, { count: 1 })).toBe('1 column');
    expect(formatLocaleText(localeTextEn.filterColumns, { count: 3 })).toBe('3 columns');
    expect(formatLocaleText(localeTextEn.selectionSize, { cells: 1, rows: 1 })).toBe('1 cell / 1 row');
    expect(formatLocaleText(localeTextEn.selectionSize, { cells: 6, rows: 2 })).toBe('6 cells / 2 rows');
  });

  it('曜日は 7 つ、月は 12', () => {
    expect(localeTextEn.calendarWeekdays).toHaveLength(7);
    expect(localeTextEn.calendarMonths).toHaveLength(12);
    expect(DEFAULT_POPUP_LOCALE_TEXT.calendarWeekdays).toHaveLength(7);
    expect(DEFAULT_POPUP_LOCALE_TEXT.calendarMonths).toHaveLength(12);
  });
});

describe('gridAskLocaleTextEn', () => {
  it('既定と同じキーをすべて持つ(条件の演算子の名前も)', () => {
    expect(sortedKeys(gridAskLocaleTextEn)).toEqual(sortedKeys(DEFAULT_GRID_ASK_LOCALE_TEXT));
    expect(sortedKeys(gridAskLocaleTextEn.operatorLabels)).toEqual(sortedKeys(DEFAULT_GRID_ASK_LOCALE_TEXT.operatorLabels));
  });

  it('日本語が残っていない', () => {
    const japanese = Object.entries(gridAskLocaleTextEn).flatMap(([key, value]) =>
      collectTexts(value)
        .filter((text) => JAPANESE.test(text))
        .map((text) => `${key}: ${text}`),
    );
    expect(japanese).toEqual([]);
  });

  it('条件の要約の文言はグリッドの英語と同じ', () => {
    for (const key of Object.keys(DEFAULT_FILTER_LOCALE_TEXT) as (keyof typeof DEFAULT_FILTER_LOCALE_TEXT)[]) {
      expect(gridAskLocaleTextEn[key]).toBe(localeTextEn[key]);
    }
  });
});