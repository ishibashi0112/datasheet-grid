// V-1: filtering の等価性テスト(旧 adhoc ハーネスの恒久化)。
//   - B-2: filterOrderByColumns に numericKeys を渡した経路と渡さない経路が、number
//     (comparison/range)でバイト等価であること(値の取得元のみ差し替え・判定本体は不変)。
//   - 記述子 ≡ 旧 applyNumberFilter: commit 時 1 回 parse の記述子経路が、行ごとに parse する
//     旧 applyNumberFilter と厳密に等価であること。
//   - set(include/exclude)/ select / text・date(contains)/ 全通過 no-op / 無効フィルターの規約。
//   - 記述子 helper(parse / build / draftText / isActive / guards)の単体仕様。
//   変更(記述子化): columnFilters の値は ColumnFilterValue(判別共用体)になりました。テストも
//     生文字列ではなくタグ付き記述子({kind:'text'|'select'|'date'|'number'|'set'|'custom'})を渡します。
import { describe, it, expect } from 'vitest';
import {
  applyNumberFilter,
  buildNumberColumnFilterValue,
  columnFilterValueToDraftText,
  createSourceOrder,
  filterOrderByColumns,
  filterOrderByGlobalText,
  isActiveColumnFilterValue,
  isNumberColumnFilterValue,
  isSetColumnFilterValue,
  parseNumberFilterExpression,
  rowMatchesGlobalText,
  type RowOrder,
} from './filtering';
import { getCellValue } from '../utils/permissions';
import type {
  ColumnFilterValue,
  GridColumn,
  NumberColumnFilterValue,
  SetColumnFilterValue,
} from '../model/gridTypes';

type Row = Record<string, unknown>;

const numberCol = (key: string): GridColumn<Row> => ({
  key,
  width: 100,
  filterType: 'number',
});
const textCol = (key: string): GridColumn<Row> => ({ key, width: 100 });
const selectCol = (key: string): GridColumn<Row> => ({
  key,
  width: 100,
  filterType: 'select',
});
const setCol = (key: string): GridColumn<Row> => ({
  key,
  width: 100,
  filterType: 'set',
});

// テスト用: number 記述子を非 null で構築します(本テスト群の raw はすべて非空で、build は
//   非 null を返すため安全)。型を Record<string, ColumnFilterValue> へ入れるための薄いラッパです。
const num = (raw: string): NumberColumnFilterValue =>
  buildNumberColumnFilterValue(raw) as NumberColumnFilterValue;

const asArray = (order: RowOrder): number[] => Array.from(order);

const buildNumericKeys = (
  rows: Row[],
  key: string,
): ReadonlyMap<string, Float64Array> =>
  new Map([[key, Float64Array.from(rows, (row) => Number(row[key]))]]);

// 数値・非有限・空・文字列を混ぜた母集合(comparison/range/contains すべてを踏む)。
const rows: Row[] = [
  { n: 5, t: 'Apple', g: 'red' },
  { n: 1, t: 'banana', g: 'yellow' },
  { n: 10, t: 'Cherry', g: 'red' },
  { n: 'x', t: 'date', g: 'brown' }, // 非有限
  { n: '', t: 'Elder', g: 'black' }, // 空(Number('')=0 だが空白扱いの確認用)
  { n: -3, t: 'fig', g: 'purple' },
  { n: 7.5, t: 'Grape', g: 'green' },
  { n: 2, t: 'apricot', g: 'orange' },
];

describe('filterOrderByColumns (B-2: numericKeys path === no-key path)', () => {
  const order = createSourceOrder(rows.length);
  const keys = buildNumericKeys(rows, 'n');
  const numberFilters = [
    '> 2',
    '>= 2',
    '< 5',
    '<= 5',
    '= 10',
    '5',
    '1 .. 8',
    '8 .. 1', // min/max 入れ替え
    '-3 .. 2',
  ];

  it.each(numberFilters)('number filter %s', (raw) => {
    const descriptor = num(raw);
    const columnFilters = { n: descriptor };
    const withKeys = filterOrderByColumns(
      rows,
      order,
      [numberCol('n')],
      columnFilters,
      keys,
    );
    const withoutKeys = filterOrderByColumns(
      rows,
      order,
      [numberCol('n')],
      columnFilters,
    );
    expect(asArray(withKeys)).toEqual(asArray(withoutKeys));
  });

  it('contains fallback (unparseable) is identical with/without keys', () => {
    const descriptor = num('1.'); // 解釈不可 → contains
    const columnFilters = { n: descriptor };
    const withKeys = filterOrderByColumns(
      rows,
      order,
      [numberCol('n')],
      columnFilters,
      keys,
    );
    const withoutKeys = filterOrderByColumns(
      rows,
      order,
      [numberCol('n')],
      columnFilters,
    );
    expect(asArray(withKeys)).toEqual(asArray(withoutKeys));
  });
});

