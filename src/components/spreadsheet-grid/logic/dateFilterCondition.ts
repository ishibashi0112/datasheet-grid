import type {
  DateFilterPreset,
  ParsedDateFilter,
} from '../model/gridTypes';
// 追加(filter-ext D): 候補連動(条件でツリー候補を絞る)の単一値判定です。
//   行 predicate(compileParsedDatePredicate)と同一の意味論を共有します。
import { matchesParsedDateFilter } from './filtering';

// 追加(filter-ext D): dateSet(日付条件 AND 選択)の条件欄 UI 純ロジックです。
//   構造は numberFilterCondition / textFilterCondition と同型ですが、次の 2 点が固有です。
//   - 値入力は <input type="date">(常に 'YYYY-MM-DD' か空文字が入る)。
//   - 相対プリセット(今日 / 今月 / 過去 30 日)のチップを持ち、選択中は演算子・値より優先。
//     プリセットは相対のまま保存され、評価時に解決されます(合意済み仕様)。

// UI の演算子 ID です(セレクトの value)。プリセットは演算子ではなくチップで指定します。
export type DateFilterOperator =
  | 'range'
  | 'onOrAfter'
  | 'onOrBefore'
  | 'equals'
  | 'notEquals'
  | 'blank'
  | 'notBlank';

// popover の条件欄 draft です。preset 非 null のあいだは operator / 値より優先されます
//   (演算子や値を編集するとチップ解除 = preset: null に戻すのは view 側の責務)。
export type DateFilterConditionDraft = {
  operator: DateFilterOperator;
  value1: string;
  value2: string;
  preset: DateFilterPreset | null;
};

// 新規オープン時(フィルター未設定)の既定 draft です。既定演算子は「範囲」です。
export const DEFAULT_DATE_FILTER_DRAFT: DateFilterConditionDraft = {
  operator: 'range',
  value1: '',
  value2: '',
  preset: null,
};

// 演算子セレクトの表示順とラベルです(日本語 — 合意済み)。
export const DATE_FILTER_OPERATOR_OPTIONS: ReadonlyArray<{
  value: DateFilterOperator;
  label: string;
}> = [
  { value: 'range', label: '範囲' },
  { value: 'onOrAfter', label: '以降' },
  { value: 'onOrBefore', label: '以前' },
  { value: 'equals', label: 'に等しい' },
  { value: 'notEquals', label: 'に等しくない' },
  { value: 'blank', label: '空白' },
  { value: 'notBlank', label: '空白でない' },
];

// 相対プリセットチップの表示順とラベルです。
export const DATE_FILTER_PRESET_OPTIONS: ReadonlyArray<{
  value: DateFilterPreset;
  label: string;
}> = [
  { value: 'today', label: '今日' },
  { value: 'thisMonth', label: '今月' },
  { value: 'last30days', label: '過去 30 日' },
];

// 演算子で値入力の個数が決まります(範囲 = 2 / 空白系 = 0 / 他 = 1)。
export const dateFilterOperandCount = (
  operator: DateFilterOperator,
): 0 | 1 | 2 => {
  if (operator === 'blank' || operator === 'notBlank') {
    return 0;
  }
  return operator === 'range' ? 2 : 1;
};

// <input type="date"> の値('YYYY-MM-DD' か空)を検証します。空・不正は null。
const parseDateInputValue = (text: string): string | null => {
  const normalized = text.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
};

// draft から ParsedDateFilter を合成します。null = 有効な条件なし(呼び出し側で clear へ)。
//   - preset 非 null → 相対のまま { mode: 'preset' } で保存(評価時解決)。
//   - 範囲の片側のみ入力は 以降 / 以前 へ正規化し、逆転入力は from/to を入れ替えます。
export const buildParsedDateFilterFromDraft = (
  draft: DateFilterConditionDraft,
): ParsedDateFilter | null => {
  if (draft.preset !== null) {
    return { mode: 'preset', preset: draft.preset };
  }
  if (draft.operator === 'blank' || draft.operator === 'notBlank') {
    return { mode: draft.operator };
  }
  if (draft.operator === 'range') {
    const first = parseDateInputValue(draft.value1);
    const second = parseDateInputValue(draft.value2);
    if (first !== null && second !== null) {
      return first <= second
        ? { mode: 'range', from: first, to: second }
        : { mode: 'range', from: second, to: first };
    }
    if (first !== null) {
      return { mode: 'onOrAfter', value: first };
    }
    if (second !== null) {
      return { mode: 'onOrBefore', value: second };
    }
    return null;
  }
  const value = parseDateInputValue(draft.value1);
  if (value === null) {
    return null;
  }
  return { mode: draft.operator, value };
};

// parsed を人間可読の表示文字列へ整形します(チップ / 管理パネル / popover サマリー)。
export const formatParsedDateFilter = (parsed: ParsedDateFilter): string => {
  switch (parsed.mode) {
    case 'range':
      return `${parsed.from} 〜 ${parsed.to}`;
    case 'onOrAfter':
      return `${parsed.value} 以降`;
    case 'onOrBefore':
      return `${parsed.value} 以前`;
    case 'equals':
      return `${parsed.value} に等しい`;
    case 'notEquals':
      return `${parsed.value} に等しくない`;
    case 'blank':
      return '(空白)';
    case 'notBlank':
      return '(空白でない)';
    case 'preset': {
      const option = DATE_FILTER_PRESET_OPTIONS.find(
        (candidate) => candidate.value === parsed.preset,
      );
      return option?.label ?? parsed.preset;
    }
  }
};

// ParsedDateFilter から条件 draft を復元します(popover 再オープン時の seed)。
export const parsedDateFilterToConditionDraft = (
  parsed: ParsedDateFilter | null | undefined,
): DateFilterConditionDraft => {
  if (!parsed) {
    return DEFAULT_DATE_FILTER_DRAFT;
  }
  switch (parsed.mode) {
    case 'preset':
      return { ...DEFAULT_DATE_FILTER_DRAFT, preset: parsed.preset };
    case 'range':
      return {
        operator: 'range',
        value1: parsed.from,
        value2: parsed.to,
        preset: null,
      };
    case 'blank':
    case 'notBlank':
      return { operator: parsed.mode, value1: '', value2: '', preset: null };
    default:
      return {
        operator: parsed.mode,
        value1: parsed.value,
        value2: '',
        preset: null,
      };
  }
};

// 追加(filter-ext D): 候補連動 ── ツリー候補(正規化済み日付キー)を条件で絞ります
//   (条件 null は同一参照で素通し)。キーは '' = 空白 / 非日付 = 生値で、
//   matchesParsedDateFilter がそのまま意味論を共有します(比較系では非日付・空白は不一致)。
export const filterOptionsByDateCondition = <O extends { value: string }>(
  options: O[],
  condition: ParsedDateFilter | null,
  now: Date,
): O[] => {
  if (!condition) {
    return options;
  }
  return options.filter((option) =>
    matchesParsedDateFilter(condition, option.value, now),
  );
};