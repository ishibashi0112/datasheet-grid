// 追加(filter-ext A): number フィルターの演算子セレクト UI 純ロジックのテストです。
//   - draft → ParsedNumberFilter 合成(全演算子 / 範囲の片側正規化 / 無効入力)
//   - parsed → raw 表示文字列(日本語。チップ / 管理パネルにそのまま出る)
//   - 記述子 → draft 復元(旧・式構文の保存値からの復元を含む)
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_NUMBER_FILTER_DRAFT,
  NUMBER_FILTER_OPERATOR_OPTIONS,
  buildNumberColumnFilterValueFromDraft,
  buildParsedNumberFilterFromDraft,
  filterOptionsByNumberCondition,
  formatParsedNumberFilter,
  numberFilterOperandCount,
  numberFilterValueToConditionDraft,
  parsedNumberFilterToConditionDraft,
  type NumberFilterConditionDraft,
} from './numberFilterCondition';
import { buildNumberColumnFilterValue } from './filtering';

const draft = (
  partial: Partial<NumberFilterConditionDraft>,
): NumberFilterConditionDraft => ({
  ...DEFAULT_NUMBER_FILTER_DRAFT,
  ...partial,
});

describe('numberFilterOperandCount', () => {
  it('範囲 = 2 / 空白系 = 0 / 他 = 1', () => {
    expect(numberFilterOperandCount('between')).toBe(2);
    expect(numberFilterOperandCount('blank')).toBe(0);
    expect(numberFilterOperandCount('notBlank')).toBe(0);
    expect(numberFilterOperandCount('gte')).toBe(1);
    expect(numberFilterOperandCount('ne')).toBe(1);
  });

  it('演算子セレクトの選択肢と 1:1 で網羅されている', () => {
    for (const option of NUMBER_FILTER_OPERATOR_OPTIONS) {
      expect([0, 1, 2]).toContain(numberFilterOperandCount(option.value));
    }
  });
});

describe('buildParsedNumberFilterFromDraft', () => {
  it('比較系は operator を記号へ対応付ける', () => {
    expect(
      buildParsedNumberFilterFromDraft(draft({ operator: 'gte', value1: '10' })),
    ).toEqual({ mode: 'comparison', operator: '>=', value: 10 });
    expect(
      buildParsedNumberFilterFromDraft(draft({ operator: 'gt', value1: '10' })),
    ).toEqual({ mode: 'comparison', operator: '>', value: 10 });
    expect(
      buildParsedNumberFilterFromDraft(draft({ operator: 'lte', value1: '10' })),
    ).toEqual({ mode: 'comparison', operator: '<=', value: 10 });
    expect(
      buildParsedNumberFilterFromDraft(draft({ operator: 'lt', value1: '10' })),
    ).toEqual({ mode: 'comparison', operator: '<', value: 10 });
    expect(
      buildParsedNumberFilterFromDraft(draft({ operator: 'eq', value1: '10' })),
    ).toEqual({ mode: 'comparison', operator: '=', value: 10 });
    expect(
      buildParsedNumberFilterFromDraft(draft({ operator: 'ne', value1: '10' })),
    ).toEqual({ mode: 'comparison', operator: '!=', value: 10 });
  });

  it('値の trim / 小数 / 負数を受け、空・非数値は null(= クリアへ倒す)', () => {
    expect(
      buildParsedNumberFilterFromDraft(draft({ operator: 'lt', value1: ' -7.5 ' })),
    ).toEqual({ mode: 'comparison', operator: '<', value: -7.5 });
    expect(
      buildParsedNumberFilterFromDraft(draft({ operator: 'gte', value1: '' })),
    ).toBeNull();
    expect(
      buildParsedNumberFilterFromDraft(draft({ operator: 'gte', value1: 'abc' })),
    ).toBeNull();
    // Number('') === 0 に落ちないこと(空文字は「値なし」)。
    expect(
      buildParsedNumberFilterFromDraft(draft({ operator: 'eq', value1: '   ' })),
    ).toBeNull();
  });

  it('範囲は min/max を正規化し、片側のみは以上 / 以下へ倒す', () => {
    expect(
      buildParsedNumberFilterFromDraft(
        draft({ operator: 'between', value1: '20', value2: '10' }),
      ),
    ).toEqual({ mode: 'range', min: 10, max: 20 });
    expect(
      buildParsedNumberFilterFromDraft(
        draft({ operator: 'between', value1: '10', value2: '' }),
      ),
    ).toEqual({ mode: 'comparison', operator: '>=', value: 10 });
    expect(
      buildParsedNumberFilterFromDraft(
        draft({ operator: 'between', value1: '', value2: '20' }),
      ),
    ).toEqual({ mode: 'comparison', operator: '<=', value: 20 });
    expect(
      buildParsedNumberFilterFromDraft(
        draft({ operator: 'between', value1: '', value2: '' }),
      ),
    ).toBeNull();
  });

  it('空白系は値入力なしで成立する(残っている値文字列は無視)', () => {
    expect(
      buildParsedNumberFilterFromDraft(
        draft({ operator: 'blank', value1: '10' }),
      ),
    ).toEqual({ mode: 'blank' });
    expect(
      buildParsedNumberFilterFromDraft(draft({ operator: 'notBlank' })),
    ).toEqual({ mode: 'notBlank' });
  });
});

