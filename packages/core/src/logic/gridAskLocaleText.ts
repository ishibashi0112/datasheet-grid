// 追加(英語対応): 入口 `/ai`(ことばで絞り込み)の文言です。既定は日本語で、`localeText` で差し替えます
//   (英語は locales/en.ts の gridAskLocaleTextEn)。反映した条件のチップの中身は、グリッドの条件の要約と同じ文言
//   (localeTextFilters.ts。GridLocaleText の一部)を使うので、その文言もここで受けます。
//   グリッドの本体の文言の表(localeText.ts)は読み込みません(/ai の JS を増やさないため)。
import type { GridLocaleText, GridLocaleTextTemplate } from '../model/gridTypes.core';
import { DEFAULT_FILTER_LOCALE_TEXT, type FilterLocaleTextKey } from './localeTextFilters';

// AI が答えに書く条件の種類です(列ごとに使えるものは filterType で決まります)。gridAsk.ts が公開します。
export type GridAskOp =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'between'
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'onOrAfter'
  | 'onOrBefore'
  | 'notEquals'
  | 'preset'
  | 'blank'
  | 'notBlank'
  | 'in'
  | 'notIn'
  | 'clear';

/**
 * `/ai`(`GridAskBar` / `useGridAsk` / `readGridAskAnswer` / `describeGridAskView`)の文言です。既定は日本語、
 * 英語は `gridAskLocaleTextEn`。反映した条件のチップの中身はグリッドの条件の要約と同じキー(`conditionContains` ほか)。
 */
