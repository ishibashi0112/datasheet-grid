// 追加(英語対応): 条件の要約(フィルターのチップ・管理パネル・列フィルターのまとめ・AI バーのチップ)の文言の既定(日本語)と、
//   テンプレートの置き換えです。グリッドの文言の表(localeText.ts の DEFAULT_GRID_LOCALE_TEXT)の一部で、AI バー(/ai)も
//   使うので、表の残りを読み込まないよう別のファイルにしてあります。
import type { GridLocaleText, GridLocaleTextTemplate } from '../model/gridTypes.core';

export const DEFAULT_FILTER_LOCALE_TEXT = {
  blank: '(空白)',
  filterNone: 'フィルターなし',
  filterCustom: 'カスタム条件',
  filterExcluded: '{count} 件を除外',
  filterExcludedValues: '{values} を除外',
  filterSelected: '{count} 件を選択',
  filterMatches: '"{value}" に一致',
  filterBoth: '{condition} かつ {set}',
  conditionGreaterThanOrEqual: '{value} 以上',
  conditionGreaterThan: '{value} より大きい',
  conditionLessThanOrEqual: '{value} 以下',
  conditionLessThan: '{value} 未満',
  conditionEquals: '{value} に等しい',
  conditionNotEquals: '{value} に等しくない',
  conditionRange: '{min} 〜 {max}',
  conditionOnOrAfter: '{value} 以降',
  conditionOnOrBefore: '{value} 以前',
  conditionContains: '"{value}" を含む',
  conditionStartsWith: '"{value}" で始まる',
  conditionEndsWith: '"{value}" で終わる',
  conditionBlank: '(空白)',
  conditionNotBlank: '(空白でない)',
  datePresetToday: '今日',
  datePresetThisMonth: '今月',
  datePresetLast30Days: '過去 30 日',
} satisfies Partial<GridLocaleText>;

// 列フィルターの演算子のラベルの文言のキー(遅れて読み込む部品の文言)。
export type FilterOperatorLocaleTextKey =
  | 'operatorEquals'
  | 'operatorNotEquals'
  | 'operatorGreaterThanOrEqual'
  | 'operatorGreaterThan'
  | 'operatorLessThanOrEqual'
  | 'operatorLessThan'
  | 'operatorBetween'
  | 'operatorContains'
  | 'operatorStartsWith'
  | 'operatorEndsWith'
  | 'operatorOnOrAfter'
  | 'operatorOnOrBefore'
  | 'operatorBlank'
  | 'operatorNotBlank';

// 条件の要約の文言のキーと、その文言。
export type FilterLocaleTextKey = keyof typeof DEFAULT_FILTER_LOCALE_TEXT;
export type FilterLocaleText = Readonly<Pick<GridLocaleText, FilterLocaleTextKey>>;

// `{name}` を値に置き換えます(値の無い名前はそのまま残す)。関数ならその関数に値を渡した結果です。
export const formatLocaleText = <P extends Readonly<Record<string, string | number>>>(
  template: GridLocaleTextTemplate<P>,
  values: P,
): string =>
  typeof template === 'function'
    ? template(values)
    : template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = values[name];
        return value === undefined ? match : String(value);
      });