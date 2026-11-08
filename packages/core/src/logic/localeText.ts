// 追加(段階 2 DU-18): グリッドの文言(localeText prop)の既定値と、テンプレートの置き換えです。
//   既定は日本語です。文言のキーと意味は gridTypes.core の GridLocaleText。
// 変更(英語対応): グリッドが自分で出す文言をすべて表にしました。ここは最初に読み込む部品(本体・バー・メニュー・
//   チップ・検索・フィルなど)が使う文言です。遅れて読み込む部品(列フィルター・ツールパネル)だけが使う文言は
//   localeTextPopups.ts に分けてあります(初期 JS を増やさないため。合わせて GridLocaleText のすべてのキー)。条件の要約の文言は
//   AI バーも使うので localeTextFilters.ts に分けてあり、ここで合わせます。
import type { GridLocaleText } from '../model/gridTypes.core';
import { DEFAULT_FILTER_LOCALE_TEXT } from './localeTextFilters';

export { formatLocaleText } from './localeTextFilters';

export const DEFAULT_GRID_LOCALE_TEXT = {
  ...DEFAULT_FILTER_LOCALE_TEXT,
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
  detailColumnName: '詳細',
  rowDragColumnName: '移動',
  none: 'なし',
  listSeparator: '、',
  globalFilterPlaceholder: 'グローバルフィルター',
  globalFilterLabel: '表全体を検索',
  clearGlobalFilter: 'フィルターをクリア',
  toggleFilterPanel: 'フィルター管理パネルを開閉',
  clear: 'クリア',
  close: '閉じる',
  retry: '再試行',
  noOptions: '候補がありません',
  noRows: '表示する行がありません',
  noMatchingRows: '一致する行がありません',
  selectAllRows: 'すべての行を選択',
  selectRow: '行 {row} を選択',
  sortedAscending: '昇順で並び替え中',
  sortedDescending: '降順で並び替え中',
  sortPriority: ' (優先度 {priority})',
  columnFiltered: 'フィルター適用中',
  dragColumn: 'ドラッグで列を移動',
  columnMenu: '列メニュー',
  columnMenuFor: '{column} の列メニュー',
  showDetails: '詳細を開く',
  hideDetails: '詳細を閉じる',
  editCell: '{column} を編集',
  cellInput: 'セルへの入力',
  sizingColumns: '列幅を計算中…',
  applyingFilter: '適用中 {percent}%',
  resetColumnsHint: 'すべての列の幅・固定・表示・並び順を初期状態に戻します',
  toolPanelFilters: 'フィルター',
  toolPanelSort: '並び替え',
  toolPanelColumns: '列',
  invalidValue: '入力値が不正です',
  enterNumber: '数値で入力してください',
  enterInteger: '整数で入力してください',
  enterMin: '{min} 以上で入力してください',
  enterMax: '{max} 以下で入力してください',
  enterRange: '{min}〜{max} で入力してください',
  saveFailedCell: '保存に失敗しました。値を戻しました',
  totalRowLabel: '合計',
  totalAverage: '平均',
  totalMin: '最小',
  totalMax: '最大',
  totalCount: '個数',
  exportSubtotal: '{label} 小計',
} satisfies Partial<GridLocaleText>;

// 最初に読み込む部品の文言のキー(機能だけが使う文言は logic/localeText<機能>.ts、遅れて読み込む部品の文言は
//   localeTextPopups.ts)。
export type GridMainLocaleTextKey = keyof typeof DEFAULT_GRID_LOCALE_TEXT;

// グリッドが部品へ渡す文言: 最初に読み込む部品の文言はすべて入っていて、ほかは利用側が渡したものだけ入っています
//   (遅れて読み込む部品は localeTextPopups.ts の resolvePopupLocaleText で残りを既定で埋める)。
export type ResolvedGridLocaleText = Readonly<Pick<GridLocaleText, GridMainLocaleTextKey> & Partial<GridLocaleText>>;

// 追加(英語対応): 機能の部品が読む文言の型。機能だけが使う文言(logic/localeText<機能>.ts。例: DEFAULT_FIND_LOCALE_TEXT)は
//   機能の localeText として機能セットに入っていて、シェルが本体の既定と合わせて渡します(createLocaleTextResolver の
//   defaults)。D はその表の型(typeof DEFAULT_FIND_LOCALE_TEXT)。
export type FeatureLocaleText<D> = ResolvedGridLocaleText & Readonly<Pick<GridLocaleText, keyof D & keyof GridLocaleText>>;

// 渡された文言を既定と合わせます。中身が前と同じなら前の結果を返します(localeText={{ … }} をその場で書いても、
//   描くたびに作り直さないため。関数は参照で比べる)。
// 変更(英語対応): defaults = 既定(本体の既定に、機能セットの機能の文言の既定を重ねたもの)。
export const createLocaleTextResolver = (defaults: ResolvedGridLocaleText = DEFAULT_GRID_LOCALE_TEXT) => {
  let lastInput: Partial<GridLocaleText> | undefined;
  let lastResult: ResolvedGridLocaleText = defaults;
  return (input: Partial<GridLocaleText> | undefined): ResolvedGridLocaleText => {
    if (input === lastInput || isSameLocaleInput(input, lastInput)) {
      lastInput = input;
      return lastResult;
    }
    lastInput = input;
    lastResult = input === undefined ? defaults : { ...defaults, ...withoutUndefined(input) };
    return lastResult;
  };
};

// 値の無いキー(undefined)を除きます(既定を undefined で消さないため)。
export const withoutUndefined = (input: Partial<GridLocaleText>): Partial<GridLocaleText> => {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(input) as (keyof GridLocaleText)[]) {
    const value = input[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<GridLocaleText>;
};

const isSameLocaleInput = (a: Partial<GridLocaleText> | undefined, b: Partial<GridLocaleText> | undefined): boolean => {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  const aKeys = Object.keys(a) as (keyof GridLocaleText)[];
  if (aKeys.length !== Object.keys(b).length) {
    return false;
  }
  return aKeys.every((key) => isSameLocaleValue(a[key], b[key]));
};

// 配列(曜日・月)は中身で比べます(その場で書いた配列でも作り直さない)。
const isSameLocaleValue = (a: unknown, b: unknown): boolean =>
  a === b ||
  (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => item === b[index]));