describe('filterOrderByColumns (descriptor === legacy applyNumberFilter)', () => {
  const order = createSourceOrder(rows.length);
  const keys = buildNumericKeys(rows, 'n');
  const cases = ['> 2', '>=2', '<5', '<= 5', '=10', '7.5', '1..8', '1.', 'abc'];

  it.each(cases)('raw %s', (raw) => {
    const descriptor = num(raw);
    const actual = asArray(
      filterOrderByColumns(rows, order, [numberCol('n')], { n: descriptor }, keys),
    );
    // 参照: 旧 applyNumberFilter(raw 文字列)で行ごとに判定。
    const expected: number[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      if (applyNumberFilter(getCellValue(rows[i], numberCol('n')), raw)) {
        expected.push(i);
      }
    }
    expect(actual).toEqual(expected);
  });
});

describe('filterOrderByColumns (set include / exclude)', () => {
  const order = createSourceOrder(rows.length);

  it('include keeps only listed values', () => {
    const value: SetColumnFilterValue = {
      kind: 'set',
      mode: 'include',
      values: ['red', 'green'],
    };
    const actual = asArray(
      filterOrderByColumns(rows, order, [setCol('g')], { g: value }),
    );
    const expected = rows
      .map((row, i) => [row.g, i] as const)
      .filter(([g]) => g === 'red' || g === 'green')
      .map(([, i]) => i);
    expect(actual).toEqual(expected);
  });

  it('exclude drops listed values (complement of include over universe)', () => {
    const include: SetColumnFilterValue = {
      kind: 'set',
      mode: 'include',
      values: ['red', 'green'],
    };
    // universe = 全行値。exclude(U−S) は include(S) と同じ通過集合になる。
    const universe = Array.from(new Set(rows.map((row) => String(row.g))));
    const excludedValues = universe.filter(
      (v) => v !== 'red' && v !== 'green',
    );
    const exclude: SetColumnFilterValue = {
      kind: 'set',
      mode: 'exclude',
      values: excludedValues,
    };
    const includeOrder = asArray(
      filterOrderByColumns(rows, order, [setCol('g')], { g: include }),
    );
    const excludeOrder = asArray(
      filterOrderByColumns(rows, order, [setCol('g')], { g: exclude }),
    );
    expect(excludeOrder).toEqual(includeOrder);
  });

  it('empty include values yields no rows', () => {
    const value: SetColumnFilterValue = { kind: 'set', values: [] };
    const actual = asArray(
      filterOrderByColumns(rows, order, [setCol('g')], { g: value }),
    );
    expect(actual).toEqual([]);
  });
});

describe('filterOrderByColumns (select / text / no-op identity)', () => {
  const order = createSourceOrder(rows.length);

  it('select matches exact string equality', () => {
    const actual = asArray(
      filterOrderByColumns(rows, order, [selectCol('g')], {
        g: { kind: 'select', value: 'red' },
      }),
    );
    const expected = rows
      .map((row, i) => [row.g, i] as const)
      .filter(([g]) => g === 'red')
      .map(([, i]) => i);
    expect(actual).toEqual(expected);
  });

  it('text is case-insensitive contains', () => {
    const actual = asArray(
      filterOrderByColumns(rows, order, [textCol('t')], {
        t: { kind: 'text', value: 'ap' },
      }),
    );
    // 'Apple' / 'apricot' / 'Grape'(gr*ap*e)が含む。
    const expected = rows
      .map((row, i) => [String(row.t).toLowerCase(), i] as const)
      .filter(([t]) => t.includes('ap'))
      .map(([, i]) => i);
    expect(actual).toEqual(expected);
  });

  it('returns the same reference when no active filter exists', () => {
    expect(
      filterOrderByColumns(rows, order, [textCol('t')], {
        t: { kind: 'text', value: '' },
      }),
    ).toBe(order);
    expect(filterOrderByColumns(rows, order, [textCol('t')], {})).toBe(order);
  });

  it('returns the same reference when every row passes (set include over full universe)', () => {
    // universe = 全行の g 値。全候補を include すると全行通過し、count===length で
    //   下流 useMemo スキップのため同一参照(引数 order)を返す。
    const universe = Array.from(new Set(rows.map((row) => String(row.g))));
    const value: SetColumnFilterValue = {
      kind: 'set',
      mode: 'include',
      values: universe,
    };
    expect(filterOrderByColumns(rows, order, [setCol('g')], { g: value })).toBe(
      order,
    );
  });
});