describe('formatParsedNumberFilter / buildNumberColumnFilterValueFromDraft', () => {
  it('raw は日本語の表示文字列(演算子ラベルと対応)', () => {
    expect(
      formatParsedNumberFilter({ mode: 'comparison', operator: '>=', value: 10 }),
    ).toBe('10 以上');
    expect(
      formatParsedNumberFilter({ mode: 'comparison', operator: '>', value: 10 }),
    ).toBe('10 より大きい');
    expect(
      formatParsedNumberFilter({ mode: 'comparison', operator: '<=', value: 10 }),
    ).toBe('10 以下');
    expect(
      formatParsedNumberFilter({ mode: 'comparison', operator: '<', value: 10 }),
    ).toBe('10 未満');
    expect(
      formatParsedNumberFilter({ mode: 'comparison', operator: '=', value: 10 }),
    ).toBe('10 に等しい');
    expect(
      formatParsedNumberFilter({ mode: 'comparison', operator: '!=', value: 10 }),
    ).toBe('10 に等しくない');
    expect(formatParsedNumberFilter({ mode: 'range', min: 10, max: 20 })).toBe(
      '10 〜 20',
    );
    expect(formatParsedNumberFilter({ mode: 'blank' })).toBe('(空白)');
    expect(formatParsedNumberFilter({ mode: 'notBlank' })).toBe('(空白でない)');
  });

  it('記述子は kind:number + 表示 raw + parsed(無効 draft は null)', () => {
    expect(
      buildNumberColumnFilterValueFromDraft(
        draft({ operator: 'gte', value1: '10' }),
      ),
    ).toEqual({
      kind: 'number',
      raw: '10 以上',
      parsed: { mode: 'comparison', operator: '>=', value: 10 },
    });
    expect(
      buildNumberColumnFilterValueFromDraft(draft({ value1: '' })),
    ).toBeNull();
  });
});

// 追加(filter-ext B): 候補連動 ── Set 候補一覧を条件で絞る(合意仕様 §2.3)。
describe('filterOptionsByNumberCondition(候補連動)', () => {
  // (空白) 項目は value: ''(空文字)で表現されます(set フィルターの既存仕様)。
  const options = [
    { label: '(空白)', value: '' },
    { label: '5', value: '5' },
    { label: '10', value: '10' },
    { label: '12', value: '12' },
    { label: '48', value: '48' },
  ];

  it('比較条件で候補が絞られ、(空白) は候補から消える', () => {
    expect(
      filterOptionsByNumberCondition(options, {
        mode: 'comparison',
        operator: '>=',
        value: 10,
      }).map((option) => option.value),
    ).toEqual(['10', '12', '48']);
  });

  it('blank 条件では (空白) だけが残り、notBlank では (空白) だけが消える', () => {
    expect(
      filterOptionsByNumberCondition(options, { mode: 'blank' }).map(
        (option) => option.value,
      ),
    ).toEqual(['']);
    expect(
      filterOptionsByNumberCondition(options, { mode: 'notBlank' }).map(
        (option) => option.value,
      ),
    ).toEqual(['5', '10', '12', '48']);
  });

  it('範囲条件でも絞られる', () => {
    expect(
      filterOptionsByNumberCondition(options, {
        mode: 'range',
        min: 5,
        max: 12,
      }).map((option) => option.value),
    ).toEqual(['5', '10', '12']);
  });

  it('条件 null は同一参照で素通し(no-op スキップ最大化)', () => {
    expect(filterOptionsByNumberCondition(options, null)).toBe(options);
  });
});

