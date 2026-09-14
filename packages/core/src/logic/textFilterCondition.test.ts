// 追加(filter-ext C): textSet のテキスト条件 UI 純ロジックのテストです。
//   - draft → ParsedTextFilter 合成(trim / 空値 / 空白系)
//   - parsed → 表示文字列(チップ / 管理パネル / popover サマリー)
//   - 復元(再オープン seed)と候補連動(条件で候補一覧を絞る)
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TEXT_FILTER_DRAFT,
  TEXT_FILTER_OPERATOR_OPTIONS,
  buildParsedTextFilterFromDraft,
  filterOptionsByTextCondition,
  formatParsedTextFilter,
  parsedTextFilterToConditionDraft,
  textFilterOperandCount,
  type TextFilterConditionDraft,
} from './textFilterCondition';

const draft = (
  partial: Partial<TextFilterConditionDraft>,
): TextFilterConditionDraft => ({
  ...DEFAULT_TEXT_FILTER_DRAFT,
  ...partial,
});

describe('textFilterOperandCount / 演算子一覧', () => {
  it('空白系 = 0 / 他 = 1、セレクト一覧と網羅が一致する', () => {
    expect(textFilterOperandCount('contains')).toBe(1);
    expect(textFilterOperandCount('blank')).toBe(0);
    expect(textFilterOperandCount('notBlank')).toBe(0);
    for (const option of TEXT_FILTER_OPERATOR_OPTIONS) {
      expect([0, 1]).toContain(textFilterOperandCount(option.value));
    }
  });
});

describe('buildParsedTextFilterFromDraft', () => {
  it('各演算子を mode へ対応付け、値は trim する', () => {
    expect(
      buildParsedTextFilterFromDraft(draft({ operator: 'contains', value: ' ボルト ' })),
    ).toEqual({ mode: 'contains', value: 'ボルト' });
    expect(
      buildParsedTextFilterFromDraft(draft({ operator: 'equals', value: 'M6' })),
    ).toEqual({ mode: 'equals', value: 'M6' });
    expect(
      buildParsedTextFilterFromDraft(draft({ operator: 'startsWith', value: '六角' })),
    ).toEqual({ mode: 'startsWith', value: '六角' });
    expect(
      buildParsedTextFilterFromDraft(draft({ operator: 'endsWith', value: 'M10' })),
    ).toEqual({ mode: 'endsWith', value: 'M10' });
  });

  it('trim 後空は null(= クリアへ倒す)、空白系は値なしで成立', () => {
    expect(buildParsedTextFilterFromDraft(draft({ value: '  ' }))).toBeNull();
    expect(buildParsedTextFilterFromDraft(draft({ operator: 'blank' }))).toEqual(
      { mode: 'blank' },
    );
    expect(
      buildParsedTextFilterFromDraft(draft({ operator: 'notBlank', value: 'x' })),
    ).toEqual({ mode: 'notBlank' });
  });
});

describe('formatParsedTextFilter', () => {
  it('演算子ラベルと対応する日本語表示', () => {
    expect(formatParsedTextFilter({ mode: 'contains', value: 'ボルト' })).toBe(
      '"ボルト" を含む',
    );
    expect(formatParsedTextFilter({ mode: 'equals', value: 'M6' })).toBe(
      '"M6" に等しい',
    );
    expect(formatParsedTextFilter({ mode: 'startsWith', value: '六角' })).toBe(
      '"六角" で始まる',
    );
    expect(formatParsedTextFilter({ mode: 'endsWith', value: 'M10' })).toBe(
      '"M10" で終わる',
    );
    expect(formatParsedTextFilter({ mode: 'blank' })).toBe('(空白)');
    expect(formatParsedTextFilter({ mode: 'notBlank' })).toBe('(空白でない)');
  });
});

describe('parsedTextFilterToConditionDraft(再オープン時の復元)', () => {
  it('build → 復元 → build の往復が安定する(全演算子)', () => {
    const drafts: TextFilterConditionDraft[] = [
      draft({ operator: 'contains', value: 'ボルト' }),
      draft({ operator: 'equals', value: 'M6' }),
      draft({ operator: 'startsWith', value: '六角' }),
      draft({ operator: 'endsWith', value: 'M10' }),
      draft({ operator: 'blank' }),
      draft({ operator: 'notBlank' }),
    ];
    for (const source of drafts) {
      const parsed = buildParsedTextFilterFromDraft(source);
      expect(parsed).not.toBeNull();
      const restored = parsedTextFilterToConditionDraft(parsed);
      expect(buildParsedTextFilterFromDraft(restored)).toEqual(parsed);
    }
  });

  it('未設定(null / undefined)は既定 draft(を含む・空)', () => {
    expect(parsedTextFilterToConditionDraft(null)).toEqual(
      DEFAULT_TEXT_FILTER_DRAFT,
    );
    expect(parsedTextFilterToConditionDraft(undefined)).toEqual(
      DEFAULT_TEXT_FILTER_DRAFT,
    );
  });
});

describe('filterOptionsByTextCondition(候補連動)', () => {
  const options = [
    { label: '(空白)', value: '' },
    { label: '六角ボルト M6', value: '六角ボルト M6' },
    { label: '六角ボルト M8', value: '六角ボルト M8' },
    { label: 'アイボルト M10', value: 'アイボルト M10' },
    { label: 'ナット M6', value: 'ナット M6' },
  ];

  it('contains / startsWith / endsWith で絞られる(大文字小文字無視・(空白) は不一致)', () => {
    expect(
      filterOptionsByTextCondition(options, {
        mode: 'contains',
        value: 'ボルト',
      }).map((option) => option.value),
    ).toEqual(['六角ボルト M6', '六角ボルト M8', 'アイボルト M10']);
    expect(
      filterOptionsByTextCondition(options, {
        mode: 'startsWith',
        value: '六角',
      }).map((option) => option.value),
    ).toEqual(['六角ボルト M6', '六角ボルト M8']);
    expect(
      filterOptionsByTextCondition(options, {
        mode: 'endsWith',
        value: 'm6',
      }).map((option) => option.value),
    ).toEqual(['六角ボルト M6', 'ナット M6']);
  });

  it('blank では (空白) だけが残り、notBlank では (空白) だけが消える', () => {
    expect(
      filterOptionsByTextCondition(options, { mode: 'blank' }).map(
        (option) => option.value,
      ),
    ).toEqual(['']);
    expect(
      filterOptionsByTextCondition(options, { mode: 'notBlank' }),
    ).toHaveLength(4);
  });

  it('条件 null は同一参照で素通し', () => {
    expect(filterOptionsByTextCondition(options, null)).toBe(options);
  });
});