describe('filterOrderByColumns (記述子経路 ≡ 旧・生文字列述語: text / date / select / custom)', () => {
  const order = createSourceOrder(rows.length);
  const dateCol = (key: string): GridColumn<Row> => ({
    key,
    width: 100,
    filterType: 'date',
  });

  // 参照述語: text/date/custom(filterFn なし)= 部分一致(大文字小文字無視) / select = 完全一致。
  const containsOracle = (key: string, needle: string): number[] => {
    const n = needle.trim().toLowerCase();
    const out: number[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      if (
        String(getCellValue(rows[i], textCol(key)) ?? '')
          .toLowerCase()
          .includes(n)
      ) {
        out.push(i);
      }
    }
    return out;
  };
  const exactOracle = (key: string, expected: string): number[] => {
    const out: number[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      if (String(getCellValue(rows[i], selectCol(key)) ?? '') === expected) {
        out.push(i);
      }
    }
    return out;
  };

  it.each(['ap', 'A', 'rry', 'z'])(
    'text descriptor contains %s === oracle',
    (needle) => {
      const actual = asArray(
        filterOrderByColumns(rows, order, [textCol('t')], {
          t: { kind: 'text', value: needle },
        }),
      );
      expect(actual).toEqual(containsOracle('t', needle));
    },
  );

  it('date descriptor shares the text contains predicate', () => {
    const value: ColumnFilterValue = { kind: 'date', value: 'a' };
    const actual = asArray(
      filterOrderByColumns(rows, order, [dateCol('t')], { t: value }),
    );
    expect(actual).toEqual(containsOracle('t', 'a'));
  });

  it.each(['red', 'green', 'none'])(
    'select descriptor exact %s === oracle',
    (expected) => {
      const actual = asArray(
        filterOrderByColumns(rows, order, [selectCol('g')], {
          g: { kind: 'select', value: expected },
        }),
      );
      expect(actual).toEqual(exactOracle('g', expected));
    },
  );

  it('empty text / date / select descriptors are inactive (identity)', () => {
    expect(
      filterOrderByColumns(rows, order, [textCol('t')], {
        t: { kind: 'text', value: '' },
      }),
    ).toBe(order);
    expect(
      filterOrderByColumns(rows, order, [dateCol('t')], {
        t: { kind: 'date', value: '  ' },
      }),
    ).toBe(order);
    expect(
      filterOrderByColumns(rows, order, [selectCol('g')], {
        g: { kind: 'select', value: '' },
      }),
    ).toBe(order);
  });

  it('custom descriptor without filterFn falls back to contains', () => {
    const customCol: GridColumn<Row> = {
      key: 't',
      width: 100,
      filterType: 'custom',
    };
    const actual = asArray(
      filterOrderByColumns(rows, order, [customCol], {
        t: { kind: 'custom', value: 'rry' },
      }),
    );
    expect(actual).toEqual(containsOracle('t', 'rry'));
  });
});

describe('filterOrderByGlobalText', () => {
  const order = createSourceOrder(rows.length);

  it('returns the same reference for empty text', () => {
    expect(
      filterOrderByGlobalText(rows, order, [textCol('t'), numberCol('n')], '  '),
    ).toBe(order);
  });

  it('matches across any column (case-insensitive contains)', () => {
    const actual = asArray(
      filterOrderByGlobalText(
        rows,
        order,
        [textCol('t'), selectCol('g')],
        'red',
      ),
    );
    const expected = rows
      .map((row, i) => [row, i] as const)
      .filter(
        ([row]) =>
          String(row.t).toLowerCase().includes('red') ||
          String(row.g).toLowerCase().includes('red'),
      )
      .map(([, i]) => i);
    expect(actual).toEqual(expected);
  });
});

describe('rowMatchesGlobalText (純述語: 同期/非同期で共有)', () => {
  const cols = [textCol('t'), selectCol('g'), numberCol('n')];

  it('いずれかの列が部分一致すれば true(大小無視)', () => {
    // 'red' は g 列に一致。
    expect(rowMatchesGlobalText({ n: 5, t: 'Apple', g: 'red' }, cols, 'red')).toBe(
      true,
    );
    // 'app' は t 列('Apple' を小文字化)に一致。
    expect(rowMatchesGlobalText({ n: 5, t: 'Apple', g: 'red' }, cols, 'app')).toBe(
      true,
    );
  });

  it('数値列も文字列化して部分一致する', () => {
    expect(rowMatchesGlobalText({ n: 10, t: 'Cherry', g: 'red' }, cols, '10')).toBe(
      true,
    );
  });

  it('どの列も一致しなければ false', () => {
    expect(
      rowMatchesGlobalText({ n: 1, t: 'banana', g: 'yellow' }, cols, 'zzz'),
    ).toBe(false);
  });

  it('null / undefined セルは空文字相当で不一致(非空ニードル)', () => {
    expect(
      rowMatchesGlobalText({ n: null, t: undefined, g: null }, cols, 'x'),
    ).toBe(false);
  });

  it('filterOrderByGlobalText の合否と 1 行単位で一致する(等価性の土台)', () => {
    const order = createSourceOrder(rows.length);
    const needle = 'red';
    const included = new Set(
      asArray(filterOrderByGlobalText(rows, order, cols, needle)),
    );
    rows.forEach((row, i) => {
      // filterOrderByGlobalText は trim + toLowerCase 済みニードルで判定するため、ここでも揃える。
      expect(rowMatchesGlobalText(row, cols, needle.trim().toLowerCase())).toBe(
        included.has(i),
      );
    });
  });
});

