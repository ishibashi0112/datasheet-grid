import type { ColumnFilterValue, GridColumn } from '../model/gridTypes.unbound';
// 追加(filter-ext B): numberSet の条件部の表示文字列です(「10 以上」等。演算子ラベルと対応)。
import { formatParsedNumberFilter } from './numberFilterCondition';
// 追加(filter-ext C): textSet の条件部の表示文字列です(「"x" を含む」等)。
import { formatParsedTextFilter } from './textFilterCondition';
// 追加(filter-ext D): dateSet の条件部の表示文字列です(「2026-01-01 〜 …」「過去 30 日」等)。
import { formatParsedDateFilter } from './dateFilterCondition';
// 追加(preset-opt): dateSet カスタムプリセットのラベル逆引き用の正規形です。
import { normalizeDateFilterPresets, type NormalizedDateFilterPreset } from './dateFilterPresets';
// 追加(英語対応): 要約の文言(localeText の一部。既定 = 日本語)。
import { DEFAULT_FILTER_LOCALE_TEXT, formatLocaleText, type FilterLocaleText } from './localeTextFilters';

// 追加(FM-1 / フィルター管理パネル): 列フィルター値(判別共用体)を人間可読な要約文字列へ
//   変換する純関数です。FilterManagementPanel の一覧行で使い、FM-2(フィルターチップバー)
//   でも共用予定です。
// 仕様(ユーザー合意済み):
//   - text / date  : 「"x" を含む」(部分一致。判定側と同じく trim 後の値を表示)
//   - select       : 「"x" に一致」(完全一致)
//   - number       : raw 式そのまま(">= 1000" / "100..500" 等。式として解釈不可のときも
//                    raw = contains のフォールバック needle なのでそのまま出します)
//   - set(include): 1〜2 件は値を列挙(空文字セル値は Excel 流に「(空白)」)。3 件以上は
//                    「N 件を選択」。0 件 = 全行非表示も「0 件を選択」(reducer 側で通常は
//                    clear 済みの防御表示)。母数(全候補数)はフィルター値に保存されない
//                    (収集コストが高い)ため出しません。
//   - set(exclude): 「N 件を除外」(values は非選択値 = 除外対象そのもの)
//                    変更(1.0.2 / 2026-11-09 実アプリの総点検 I-04): 1〜2 件は include と同じく値を並べて
//                    「"x", "y" を除外」(何を除いたかがフィルターの画面を開かないと分からなかった)。
//   - custom       : value が非空 string なら「"x"」(trim)、それ以外は「カスタム条件」
//     (custom の中身は利用側 filterFn の自由形のため、汎用の安全側表示に留めます)

// 追加(dogfood DU-07): 要約の表し方です(列ごと。createColumnFilterDescribeOptions で列から作る)。
export type ColumnFilterDescribeOptions = {
  // dateSet のカスタムプリセット(ラベルの逆引き。未指定 = ビルトインのみ)。
  datePresets?: readonly NormalizedDateFilterPreset[];
  // select / set の値 → 表示(列の filterOptions / select エディタの選択肢のラベル)。undefined なら値をそのまま出します。
  labelOf?: (value: string) => string | undefined;
  // 数値の条件(number / numberSet)の数値 → 表示(列の valueFormatter)。
  formatNumber?: (value: number) => string;
  // 追加(英語対応): 要約の文言(未指定 = 日本語の既定)。
  texts?: FilterLocaleText;
};

// set の値表示です。空文字セル値は「(空白)」と表示します(セル値の String 化で空になった
//   値も候補として選択できる仕様のため、無表示だと「", "」のような欠けた列挙になります)。
// 変更(dogfood DU-07): ラベルがあればラベルを出します(これまでは「"mansion"」と値が出ていた)。
const formatSetValue = (
  value: string,
  labelOf: ((value: string) => string | undefined) | undefined,
  texts: FilterLocaleText,
): string => (value === '' ? texts.blank : `"${labelOf?.(value) ?? value}"`);

// 追加(別視点のレビュー): numberSet の選択のキー(数を String にしたもの)に数値の書き方を当てます。読めないキーは undefined。
const formatNumericKey = (key: string, formatNumber: ((value: number) => string) | undefined): string | undefined => {
  if (!formatNumber || key.trim() === '') {
    return undefined;
  }
  const value = Number(key);
  return Number.isFinite(value) ? formatNumber(value) : undefined;
};

// 追加(filter-ext B): set 選択(mode + values)の要約です。kind:'set' と kind:'numberSet' の
//   set 部分が共有します(include 1〜2 件は列挙 / 3 件以上は件数 / exclude は除外件数)。
const describeSetSelection = (
  mode: 'include' | 'exclude' | undefined,
  values: string[],
  labelOf: ((value: string) => string | undefined) | undefined,
  texts: FilterLocaleText,
): string => {
  const listed = values.length > 0 && values.length <= 2 ? values.map((value) => formatSetValue(value, labelOf, texts)).join(', ') : null;
  // mode 省略は include 扱いです(反転set 導入前の値との後方互換)。
  if ((mode ?? 'include') === 'exclude') {
    // 追加(1.0.2 / レビュー QB-3): 自前の言語の表で filterExcluded だけを訳し、1.0.2 で足した filterExcludedValues を渡していない
    //   ときは、これまでどおり件数の文言(訳したもの)を使います(既定の日本語に戻らないように)。
    const valuesUntranslated =
      texts.filterExcludedValues === DEFAULT_FILTER_LOCALE_TEXT.filterExcludedValues &&
      texts.filterExcluded !== DEFAULT_FILTER_LOCALE_TEXT.filterExcluded;
    return listed === null || valuesUntranslated
      ? formatLocaleText(texts.filterExcluded, { count: values.length })
      : formatLocaleText(texts.filterExcludedValues, { values: listed });
  }
  if (listed !== null) {
    return listed;
  }
  return formatLocaleText(texts.filterSelected, { count: values.length });
};

