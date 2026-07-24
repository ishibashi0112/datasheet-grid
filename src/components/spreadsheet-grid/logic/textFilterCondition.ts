import type { ParsedTextFilter } from '../model/gridTypes';
// 追加(filter-ext C): 候補連動(条件で Set 候補一覧を絞る)の単一値判定です。
//   行 predicate(compileParsedTextPredicate)と同一の意味論を共有します。
import { matchesParsedTextFilter } from './filtering';

// 追加(filter-ext C): textSet(テキスト条件 AND 選択)の条件欄 UI 純ロジックです。
//   構造は numberFilterCondition.ts(数値版)と同型: popover が構造化 draft(演算子 + 値)を
//   持ち、ここで ParsedTextFilter へ合成・復元します。値は build 時に trim し、判定は
//   大文字小文字無視です(既存 text フィルターの contains と同じ規則)。

// UI の演算子 ID です(セレクトの value)。
export type TextFilterOperator =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'blank'
  | 'notBlank';

// popover の条件欄 draft です(入力途中の値は文字列のまま保持します)。
export type TextFilterConditionDraft = {
  operator: TextFilterOperator;
  value: string;
};

// 新規オープン時(フィルター未設定)の既定 draft です。既定演算子は最頻の「を含む」です。
export const DEFAULT_TEXT_FILTER_DRAFT: TextFilterConditionDraft = {
  operator: 'contains',
  value: '',
};

// 演算子セレクトの表示順とラベルです(日本語 — 合意済み)。
export const TEXT_FILTER_OPERATOR_OPTIONS: ReadonlyArray<{
  value: TextFilterOperator;
  label: string;
}> = [
  { value: 'contains', label: 'を含む' },
  { value: 'equals', label: 'に等しい' },
  { value: 'startsWith', label: 'で始まる' },
  { value: 'endsWith', label: 'で終わる' },
  { value: 'blank', label: '空白' },
  { value: 'notBlank', label: '空白でない' },
];

// 演算子で値入力の有無が決まります(空白系 = 0 / 他 = 1)。
export const textFilterOperandCount = (
  operator: TextFilterOperator,
): 0 | 1 => (operator === 'blank' || operator === 'notBlank' ? 0 : 1);

// draft から ParsedTextFilter を合成します。null = 有効な条件なし(呼び出し側で clear へ)。
//   値は trim し、trim 後空なら条件不成立です(空白系は値なしで成立)。
export const buildParsedTextFilterFromDraft = (
  draft: TextFilterConditionDraft,
): ParsedTextFilter | null => {
  if (draft.operator === 'blank' || draft.operator === 'notBlank') {
    return { mode: draft.operator };
  }
  const value = draft.value.trim();
  if (!value) {
    return null;
  }
  return { mode: draft.operator, value };
};

// parsed を人間可読の表示文字列へ整形します(チップ / 管理パネル / popover サマリーに
//   そのまま出ます)。演算子ラベルとの対応を保つこと。
export const formatParsedTextFilter = (parsed: ParsedTextFilter): string => {
  switch (parsed.mode) {
    case 'contains':
      return `"${parsed.value}" を含む`;
    case 'equals':
      return `"${parsed.value}" に等しい`;
    case 'startsWith':
      return `"${parsed.value}" で始まる`;
    case 'endsWith':
      return `"${parsed.value}" で終わる`;
    case 'blank':
      return '(空白)';
    case 'notBlank':
      return '(空白でない)';
  }
};

// ParsedTextFilter から条件 draft を復元します(popover 再オープン時の seed)。
//   null / undefined(条件なし)は既定 draft です。
export const parsedTextFilterToConditionDraft = (
  parsed: ParsedTextFilter | null | undefined,
): TextFilterConditionDraft => {
  if (!parsed) {
    return DEFAULT_TEXT_FILTER_DRAFT;
  }
  if (parsed.mode === 'blank' || parsed.mode === 'notBlank') {
    return { operator: parsed.mode, value: '' };
  }
  return { operator: parsed.mode, value: parsed.value };
};

// 追加(filter-ext C): 候補連動 ── Set 候補一覧をテキスト条件で絞ります(条件 null は
//   同一参照で素通し)。候補は文字列 value で、'' = 空白項目です(blank 条件でのみ一致)。
//   収集(collector)は全候補 1 回きりで、本関数は表示時の軽量フィルタです。
export const filterOptionsByTextCondition = <O extends { value: string }>(
  options: O[],
  condition: ParsedTextFilter | null,
): O[] => {
  if (!condition) {
    return options;
  }
  return options.filter((option) =>
    matchesParsedTextFilter(condition, option.value),
  );
};
