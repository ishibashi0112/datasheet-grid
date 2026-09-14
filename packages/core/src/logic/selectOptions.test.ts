// V-1: selectOptions の等価性テスト(旧 adhoc ハーネスの恒久化)。
//   - collectSelectOptions ≡ 旧 getColumnSelectOptions(String 化・空白ラベル '（空白）'・
//     STRING_COLLATOR ソート・初出順 dedupe)。
//   - createSelectOptionsAccumulator のチャンク収集 ≡ 一括収集(刻み方に依らずバイト等価)。
//     これは同期/非同期どちらの収集経路でも結果が同一になることの土台です。
import { describe, it, expect } from 'vitest';
import {
  collectSelectOptions,
  createSelectOptionsAccumulator,
  type SelectOptionEntry,
} from './selectOptions';
import { STRING_COLLATOR } from './sorting';

// 参照実装(旧 getColumnSelectOptions のスキャン本体と同一規則)。
const referenceCollect = (values: unknown[]): SelectOptionEntry[] => {
  const seen = new Set<string>();
  const options: SelectOptionEntry[] = [];
  for (const raw of values) {
    const value = String(raw ?? '');
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    options.push({ value, label: value || '（空白）' });
  }
  return options.sort((left, right) =>
    STRING_COLLATOR.compare(left.label, right.label),
  );
};

const collectFromArray = (values: unknown[]): SelectOptionEntry[] =>
  collectSelectOptions(values.length, (index) => values[index]);

describe('collectSelectOptions (equivalence with legacy getColumnSelectOptions)', () => {
  const datasets: { name: string; values: unknown[] }[] = [
    {
      name: 'mixed types with null / undefined / empty',
      values: ['b', 'a', null, undefined, '', 'a', 'b', 'c'],
    },
    {
      name: 'numeric strings (numeric collator ordering)',
      values: ['10', '2', '1', '100', '2', '20'],
    },
    {
      name: 'numbers and strings coerced via String()',
      values: [1, 2, 10, '1', 'apple', 2, 'Apple'],
    },
    {
      name: 'all blanks collapse to one （空白）',
      values: ['', null, undefined, ''],
    },
  ];

  it.each(datasets)('$name', ({ values }) => {
    expect(collectFromArray(values)).toEqual(referenceCollect(values));
  });

  it('handles large unique input (20,000 distinct)', () => {
    const values = Array.from({ length: 20_000 }, (_, i) => `item-${i}`);
    const actual = collectFromArray(values);
    expect(actual).toEqual(referenceCollect(values));
    expect(actual.length).toBe(20_000);
    // ソート済みであること(隣接ペアで collator 比較 <= 0)。
    for (let i = 1; i < actual.length; i += 1) {
      expect(
        STRING_COLLATOR.compare(actual[i - 1].label, actual[i].label),
      ).toBeLessThanOrEqual(0);
    }
  });

  it('blank value maps to （空白） label', () => {
    const result = collectFromArray(['', 'x']);
    const blank = result.find((entry) => entry.value === '');
    expect(blank).toEqual({ value: '', label: '（空白）' });
  });
});

describe('createSelectOptionsAccumulator (chunked collect === one-shot)', () => {
  const feedInChunks = (
    values: unknown[],
    chunkSizes: number[],
  ): SelectOptionEntry[] => {
    const accumulator = createSelectOptionsAccumulator();
    let index = 0;
    let chunkPointer = 0;
    while (index < values.length) {
      const size = chunkSizes[chunkPointer % chunkSizes.length];
      const end = Math.min(index + size, values.length);
      for (; index < end; index += 1) {
        accumulator.collect(values[index]);
      }
      chunkPointer += 1;
    }
    return accumulator.finalize();
  };

  it('is byte-equivalent regardless of chunk boundaries', () => {
    const values = [
      '10',
      '2',
      'apple',
      null,
      '',
      'Apple',
      '2',
      'banana',
      undefined,
      '1',
      'apple',
    ];
    const oneShot = collectFromArray(values);
    // 異なる刻み方をいくつか試し、すべて一括と一致することを確認。
    for (const chunkSizes of [[1], [2], [3, 1], [5, 2, 1], [values.length]]) {
      expect(feedInChunks(values, chunkSizes)).toEqual(oneShot);
    }
  });

  it('chunked collect over large unique input matches one-shot', () => {
    const values = Array.from({ length: 5000 }, (_, i) => `k${(i * 7) % 1000}`);
    expect(feedInChunks(values, [7, 13, 1])).toEqual(collectFromArray(values));
  });
});