export type GridAskLocaleText = Pick<GridLocaleText, FilterLocaleTextKey> & {
  // ── 入力欄と結果 ──
  /** 入力欄のプレースホルダー(`placeholder` を渡すとそちら)。既定 `ことばで絞り込み・並べ替え(例: 今月の分を金額の高い順に)`、英語 `Filter or sort in plain words (e.g. this month, largest amount first)`。 */
  placeholder: string;
  /** 入力欄の読み上げの名前(`label` を渡すとそちら)。既定 `ことばで絞り込み`、英語 `Filter in plain words`。 */
  label: string;
  /** 送るボタン。既定 `聞く`、英語 `Ask`。 */
  submit: string;
  /** 聞いている間のボタン。既定 `止める`、英語 `Stop`。 */
  stop: string;
  /** 例の文の前。既定 `例:`、英語 `Try:`。 */
  examples: string;
  /** 聞いている間。既定 `考えています…`、英語 `Thinking…`。 */
  thinking: string;
  /** 聞いている間の補足。既定 `Esc でも止まります`、英語 `Press Esc to stop`。 */
  escHint: string;
  /** 失敗したときのボタン。既定 `もう一度`、英語 `Try again`。 */
  retry: string;
  /** 反映した条件のチップの見出し。既定 `反映した条件`、英語 `Applied`。 */
  appliedTitle: string;
  /** 元に戻すボタン。既定 `元に戻す`、英語 `Undo`。 */
  undo: string;
  /** 閉じるボタン。既定 `閉じる`、英語 `Close`。 */
  close: string;
  /** チップの × の読み上げの名前。既定 `{label} {text} を外す`、英語 `Remove {label} {text}`。 */
  removeItem: GridLocaleTextTemplate<{ label: string; text: string }>;
  /** チップをすべて外したとき。既定 `条件はすべて外れています。`、英語 `All conditions have been removed.`。 */
  allRemoved: string;
  /** 答えで表が変わらなかったとき。既定 `変える条件はありませんでした。`、英語 `Nothing to change.`。 */
  unchanged: string;
  /** 元に戻したあと。既定 `元に戻しました。`、英語 `Undone.`。 */
  undone: string;
  /** 使えなかった部分の見出し。既定 `使えなかった部分`、英語 `Couldn't use`。 */
  droppedTitle: string;
  /** AI が「できなかった」と書いてきた文。既定 `AI から: {text}`、英語 `From the AI: {text}`。 */
  fromAi: GridLocaleTextTemplate<{ text: string }>;
  /** `ask` が失敗したとき(`error`)。既定 `AI に聞けませんでした。もう一度試してください。`、英語 `Couldn't reach the AI. Try again.`。 */
  askFailed: string;
  /** `grid` の ref が空のとき(`error`)。既定 `表が見つかりませんでした。表が出てから、もう一度試してください。`、英語 `The grid wasn't found. Try again once it's on the page.`。 */
  noGrid: string;
  /** 反映したあと表を手で変えたとき(`notice`)。既定 `表の条件が変わったので、ここからは変えられません。表のフィルターや並びで直してください。`、英語 `The grid's conditions have changed, so they can't be changed from here. Use the grid's filters and sorting.`。 */
  changedNotice: string;
  // ── 反映した条件のチップ ──
  /** 並びのチップの名前。既定 `並び`、英語 `Sort`。 */
  itemSort: string;
  /** 並びのチップの中身(1 列ぶん)。既定 `{column} {direction}`、英語 `{column} {direction}`。 */
  itemSortEntry: GridLocaleTextTemplate<{ column: string; direction: string }>;
  /** 昇順。既定 `昇順`、英語 `ascending`。 */
  ascending: string;
  /** 降順。既定 `降順`、英語 `descending`。 */
  descending: string;
  /** 検索の文字のチップの名前。既定 `検索`、英語 `Search`。 */
  itemSearch: string;
  /** 隠した列のチップの名前。既定 `隠した列`、英語 `Hidden`。 */
  itemHidden: string;
  // ── 使えなかった部分の理由 ──
  /** 理由に引く答えの文字の囲み。既定 `「{text}」`、英語 `"{text}"`。 */
  quote: GridLocaleTextTemplate<{ text: string }>;
  /** 引いた文字を並べるときの区切り。既定 ``、英語 `, `。 */
  quoteSeparator: string;
  /** 引く文字が空のとき。既定 `(空)`、英語 `(empty)`。 */
  emptyText: string;
  /** 列の名前が空のとき。既定 `(名前なし)`、英語 `(no name)`。 */
  unnamed: string;
  /** 引いた値が 6 つ以上のとき。既定 `{items}ほか {count} 件`、英語 `{items} and {count} more`。 */
  andMore: GridLocaleTextTemplate<{ items: string; count: number }>;
  /** 理由が多いときの最後の行。既定 `ほか {count} 件`、英語 `{count} more`。 */
  moreReasons: GridLocaleTextTemplate<{ count: number }>;
  /** 列についての理由。既定 `{column}: {reason}`、英語 `{column}: {reason}`。 */
  columnReason: GridLocaleTextTemplate<{ column: string; reason: string }>;
  /** 答えを読めないとき(`error`)。既定 `AI の答えを読めませんでした。言い方を変えて、もう一度試してください。`、英語 `Couldn't read the AI's answer. Try wording it differently.`。 */
  readError: string;
  /** 答えが表への指示でないとき(`error`)。既定 `AI の答えが表への指示になっていませんでした。言い方を変えてください。`、英語 `The AI's answer wasn't an instruction for the grid. Try wording it differently.`。 */
  shapeError: string;
  /** `allowFilter: false` のとき。既定 `列の条件は変えない設定です`、英語 `Column filters are locked`。 */
  filtersLocked: string;
  /** 無い列。既定 `{column}という列はありません`、英語 `There is no column {column}`。 */
  noSuchColumn: GridLocaleTextTemplate<{ column: string }>;
  /** 絞り込めない列。既定 `この列では絞り込めません`、英語 `This column can't be filtered`。 */
  notFilterable: string;
  /** 条件の種類が無いとき。既定 `条件の種類がありません`、英語 `The condition has no type`。 */
  noOperator: string;
  /** その列で使えない条件。既定 `この列では{operator}の条件は使えません`、英語 `{operator} can't be used on this column`。 */
  operatorUnavailable: GridLocaleTextTemplate<{ operator: string }>;
  /** 1 列に条件が 2 つ。既定 `条件は 1 列に 1 つまでです`、英語 `Only one condition per column`。 */
  oneCondition: string;
  /** 1 列に値の選択が 2 つ。既定 `値の選択は 1 列に 1 つまでです`、英語 `Only one value choice per column`。 */
  oneSelection: string;
  /** 読めない条件。既定 `読めない条件({count} 件)は使えません`、英語 `Unreadable conditions ({count}) can't be used`。 */
  unreadableFilters: GridLocaleTextTemplate<{ count: number }>;
  /** 数の範囲の両端が無い。既定 `範囲の両端の数がありません`、英語 `The range needs two numbers`。 */
  noNumberRange: string;
  /** 数として読めない。既定 `{value}は数として読めません`、英語 `{value} is not a number`。 */
  notNumber: GridLocaleTextTemplate<{ value: string }>;
  /** 文字の条件が空。既定 `探す文字がありません`、英語 `No text to look for`。 */
  noText: string;
  /** 文字の条件が長すぎる。既定 `探す文字は {limit} 字までです`、英語 `Text to look for can be up to {limit} characters`。 */
  textTooLong: GridLocaleTextTemplate<{ limit: number }>;
  /** 無いプリセット。既定 `{value}という期間は使えません`、英語 `{value} is not an available period`。 */
  unknownPeriod: GridLocaleTextTemplate<{ value: string }>;
  /** 日付の範囲の両端が無い。既定 `範囲の両端の日付がありません`、英語 `The range needs two dates`。 */
  noDateRange: string;
  /** 日付として読めない。既定 `{value}は日付として読めません`、英語 `{value} is not a date`。 */
  notDate: GridLocaleTextTemplate<{ value: string }>;
  /** 値の選択が空。既定 `選ぶ値がありません`、英語 `No values to choose`。 */
  noValues: string;
  /** 選べる値が 1 つも無い。既定 `選べる値がありません`、英語 `None of the values can be chosen`。 */
  noSelectableValues: string;
  /** 選ぶ値が多すぎる。既定 `選べる値は {limit} 件までです({count} 件は使いませんでした)`、英語 `Up to {limit} values can be chosen ({count} not used)`。 */
  tooManyValues: GridLocaleTextTemplate<{ limit: number; count: number }>;
  /** 候補に無い値(いくつか)。既定 `{values}は候補にありません`、英語 `Not in the list: {values}`。 */
  notInOptions: GridLocaleTextTemplate<{ values: string }>;
  /** 候補に無い値。既定 `{value}は候補にありません`、英語 `{value} is not in the list`。 */
  notAnOption: GridLocaleTextTemplate<{ value: string }>;
  /** その値では絞り込めない。既定 `{value}では絞り込めません`、英語 `Can't filter by {value}`。 */
  cannotFilterBy: GridLocaleTextTemplate<{ value: string }>;
  /** 長すぎる値。既定 `{limit} 字を超える値は使えません`、英語 `Values over {limit} characters can't be used`。 */
  valueTooLong: GridLocaleTextTemplate<{ limit: number }>;
  /** 長すぎる値(いくつか)。既定 `{limit} 字を超える値({count} 件)は使えません`、英語 `Values over {limit} characters ({count}) can't be used`。 */
  valuesTooLong: GridLocaleTextTemplate<{ limit: number; count: number }>;
  /** 値として読めないもの。既定 `値として読めないもの({count} 件)は使えません`、英語 `Unreadable values ({count}) can't be used`。 */
  unreadableValues: GridLocaleTextTemplate<{ count: number }>;
  /** `allowSort: false` のとき。既定 `並びは変えない設定です`、英語 `Sorting is locked`。 */
  sortLocked: string;
  /** 並びの無い列。既定 `並び: {column}という列はありません`、英語 `Sort: there is no column {column}`。 */
  sortNoSuchColumn: GridLocaleTextTemplate<{ column: string }>;
  /** 並びの向きが読めない。既定 `並び: {column} の向き{direction}は使えません`、英語 `Sort: {direction} can't be used for {column}`。 */
  sortBadDirection: GridLocaleTextTemplate<{ column: string; direction: string }>;
  /** 検索の文字が読めない。既定 `検索の文字を読めませんでした`、英語 `Couldn't read the search text`。 */
  searchUnreadable: string;
  /** `allowSearch: false` のとき。既定 `検索の文字は変えない設定です`、英語 `The search text is locked`。 */
  searchLocked: string;
  /** 検索の文字が長すぎる。既定 `検索の文字は {limit} 字までです`、英語 `The search text can be up to {limit} characters`。 */
  searchTooLong: GridLocaleTextTemplate<{ limit: number }>;
  /** `allowColumnVisibility` が無いとき。既定 `列の表示は変えない設定です`、英語 `Column visibility is locked`。 */
  columnsLocked: string;
  /** 読めない列の指定。既定 `読めない列の指定({count} 件)は使えません`、英語 `Unreadable column changes ({count}) can't be used`。 */
  unreadableColumns: GridLocaleTextTemplate<{ count: number }>;
  /** すべての列を隠す答え。既定 `すべての列は隠せません`、英語 `All columns can't be hidden`。 */
  cannotHideAll: string;
  /** `operatorUnavailable` の `{operator}` に入る条件の名前(条件の記号ごと)。 */
  operatorLabels: Readonly<Record<GridAskOp, string>>;
};

