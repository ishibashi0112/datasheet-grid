import type { ColumnFilterValue } from '../model/gridTypes';
// 追加(filter-ext B): numberSet の条件部の表示文字列です(「10 以上」等。演算子ラベルと対応)。
import { formatParsedNumberFilter } from './numberFilterCondition';
// 追加(filter-ext C): textSet の条件部の表示文字列です(「"x" を含む」等)。
import { formatParsedTextFilter } from './textFilterCondition';
// 追加(filter-ext D): dateSet の条件部の表示文字列です(「2026-01-01 〜 …」「過去 30 日」等)。
import { formatParsedDateFilter } from './dateFilterCondition';
// 追加(preset-opt): dateSet カスタムプリセットのラベル逆引き用の正規形です。
import type { NormalizedDateFilterPreset } from './dateFilterPresets';

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
//   - custom       : value が非空 string なら「"x"」(trim)、それ以外は「カスタム条件」
//     (custom の中身は利用側 filterFn の自由形のため、汎用の安全側表示に留めます)

// set の値表示です。空文字セル値は「(空白)」と表示します(セル値の String 化で空になった
//   値も候補として選択できる仕様のため、無表示だと「", "」のような欠けた列挙になります)。
const formatSetValue = (value: string): string =>
  value === '' ? '(空白)' : `"${value}"`;

// 追加(filter-ext B): set 選択(mode + values)の要約です。kind:'set' と kind:'numberSet' の
//   set 部分が共有します(include 1〜2 件は列挙 / 3 件以上は件数 / exclude は除外件数)。
const describeSetSelection = (
  mode: 'include' | 'exclude' | undefined,
  values: string[],
): string => {
  // mode 省略は include 扱いです(反転set 導入前の値との後方互換)。
  if ((mode ?? 'include') === 'exclude') {
    return `${values.length} 件を除外`;
  }
  if (values.length > 0 && values.length <= 2) {
    return values.map(formatSetValue).join(', ');
  }
  return `${values.length} 件を選択`;
};

// 列フィルター値の要約文字列を返します。有効判定(isActiveColumnFilterValue)は呼び出し側の
//   責務です(無効値でも安全に文字列を返しますが、一覧に載せる/載せないの判断は行いません)。
// 変更(preset-opt): dateSet のカスタムプリセットをラベル表示するため、対象列の正規化済み
//   プリセット構成を任意で受けます(未指定 = ビルトインのみ。他 kind では未使用)。
export const describeColumnFilterValue = (
  value: ColumnFilterValue,
  datePresets?: readonly NormalizedDateFilterPreset[],
): string => {
  switch (value.kind) {
    case 'text':
    case 'date':
      return `"${value.value.trim()}" を含む`;
    case 'select':
      return `"${value.value}" に一致`;
    case 'number':
      return value.raw;
    case 'set':
      // 変更(filter-ext B): 実装は describeSetSelection へ抽出しました(numberSet と共有)。
      return describeSetSelection(value.mode, value.values);
    // 追加(filter-ext B/C/D): 条件 AND 選択の複合です。両方あれば「かつ」で結合します
    //   (例: 「10 以上 かつ 3 件を選択」)。両方 null は commit 側で clear 済みの防御表示です。
    case 'numberSet':
    case 'textSet':
    case 'dateSet': {
      const conditionText = value.condition
        ? value.kind === 'numberSet'
          ? formatParsedNumberFilter(value.condition)
          : value.kind === 'textSet'
            ? formatParsedTextFilter(value.condition)
            : formatParsedDateFilter(value.condition, datePresets)
        : null;
      const setText = value.set
        ? describeSetSelection(value.set.mode, value.set.values)
        : null;
      if (conditionText && setText) {
        return `${conditionText} かつ ${setText}`;
      }
      return conditionText ?? setText ?? 'フィルターなし';
    }
    case 'custom': {
      if (typeof value.value === 'string' && value.value.trim().length > 0) {
        return `"${value.value.trim()}"`;
      }
      return 'カスタム条件';
    }
  }
};