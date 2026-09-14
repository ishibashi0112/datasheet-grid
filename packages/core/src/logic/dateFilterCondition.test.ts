// 追加(filter-ext D): dateSet の日付条件 UI 純ロジックのテストです。
//   - draft → ParsedDateFilter 合成(プリセット優先 / 範囲の正規化 / 不正値)
//   - parsed → 表示文字列 / 復元(再オープン seed)
//   - 候補連動(条件でツリー候補を絞る。相対プリセットは now 固定で検証)
import { describe, it, expect } from 'vitest';
import {
  DATE_FILTER_OPERATOR_OPTIONS,
  DEFAULT_DATE_FILTER_DRAFT,
  buildParsedDateFilterFromDraft,
  dateFilterOperandCount,
  filterOptionsByDateCondition,
  formatParsedDateFilter,
  normalizeFilterDateInputValue,
  parsedDateFilterToConditionDraft,
  type DateFilterConditionDraft,
} from './dateFilterCondition';

const draft = (
  partial: Partial<DateFilterConditionDraft>,
): DateFilterConditionDraft => ({
  ...DEFAULT_DATE_FILTER_DRAFT,
  ...partial,
});

// 2026-07-24(金)を「今日」として固定します。
const NOW = new Date(2026, 6, 24, 12, 0, 0);

describe('dateFilterOperandCount / 演算子一覧', () => {
  it('範囲 = 2 / 空白系 = 0 / 他 = 1、セレクト一覧と網羅が一致する', () => {
    expect(dateFilterOperandCount('range')).toBe(2);
    expect(dateFilterOperandCount('blank')).toBe(0);
    expect(dateFilterOperandCount('onOrAfter')).toBe(1);
    for (const option of DATE_FILTER_OPERATOR_OPTIONS) {
      expect([0, 1, 2]).toContain(dateFilterOperandCount(option.value));
    }
  });
});

describe('buildParsedDateFilterFromDraft', () => {
  it('プリセットは演算子・値より優先され、相対のまま保存される', () => {
    expect(
      buildParsedDateFilterFromDraft(
        draft({ operator: 'onOrAfter', value1: '2026-01-01', preset: 'last30days' }),
      ),
    ).toEqual({ mode: 'preset', preset: 'last30days' });
  });

  it('範囲は from/to を正規化し、片側のみは 以降 / 以前 へ倒す', () => {
    expect(
      buildParsedDateFilterFromDraft(
        draft({ operator: 'range', value1: '2026-03-31', value2: '2026-01-01' }),
      ),
    ).toEqual({ mode: 'range', from: '2026-01-01', to: '2026-03-31' });
    expect(
      buildParsedDateFilterFromDraft(
        draft({ operator: 'range', value1: '2026-01-01' }),
      ),
    ).toEqual({ mode: 'onOrAfter', value: '2026-01-01' });
    expect(
      buildParsedDateFilterFromDraft(
        draft({ operator: 'range', value2: '2026-03-31' }),
      ),
    ).toEqual({ mode: 'onOrBefore', value: '2026-03-31' });
    expect(buildParsedDateFilterFromDraft(draft({}))).toBeNull();
  });

  it('単一値演算子と空白系、不正値は null', () => {
    expect(
      buildParsedDateFilterFromDraft(
        draft({ operator: 'equals', value1: '2026-07-24' }),
      ),
    ).toEqual({ mode: 'equals', value: '2026-07-24' });
    expect(
      buildParsedDateFilterFromDraft(draft({ operator: 'notBlank' })),
    ).toEqual({ mode: 'notBlank' });
    expect(
      buildParsedDateFilterFromDraft(
        draft({ operator: 'equals', value1: 'not-a-date' }),
      ),
    ).toBeNull();
  });
});

