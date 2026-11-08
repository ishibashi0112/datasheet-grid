// 追加(段階 2 DU-18): グリッドの文言(localeText prop)の既定値と、テンプレートの置き換えです。
//   既定は日本語です(これまでバーだけ英語が混ざっていた)。文言のキーと意味は gridTypes.core の GridLocaleText。
import type { GridLocaleText } from '../model/gridTypes.core';

export const DEFAULT_GRID_LOCALE_TEXT: Readonly<GridLocaleText> = {
  rowCount: '行 {shown} / {total}',
  columnCount: '列 {shown} / {total}',
  filterSummary: '絞り込み: {value}',
  filterGlobal: '「{text}」',
  filterColumns: '{count} 列',
  sortSummary: '並び替え: {value}',
  sortEntry: '{column}({direction})',
  sortAscending: '昇順',
  sortDescending: '降順',
  activeCell: 'セル {cell}',
  selection: '範囲 {range}',
  selectionSize: '{cells} セル / {rows} 行',
  selectedColumns: '{count} 列',
  aggregateAverage: '平均',
  aggregateCount: 'データの個数',
  aggregateSum: '合計',
  aggregateComputing: '集計中… {percent}%',
  aggregatePartial: '読み込み済みの行のみ',
  none: 'なし',
  listSeparator: '、',
};

// `{name}` を値に置き換えます(値の無い名前はそのまま残す)。
export const formatLocaleText = (template: string, values: Readonly<Record<string, string | number>>): string =>
  template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });

// 渡された文言を既定と合わせます。中身が前と同じなら前の結果を返します(localeText={{ … }} をその場で書いても、
//   バーの要約を描くたびに作り直さないため)。
export const createLocaleTextResolver = () => {
  let lastInput: Partial<GridLocaleText> | undefined;
  let lastResult: Readonly<GridLocaleText> = DEFAULT_GRID_LOCALE_TEXT;
  return (input: Partial<GridLocaleText> | undefined): Readonly<GridLocaleText> => {
    if (input === lastInput || isSameLocaleInput(input, lastInput)) {
      lastInput = input;
      return lastResult;
    }
    lastInput = input;
    lastResult = input === undefined ? DEFAULT_GRID_LOCALE_TEXT : { ...DEFAULT_GRID_LOCALE_TEXT, ...withoutUndefined(input) };
    return lastResult;
  };
};

const withoutUndefined = (input: Partial<GridLocaleText>): Partial<GridLocaleText> => {
  const result: Partial<Record<keyof GridLocaleText, string>> = {};
  for (const key of Object.keys(input) as (keyof GridLocaleText)[]) {
    const value = input[key];
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
};

const isSameLocaleInput = (a: Partial<GridLocaleText> | undefined, b: Partial<GridLocaleText> | undefined): boolean => {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  const aKeys = Object.keys(a) as (keyof GridLocaleText)[];
  if (aKeys.length !== Object.keys(b).length) {
    return false;
  }
  return aKeys.every((key) => a[key] === b[key]);
};