describe('number filter descriptor helpers', () => {
  it('parseNumberFilterExpression handles comparison / default = / range / invalid', () => {
    expect(parseNumberFilterExpression('> 5')).toEqual({
      mode: 'comparison',
      operator: '>',
      value: 5,
    });
    expect(parseNumberFilterExpression('42')).toEqual({
      mode: 'comparison',
      operator: '=',
      value: 42,
    });
    expect(parseNumberFilterExpression('8 .. 1')).toEqual({
      mode: 'range',
      min: 1,
      max: 8,
    });
    expect(parseNumberFilterExpression('')).toBeNull();
    expect(parseNumberFilterExpression('1.')).toBeNull();
    expect(parseNumberFilterExpression('abc')).toBeNull();
  });

  it('buildNumberColumnFilterValue trims, parses once, and nulls on empty', () => {
    expect(buildNumberColumnFilterValue('   ')).toBeNull();
    const descriptor = buildNumberColumnFilterValue('  >= 3  ');
    expect(descriptor).toEqual({
      kind: 'number',
      raw: '>= 3',
      parsed: { mode: 'comparison', operator: '>=', value: 3 },
    });
    const contains = buildNumberColumnFilterValue('1.');
    expect(contains).toEqual({ kind: 'number', raw: '1.', parsed: null });
  });

  it('columnFilterValueToDraftText returns raw for number, value for text/select, empty otherwise', () => {
    expect(columnFilterValueToDraftText(num('> 5'))).toBe('> 5');
    expect(
      columnFilterValueToDraftText({ kind: 'text', value: 'hello' }),
    ).toBe('hello');
    expect(
      columnFilterValueToDraftText({ kind: 'select', value: 'red' }),
    ).toBe('red');
    expect(
      columnFilterValueToDraftText({ kind: 'set', values: ['a'] }),
    ).toBe('');
    expect(
      columnFilterValueToDraftText({ kind: 'custom', value: { x: 1 } }),
    ).toBe('');
    expect(columnFilterValueToDraftText(undefined)).toBe('');
  });

  it('isActiveColumnFilterValue: set/number/custom active; text/date trim non-empty; select non-empty', () => {
    expect(
      isActiveColumnFilterValue({ kind: 'set', values: [] }),
    ).toBe(true);
    expect(isActiveColumnFilterValue(num('> 1'))).toBe(true);
    expect(isActiveColumnFilterValue({ kind: 'custom', value: 0 })).toBe(true);
    expect(isActiveColumnFilterValue({ kind: 'text', value: 'abc' })).toBe(true);
    expect(isActiveColumnFilterValue({ kind: 'date', value: '2024' })).toBe(
      true,
    );
    expect(isActiveColumnFilterValue({ kind: 'select', value: 'x' })).toBe(true);
    expect(isActiveColumnFilterValue({ kind: 'text', value: '   ' })).toBe(
      false,
    );
    expect(isActiveColumnFilterValue({ kind: 'text', value: '' })).toBe(false);
    expect(isActiveColumnFilterValue({ kind: 'select', value: '' })).toBe(
      false,
    );
    expect(isActiveColumnFilterValue(undefined)).toBe(false);
  });

  it('type guards are consistent', () => {
    const setValue: SetColumnFilterValue = { kind: 'set', values: ['a'] };
    expect(isSetColumnFilterValue(setValue)).toBe(true);
    expect(isNumberColumnFilterValue(setValue)).toBe(false);
    const numberValue = num('> 1');
    expect(isNumberColumnFilterValue(numberValue)).toBe(true);
    expect(isSetColumnFilterValue(numberValue)).toBe(false);
    // 追加(記述子化): text/date/select/custom はどちらの guard にも該当しません。
    const textValue: ColumnFilterValue = { kind: 'text', value: 'x' };
    expect(isSetColumnFilterValue(textValue)).toBe(false);
    expect(isNumberColumnFilterValue(textValue)).toBe(false);
  });
});