describe('formatParsedDateFilter / 復元', () => {
  it('表示文字列(プリセットはチップと同じ日本語ラベル)', () => {
    expect(
      formatParsedDateFilter({ mode: 'range', from: '2026-01-01', to: '2026-03-31' }),
    ).toBe('2026-01-01 〜 2026-03-31');
    expect(formatParsedDateFilter({ mode: 'onOrAfter', value: '2026-01-01' })).toBe(
      '2026-01-01 以降',
    );
    expect(formatParsedDateFilter({ mode: 'preset', preset: 'last30days' })).toBe(
      '過去 30 日',
    );
    expect(formatParsedDateFilter({ mode: 'blank' })).toBe('(空白)');
  });

  it('build → 復元 → build の往復が安定する(プリセット含む)', () => {
    const drafts: DateFilterConditionDraft[] = [
      draft({ operator: 'range', value1: '2026-01-01', value2: '2026-03-31' }),
      draft({ operator: 'onOrAfter', value1: '2026-01-01' }),
      draft({ operator: 'onOrBefore', value1: '2026-03-31' }),
      draft({ operator: 'equals', value1: '2026-07-24' }),
      draft({ operator: 'notEquals', value1: '2026-07-24' }),
      draft({ operator: 'blank' }),
      draft({ operator: 'notBlank' }),
      draft({ preset: 'today' }),
      draft({ preset: 'thisMonth' }),
    ];
    for (const source of drafts) {
      const parsed = buildParsedDateFilterFromDraft(source);
      expect(parsed).not.toBeNull();
      const restored = parsedDateFilterToConditionDraft(parsed);
      expect(buildParsedDateFilterFromDraft(restored)).toEqual(parsed);
    }
  });

  it('未設定は既定 draft(範囲・空・プリセットなし)', () => {
    expect(parsedDateFilterToConditionDraft(null)).toEqual(
      DEFAULT_DATE_FILTER_DRAFT,
    );
  });
});

describe('filterOptionsByDateCondition(候補連動)', () => {
  const options = [
    { label: '2026-01-15', value: '2026-01-15' },
    { label: '2026-06-30', value: '2026-06-30' },
    { label: '2026-07-01', value: '2026-07-01' },
    { label: '2026-07-24', value: '2026-07-24' },
    { label: 'メモ', value: 'メモ' },
    { label: '(空白)', value: '' },
  ];

  it('範囲条件で絞られ、(空白)・非日付は候補から消える', () => {
    expect(
      filterOptionsByDateCondition(
        options,
        { mode: 'range', from: '2026-06-01', to: '2026-07-31' },
        NOW,
      ).map((option) => option.value),
    ).toEqual(['2026-06-30', '2026-07-01', '2026-07-24']);
  });

  it('相対プリセット(今月)は now 基準で解決される', () => {
    expect(
      filterOptionsByDateCondition(
        options,
        { mode: 'preset', preset: 'thisMonth' },
        NOW,
      ).map((option) => option.value),
    ).toEqual(['2026-07-01', '2026-07-24']);
  });

  it('blank では (空白) だけが残り、条件 null は同一参照で素通し', () => {
    expect(
      filterOptionsByDateCondition(options, { mode: 'blank' }, NOW).map(
        (option) => option.value,
      ),
    ).toEqual(['']);
    expect(filterOptionsByDateCondition(options, null, NOW)).toBe(options);
  });
});

// 追加(date-input): 日付入力スロット(renderFilterDateInput)の onChange 正規化です。
describe('normalizeFilterDateInputValue', () => {
  it('Date は YYYY-MM-DD へ、null / 空文字はクリアへ正規化する', () => {
    expect(normalizeFilterDateInputValue(new Date(2026, 6, 1))).toBe('2026-07-01');
    expect(normalizeFilterDateInputValue(null)).toBe('');
    expect(normalizeFilterDateInputValue('')).toBe('');
    expect(normalizeFilterDateInputValue('   ')).toBe('');
  });

  it('表記ゆれ文字列は正規化し、解釈不能な値はクリア扱いにする', () => {
    expect(normalizeFilterDateInputValue('2026-07-01')).toBe('2026-07-01');
    expect(normalizeFilterDateInputValue('2026/7/1')).toBe('2026-07-01');
    expect(normalizeFilterDateInputValue('メモ')).toBe('');
    expect(normalizeFilterDateInputValue(new Date('invalid'))).toBe('');
  });
});