// 追加(dogfood DU-07): 列から要約の表し方を作ります。
//   - ラベル: filterOptions → select エディタの選択肢(配列のとき)の順で探します。無ければ値のまま。
//     変更(別視点のレビュー): 値(文字列のキー)に valueFormatter は当てません。キーはセルの値を String にしたもので、
//     真偽値の列の 'false' を渡すと真として「有効」になっていました(列フィルターのポップオーバーの候補も値のまま)。
//   - 数値: valueFormatter があれば当てます(「100000 以下」→「100,000 以下」。行は無いので row は undefined。
//     例外や空の文字列は値のまま)。numberSet の選択は、数として読めるキーだけ数にして当てます。
// 変更(英語対応): 要約の文言を任意で受けます(dateSet のプリセットのラベルにも使う)。
export const createColumnFilterDescribeOptions = <T,>(
  column: GridColumn<T>,
  texts: FilterLocaleText = DEFAULT_FILTER_LOCALE_TEXT,
): ColumnFilterDescribeOptions => {
  const labels = new Map<string, string>();
  const editorOptions = column.editor?.type === 'select' && Array.isArray(column.editor.options) ? column.editor.options : [];
  for (const option of [...editorOptions, ...(column.filterOptions ?? [])]) {
    labels.set(option.value, option.label);
  }
  const formatter = column.valueFormatter;
  const format = (value: unknown): string | undefined => {
    if (!formatter) {
      return undefined;
    }
    try {
      const text = formatter({ value, row: undefined, column });
      return typeof text === 'string' && text !== '' ? text : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    datePresets: normalizeDateFilterPresets(column.dateFilterPresets, texts),
    labelOf: (value) => labels.get(value),
    formatNumber: formatter ? (value) => format(value) ?? String(value) : undefined,
    texts,
  };
};

// 列フィルター値の要約文字列を返します。有効判定(isActiveColumnFilterValue)は呼び出し側の
//   責務です(無効値でも安全に文字列を返しますが、一覧に載せる/載せないの判断は行いません)。
// 変更(preset-opt): dateSet のカスタムプリセットをラベル表示するため、対象列の正規化済み
//   プリセット構成を任意で受けます(未指定 = ビルトインのみ。他 kind では未使用)。
// 変更(dogfood DU-07): 2 つ目の引数を表し方(ColumnFilterDescribeOptions)にしました。select / set の値はラベルで、
//   数値の条件は列の valueFormatter で出します(チップバー / フィルターの管理 / AI バーのチップ)。
export const describeColumnFilterValue = (
  value: ColumnFilterValue,
  options: ColumnFilterDescribeOptions = {},
): string => {
  const { datePresets, labelOf, formatNumber, texts = DEFAULT_FILTER_LOCALE_TEXT } = options;
  switch (value.kind) {
    case 'text':
    case 'date':
      return formatLocaleText(texts.conditionContains, { value: value.value.trim() });
    case 'select':
      return formatLocaleText(texts.filterMatches, { value: labelOf?.(value.value) ?? value.value });
    case 'number':
      // 変更(dogfood DU-07): 数値の書き方があって式が読めていれば、数値に書き方を当てて出します。
      // 変更(英語対応): raw が既定(日本語)の書き方どおりなら、文言の表で作り直します(raw は言語によらず日本語のため)。
      //   利用側が渡した式(">= 1000" など)はそのままです。
      if (!value.parsed) {
        return value.raw;
      }
      // 変更(1.0.2 / D-03): raw はグリッドの文言で作るので、今の文言の書き方どおりのときも作り直します。
      return formatNumber ||
        value.raw === formatParsedNumberFilter(value.parsed) ||
        value.raw === formatParsedNumberFilter(value.parsed, String, texts)
        ? formatParsedNumberFilter(value.parsed, formatNumber, texts)
        : value.raw;
    case 'set':
      // 変更(filter-ext B): 実装は describeSetSelection へ抽出しました(numberSet と共有)。
      return describeSetSelection(value.mode, value.values, labelOf, texts);
    // 追加(filter-ext B/C/D): 条件 AND 選択の複合です。両方あれば「かつ」で結合します
    //   (例: 「10 以上 かつ 3 件を選択」)。両方 null は commit 側で clear 済みの防御表示です。
    case 'numberSet':
    case 'textSet':
    case 'dateSet': {
      const conditionText = value.condition
        ? value.kind === 'numberSet'
          ? formatParsedNumberFilter(value.condition, formatNumber, texts)
          : value.kind === 'textSet'
            ? formatParsedTextFilter(value.condition, texts)
            : formatParsedDateFilter(value.condition, datePresets, texts)
        : null;
      // dateSet の選択は日付の値(ツリーの葉)なので、ラベル / 書き方は当てません。numberSet の選択は、ラベルが無ければ
      //   数として読めるキーに数値の書き方を当てます。
      const setLabelOf =
        value.kind === 'dateSet'
          ? undefined
          : value.kind === 'numberSet'
            ? (key: string) => labelOf?.(key) ?? formatNumericKey(key, formatNumber)
            : labelOf;
      const setText = value.set ? describeSetSelection(value.set.mode, value.set.values, setLabelOf, texts) : null;
      if (conditionText && setText) {
        return formatLocaleText(texts.filterBoth, { condition: conditionText, set: setText });
      }
      return conditionText ?? setText ?? texts.filterNone;
    }
    case 'custom': {
      if (typeof value.value === 'string' && value.value.trim().length > 0) {
        return `"${value.value.trim()}"`;
      }
      return texts.filterCustom;
    }
  }
};