export const DEFAULT_GRID_ASK_LOCALE_TEXT: GridAskLocaleText = {
  ...DEFAULT_FILTER_LOCALE_TEXT,
  placeholder: 'ことばで絞り込み・並べ替え(例: 今月の分を金額の高い順に)',
  label: 'ことばで絞り込み',
  submit: '聞く',
  stop: '止める',
  examples: '例:',
  thinking: '考えています…',
  escHint: 'Esc でも止まります',
  retry: 'もう一度',
  appliedTitle: '反映した条件',
  undo: '元に戻す',
  close: '閉じる',
  removeItem: '{label} {text} を外す',
  allRemoved: '条件はすべて外れています。',
  unchanged: '変える条件はありませんでした。',
  undone: '元に戻しました。',
  droppedTitle: '使えなかった部分',
  fromAi: 'AI から: {text}',
  askFailed: 'AI に聞けませんでした。もう一度試してください。',
  noGrid: '表が見つかりませんでした。表が出てから、もう一度試してください。',
  changedNotice: '表の条件が変わったので、ここからは変えられません。表のフィルターや並びで直してください。',
  itemSort: '並び',
  itemSortEntry: '{column} {direction}',
  ascending: '昇順',
  descending: '降順',
  itemSearch: '検索',
  itemHidden: '隠した列',
  quote: '「{text}」',
  quoteSeparator: '',
  emptyText: '(空)',
  unnamed: '(名前なし)',
  andMore: '{items}ほか {count} 件',
  moreReasons: 'ほか {count} 件',
  columnReason: '{column}: {reason}',
  readError: 'AI の答えを読めませんでした。言い方を変えて、もう一度試してください。',
  shapeError: 'AI の答えが表への指示になっていませんでした。言い方を変えてください。',
  filtersLocked: '列の条件は変えない設定です',
  noSuchColumn: '{column}という列はありません',
  notFilterable: 'この列では絞り込めません',
  noOperator: '条件の種類がありません',
  operatorUnavailable: 'この列では{operator}の条件は使えません',
  oneCondition: '条件は 1 列に 1 つまでです',
  oneSelection: '値の選択は 1 列に 1 つまでです',
  unreadableFilters: '読めない条件({count} 件)は使えません',
  noNumberRange: '範囲の両端の数がありません',
  notNumber: '{value}は数として読めません',
  noText: '探す文字がありません',
  textTooLong: '探す文字は {limit} 字までです',
  unknownPeriod: '{value}という期間は使えません',
  noDateRange: '範囲の両端の日付がありません',
  notDate: '{value}は日付として読めません',
  noValues: '選ぶ値がありません',
  noSelectableValues: '選べる値がありません',
  tooManyValues: '選べる値は {limit} 件までです({count} 件は使いませんでした)',
  notInOptions: '{values}は候補にありません',
  notAnOption: '{value}は候補にありません',
  cannotFilterBy: '{value}では絞り込めません',
  valueTooLong: '{limit} 字を超える値は使えません',
  valuesTooLong: '{limit} 字を超える値({count} 件)は使えません',
  unreadableValues: '値として読めないもの({count} 件)は使えません',
  sortLocked: '並びは変えない設定です',
  sortNoSuchColumn: '並び: {column}という列はありません',
  sortBadDirection: '並び: {column} の向き{direction}は使えません',
  searchUnreadable: '検索の文字を読めませんでした',
  searchLocked: '検索の文字は変えない設定です',
  searchTooLong: '検索の文字は {limit} 字までです',
  columnsLocked: '列の表示は変えない設定です',
  unreadableColumns: '読めない列の指定({count} 件)は使えません',
  cannotHideAll: 'すべての列は隠せません',
  operatorLabels: {
    '=': 'に等しい',
    '!=': 'に等しくない',
    '>': 'より大きい',
    '>=': '以上',
    '<': '未満',
    '<=': '以下',
    between: '範囲',
    contains: 'を含む',
    equals: 'に等しい',
    startsWith: 'で始まる',
    endsWith: 'で終わる',
    onOrAfter: '以降',
    onOrBefore: '以前',
    notEquals: 'に等しくない',
    preset: '今日・今月など',
    blank: '空白',
    notBlank: '空白でない',
    in: '値を選ぶ',
    notIn: '値を除く',
    clear: '外す',
  },
};

// 渡された文言を既定と合わせます(値の無いキーは既定のまま)。
// 変更(英語対応の見直し): null も既定のままにします(JS や型の変換で渡りうる。置き換えのときに落ちないように)。
export const resolveGridAskLocaleText = (input: Partial<GridAskLocaleText> | undefined): GridAskLocaleText => {
  if (!input) {
    return DEFAULT_GRID_ASK_LOCALE_TEXT;
  }
  const result: Record<string, unknown> = { ...DEFAULT_GRID_ASK_LOCALE_TEXT };
  for (const key of Object.keys(input) as (keyof GridAskLocaleText)[]) {
    if (input[key] != null) {
      result[key] = input[key];
    }
  }
  return result as GridAskLocaleText;
};