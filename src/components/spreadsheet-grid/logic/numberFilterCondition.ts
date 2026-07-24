import type {
  NumberColumnFilterValue,
  ParsedNumberFilter,
} from '../model/gridTypes';

// 追加(filter-ext A): number フィルターの「演算子セレクト + 値入力」UI の純ロジックです。
//   旧 UI は「>=10 / 10..20」の式テキストを commit 時に parse していましたが、
//   刷新後は popover が構造化 draft(演算子 + 値 1/2)を持ち、ここで ParsedNumberFilter へ
//   合成します。保存形式は従来どおり { kind:'number', raw, parsed } で、
//   raw は「人間可読の表示文字列(日本語)」へ役割が変わります(フィルターチップ /
//   管理パネル / 現在値表示にそのまま出ます。判定は常に parsed が正)。
//   旧保存値(raw が式構文)もそのまま読めます(parsed 優先のため挙動不変)。

// UI の演算子 ID です(セレクトの value)。ParsedNumberFilter との対応は build/seed 参照。
export type NumberFilterOperator =
  | 'gte'
  | 'gt'
  | 'lte'
  | 'lt'
  | 'eq'
  | 'ne'
  | 'between'
  | 'blank'
  | 'notBlank';

// popover の条件欄 draft です(入力途中の値は文字列のまま保持します)。
export type NumberFilterConditionDraft = {
  operator: NumberFilterOperator;
  value1: string;
  value2: string;
};

// 新規オープン時(フィルター未設定 / 旧 contains 値)の既定 draft です。
//   既定演算子は最頻の「以上」にします(合意済み UI 仕様)。
export const DEFAULT_NUMBER_FILTER_DRAFT: NumberFilterConditionDraft = {
  operator: 'gte',
  value1: '',
  value2: '',
};

// 演算子セレクトの表示順とラベルです(日本語 — 合意済み)。
export const NUMBER_FILTER_OPERATOR_OPTIONS: ReadonlyArray<{
  value: NumberFilterOperator;
  label: string;
}> = [
  { value: 'gte', label: '以上' },
  { value: 'gt', label: 'より大きい' },
  { value: 'lte', label: '以下' },
  { value: 'lt', label: '未満' },
  { value: 'eq', label: 'に等しい' },
  { value: 'ne', label: 'に等しくない' },
  { value: 'between', label: '範囲' },
  { value: 'blank', label: '空白' },
  { value: 'notBlank', label: '空白でない' },
];

// 演算子で値入力の個数が決まります(範囲 = 2 / 空白系 = 0 / 他 = 1)。
export const numberFilterOperandCount = (
  operator: NumberFilterOperator,
): 0 | 1 | 2 => {
  if (operator === 'blank' || operator === 'notBlank') {
    return 0;
  }
  return operator === 'between' ? 2 : 1;
};

// 入力文字列を有限数値へ解釈します(trim 後空 / 非有限は null。Number('') === 0 対策)。
const parseFiniteNumber = (text: string): number | null => {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

const COMPARISON_BY_OPERATOR = {
  gte: '>=',
  gt: '>',
  lte: '<=',
  lt: '<',
  eq: '=',
  ne: '!=',
} as const;

// draft から ParsedNumberFilter を合成します。null = 有効な条件なし(呼び出し側で clear へ)。
//   範囲の片側のみ入力は以上 / 以下へ正規化します(適用で全消えする驚きを避けるため)。
export const buildParsedNumberFilterFromDraft = (
  draft: NumberFilterConditionDraft,
): ParsedNumberFilter | null => {
  if (draft.operator === 'blank' || draft.operator === 'notBlank') {
    return { mode: draft.operator };
  }
  if (draft.operator === 'between') {
    const first = parseFiniteNumber(draft.value1);
    const second = parseFiniteNumber(draft.value2);
    if (first !== null && second !== null) {
      return {
        mode: 'range',
        min: Math.min(first, second),
        max: Math.max(first, second),
      };
    }
    if (first !== null) {
      return { mode: 'comparison', operator: '>=', value: first };
    }
    if (second !== null) {
      return { mode: 'comparison', operator: '<=', value: second };
    }
    return null;
  }
  const value = parseFiniteNumber(draft.value1);
  if (value === null) {
    return null;
  }
  return {
    mode: 'comparison',
    operator: COMPARISON_BY_OPERATOR[draft.operator],
    value,
  };
};

// parsed を人間可読の表示文字列へ整形します(raw として保存し、チップ / 管理パネル /
//   現在値表示にそのまま出ます)。演算子ラベルとの対応を保つこと。
export const formatParsedNumberFilter = (parsed: ParsedNumberFilter): string => {
  switch (parsed.mode) {
    case 'comparison': {
      switch (parsed.operator) {
        case '>=':
          return `${parsed.value} 以上`;
        case '>':
          return `${parsed.value} より大きい`;
        case '<=':
          return `${parsed.value} 以下`;
        case '<':
          return `${parsed.value} 未満`;
        case '!=':
          return `${parsed.value} に等しくない`;
        case '=':
        default:
          return `${parsed.value} に等しい`;
      }
    }
    case 'range':
      return `${parsed.min} 〜 ${parsed.max}`;
    case 'blank':
      return '(空白)';
    case 'notBlank':
      return '(空白でない)';
  }
};

// draft から number 記述子を構築します。null = フィルターなし(clearColumn へ倒す)。
export const buildNumberColumnFilterValueFromDraft = (
  draft: NumberFilterConditionDraft,
): NumberColumnFilterValue | null => {
  const parsed = buildParsedNumberFilterFromDraft(draft);
  if (parsed === null) {
    return null;
  }
  return { kind: 'number', raw: formatParsedNumberFilter(parsed), parsed };
};

const OPERATOR_BY_COMPARISON: Record<
  '>' | '>=' | '<' | '<=' | '=' | '!=',
  NumberFilterOperator
> = {
  '>=': 'gte',
  '>': 'gt',
  '<=': 'lte',
  '<': 'lt',
  '=': 'eq',
  '!=': 'ne',
};

// 既存フィルター値から popover 再オープン時の draft を復元します。
//   - parsed あり → 構造から逆引き(raw は見ません。旧・式構文の保存値もここで復元できます)。
//   - parsed null(旧 contains フォールバック値)/ 未設定 → 既定 draft。
export const numberFilterValueToConditionDraft = (
  value: NumberColumnFilterValue | undefined,
): NumberFilterConditionDraft => {
  const parsed = value?.parsed;
  if (!parsed) {
    return DEFAULT_NUMBER_FILTER_DRAFT;
  }
  switch (parsed.mode) {
    case 'comparison':
      return {
        operator: OPERATOR_BY_COMPARISON[parsed.operator],
        value1: String(parsed.value),
        value2: '',
      };
    case 'range':
      return {
        operator: 'between',
        value1: String(parsed.min),
        value2: String(parsed.max),
      };
    case 'blank':
    case 'notBlank':
      return { operator: parsed.mode, value1: '', value2: '' };
  }
};