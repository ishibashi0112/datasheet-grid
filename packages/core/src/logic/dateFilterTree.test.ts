// 追加(filter-ext D): dateSet の年月日ツリー純ロジックのテストです。
//   - normalizeDateSetOptions: 生値 → 日付キーの再集約(表記ゆれ統合)とソート
//   - buildDateTreeRows: 展開状態に応じた平坦化(depth / leafKeys / 特殊リーフ)
import { describe, it, expect } from 'vitest';
import {
  buildDateTreeRows,
  normalizeDateSetOptions,
} from './dateFilterTree';

describe('normalizeDateSetOptions', () => {
  it('表記ゆれ(2026/7/1 等)を同一キーへ集約し、日付昇順 → 非日付 → 空白の順に並べる', () => {
    const normalized = normalizeDateSetOptions([
      { label: '2026-07-01', value: '2026-07-01' },
      { label: '2026/7/1', value: '2026/7/1' },
      { label: '2026-01-15', value: '2026-01-15' },
      { label: 'メモ', value: 'メモ' },
      { label: '', value: '' },
    ]);
    expect(normalized.map((option) => option.value)).toEqual([
      '2026-01-15',
      '2026-07-01',
      'メモ',
      '',
    ]);
    // 空白は「(空白)」ラベルになります。
    expect(normalized[normalized.length - 1]?.label).toBe('(空白)');
  });
});

describe('buildDateTreeRows', () => {
  const options = normalizeDateSetOptions([
    { label: '2026-01-05', value: '2026-01-05' },
    { label: '2026-02-03', value: '2026-02-03' },
    { label: '2026-02-10', value: '2026-02-10' },
    { label: '2025-12-31', value: '2025-12-31' },
    { label: 'メモ', value: 'メモ' },
    { label: '', value: '' },
  ]);

  it('全て畳み(既定)では年と特殊リーフのみが並ぶ', () => {
    const rows = buildDateTreeRows(options, new Set());
    expect(rows.map((row) => row.key)).toEqual(['y:2025', 'y:2026', 'メモ', '']);
    const year2026 = rows[1];
    expect(year2026?.type).toBe('group');
    expect(year2026?.label).toBe('2026 年');
    // 年の leafKeys は配下の全日付キーです(3 状態集計・一括トグルの単位)。
    expect(year2026?.leafKeys).toEqual([
      '2026-01-05',
      '2026-02-03',
      '2026-02-10',
    ]);
  });

  it('年を展開すると月が、月を展開すると日が現れる(depth 0 → 1 → 2)', () => {
    const rows = buildDateTreeRows(
      options,
      new Set(['y:2026', 'm:2026-02']),
    );
    expect(rows.map((row) => row.key)).toEqual([
      'y:2025',
      'y:2026',
      'm:2026-01',
      'm:2026-02',
      '2026-02-03',
      '2026-02-10',
      'メモ',
      '',
    ]);
    const monthRow = rows[3];
    expect(monthRow?.label).toBe('2 月');
    expect(monthRow?.depth).toBe(1);
    expect(monthRow?.leafKeys).toEqual(['2026-02-03', '2026-02-10']);
    const dayRow = rows[4];
    expect(dayRow?.type).toBe('leaf');
    expect(dayRow?.label).toBe('3 日');
    expect(dayRow?.depth).toBe(2);
    expect(dayRow?.leafKeys).toEqual(['2026-02-03']);
  });

  it('特殊リーフ(空白 / 非日付)はルート直下 depth 0 の末尾に並ぶ', () => {
    const rows = buildDateTreeRows(options, new Set());
    const specials = rows.slice(-2);
    expect(specials.map((row) => [row.type, row.depth, row.label])).toEqual([
      ['leaf', 0, 'メモ'],
      ['leaf', 0, '(空白)'],
    ]);
  });
});