describe('numberFilterValueToConditionDraft(popover 再オープン時の復元)', () => {
  it('comparison / range / blank 系を構造から復元する', () => {
    expect(
      numberFilterValueToConditionDraft({
        kind: 'number',
        raw: '10 以上',
        parsed: { mode: 'comparison', operator: '>=', value: 10 },
      }),
    ).toEqual({ operator: 'gte', value1: '10', value2: '' });
    expect(
      numberFilterValueToConditionDraft({
        kind: 'number',
        raw: '10 〜 20',
        parsed: { mode: 'range', min: 10, max: 20 },
      }),
    ).toEqual({ operator: 'between', value1: '10', value2: '20' });
    expect(
      numberFilterValueToConditionDraft({
        kind: 'number',
        raw: '(空白)',
        parsed: { mode: 'blank' },
      }),
    ).toEqual({ operator: 'blank', value1: '', value2: '' });
  });

  it('旧・式構文の保存値(raw ">=10" 等)も parsed から復元できる', () => {
    const legacy = buildNumberColumnFilterValue('>=10');
    expect(legacy).not.toBeNull();
    expect(numberFilterValueToConditionDraft(legacy ?? undefined)).toEqual({
      operator: 'gte',
      value1: '10',
      value2: '',
    });
  });

  it('parsedNumberFilterToConditionDraft: numberSet の condition からも復元できる(共有実装)', () => {
    expect(
      parsedNumberFilterToConditionDraft({ mode: 'range', min: 5, max: 9 }),
    ).toEqual({ operator: 'between', value1: '5', value2: '9' });
    expect(parsedNumberFilterToConditionDraft(null)).toEqual(
      DEFAULT_NUMBER_FILTER_DRAFT,
    );
  });

  it('未設定 / 旧 contains 値(parsed=null)は既定 draft(以上・空)', () => {
    expect(numberFilterValueToConditionDraft(undefined)).toEqual(
      DEFAULT_NUMBER_FILTER_DRAFT,
    );
    expect(
      numberFilterValueToConditionDraft({
        kind: 'number',
        raw: '1.',
        parsed: null,
      }),
    ).toEqual(DEFAULT_NUMBER_FILTER_DRAFT);
  });

  it('build → 復元 → build の往復が安定する(全演算子)', () => {
    const drafts: NumberFilterConditionDraft[] = [
      draft({ operator: 'gte', value1: '10' }),
      draft({ operator: 'gt', value1: '0' }),
      draft({ operator: 'lte', value1: '-3' }),
      draft({ operator: 'lt', value1: '7.5' }),
      draft({ operator: 'eq', value1: '42' }),
      draft({ operator: 'ne', value1: '42' }),
      draft({ operator: 'between', value1: '10', value2: '20' }),
      draft({ operator: 'blank' }),
      draft({ operator: 'notBlank' }),
    ];
    for (const source of drafts) {
      const descriptor = buildNumberColumnFilterValueFromDraft(source);
      expect(descriptor).not.toBeNull();
      const restored = numberFilterValueToConditionDraft(
        descriptor ?? undefined,
      );
      expect(buildNumberColumnFilterValueFromDraft(restored)).toEqual(
        descriptor,
      );
    }
  });
});