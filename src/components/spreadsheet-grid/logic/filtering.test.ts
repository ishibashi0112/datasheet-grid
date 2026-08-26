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
  coerceNumberFilterCellValue,
  columnFilterUsesNumericKey,
  columnFilterValueToDraftText,
  createSourceOrder,
  filterOrderByColumns,
  filterOrderByGlobalText,
  isActiveColumnFilterValue,
  isNumberColumnFilterValue,
  isSetColumnFilterValue,
  matchesParsedDateFilter,
  matchesParsedNumberFilter,
  matchesParsedTextFilter,
  parseNumberFilterExpression,
  resolveDateFilterPreset,
  resolveParsedDateFilter,
  rowMatchesGlobalText,
  toDateKey,
  toDateSetKey,
  type RowOrder,
} from './filtering';
// 追加(preset-opt): カスタムプリセット構成の正規化です(resolve の逆引きテストで使用)。
import { normalizeDateFilterPresets } from './dateFilterPresets';
import { getCellValue } from '../utils/permissions';
import type {
  ColumnFilterValue,
  DateSetColumnFilterValue,
  GridColumn,
  NumberColumnFilterValue,
  NumberSetColumnFilterValue,
  ParsedNumberFilter,
  SetColumnFilterValue,
  TextSetColumnFilterValue,
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

// 変更(filter-ext A): 本体(SpreadsheetGrid の B-2 key 構築)と同じ数値化規則
//   (coerceNumberFilterCellValue: 空白 = NaN)を共有します。規則が食い違うと
//   key 有無の等価性テストが本体の実態を検証しなくなるためです。
const buildNumericKeys = (
  rows: Row[],
  key: string,
): ReadonlyMap<string, Float64Array> =>
  new Map([
    [key, Float64Array.from(rows, (row) => coerceNumberFilterCellValue(row[key]))],
  ]);

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

// 追加(filter-ext A): 演算子セレクト化で増えた述語(!= / blank / notBlank)と、
//   空白セルの比較不参加(coerceNumberFilterCellValue: 空白 = NaN)の仕様です。
describe('filterOrderByColumns (filter-ext A: != / blank / notBlank / 空白の比較不参加)', () => {
  // 空白 3 形態(null / undefined / 空白のみ文字列)+ 数値 + 非数値文字列の母集合。
  const blankRows: Row[] = [
    { n: 5 },           // 0
    { n: 10 },          // 1
    { n: null },        // 2: 空白
    { n: undefined },   // 3: 空白
    { n: '' },          // 4: 空白
    { n: '  ' },        // 5: 空白(空白のみ文字列)
    { n: 'abc' },       // 6: 非数値(空白ではない)
    { n: 0 },           // 7
  ];
  const order = createSourceOrder(blankRows.length);
  const columns = [numberCol('n')];
  const run = (
    parsed: NumberColumnFilterValue['parsed'],
    numericKeys?: ReadonlyMap<string, Float64Array>,
  ): number[] =>
    asArray(
      filterOrderByColumns(
        blankRows,
        order,
        columns,
        { n: { kind: 'number', raw: 'x', parsed } },
        numericKeys,
      ),
    );

  it('blank は null / undefined / trim 後空文字だけを通す', () => {
    expect(run({ mode: 'blank' })).toEqual([2, 3, 4, 5]);
  });

  it('notBlank は blank の補集合(非数値文字列は「空白でない」)', () => {
    expect(run({ mode: 'notBlank' })).toEqual([0, 1, 6, 7]);
  });

  it('!= は数値セルのみ対象(空白・非数値は不一致)', () => {
    expect(run({ mode: 'comparison', operator: '!=', value: 10 })).toEqual([
      0, 7,
    ]);
  });

  it('比較(>=)で空白セルは不一致(Number("")=0 として 0 扱いしない)', () => {
    // 0 以上: 空白(null/''/…)が「0」として紛れ込まないこと(filter-ext A の規則変更点)。
    expect(run({ mode: 'comparison', operator: '>=', value: 0 })).toEqual([
      0, 1, 7,
    ]);
  });

  it('範囲でも空白セルは不参加', () => {
    expect(run({ mode: 'range', min: -1, max: 100 })).toEqual([0, 1, 7]);
  });

  it('numericKeys 経路(B-2)と非 key 経路の合否が一致する(!= / 比較 / 範囲)', () => {
    const keys = buildNumericKeys(blankRows, 'n');
    const cases: NumberColumnFilterValue['parsed'][] = [
      { mode: 'comparison', operator: '!=', value: 10 },
      { mode: 'comparison', operator: '>=', value: 0 },
      { mode: 'range', min: -1, max: 100 },
    ];
    for (const parsed of cases) {
      expect(run(parsed, keys)).toEqual(run(parsed));
    }
  });

  it('applyNumberFilter(旧参照実装)も同じ空白規則を共有する', () => {
    // '>= 0' の式評価: 空白セルは不一致 / 数値セルは通過。
    expect(applyNumberFilter(null, '>= 0')).toBe(false);
    expect(applyNumberFilter('', '>= 0')).toBe(false);
    expect(applyNumberFilter('  ', '>= 0')).toBe(false);
    expect(applyNumberFilter(0, '>= 0')).toBe(true);
    expect(applyNumberFilter(5, '>= 0')).toBe(true);
  });

  it('coerceNumberFilterCellValue: 空白 = NaN / それ以外は Number()', () => {
    expect(Number.isNaN(coerceNumberFilterCellValue(null))).toBe(true);
    expect(Number.isNaN(coerceNumberFilterCellValue(undefined))).toBe(true);
    expect(Number.isNaN(coerceNumberFilterCellValue(''))).toBe(true);
    expect(Number.isNaN(coerceNumberFilterCellValue('  '))).toBe(true);
    expect(Number.isNaN(coerceNumberFilterCellValue('abc'))).toBe(true);
    expect(coerceNumberFilterCellValue('7.5')).toBe(7.5);
    expect(coerceNumberFilterCellValue(0)).toBe(0);
  });
});

// 追加(filter-ext B): numberSet(条件 AND 選択)複合フィルターの predicate 仕様です。
describe('filterOrderByColumns (filter-ext B: numberSet 複合)', () => {
  const numberSetCol = (key: string): GridColumn<Row> => ({
    key,
    width: 100,
    filterType: 'numberSet',
  });
  const nsRows: Row[] = [
    { n: 5 },    // 0
    { n: 10 },   // 1
    { n: 12 },   // 2
    { n: 20 },   // 3
    { n: null }, // 4: 空白
    { n: 'x' },  // 5: 非数値
  ];
  const order = createSourceOrder(nsRows.length);
  const columns = [numberSetCol('n')];
  const run = (
    value: NumberSetColumnFilterValue,
    numericKeys?: ReadonlyMap<string, Float64Array>,
  ): number[] =>
    asArray(filterOrderByColumns(nsRows, order, columns, { n: value }, numericKeys));

  it('condition AND set(>= 10 かつ 12 を除外)', () => {
    expect(
      run({
        kind: 'numberSet',
        condition: { mode: 'comparison', operator: '>=', value: 10 },
        set: { mode: 'exclude', values: ['12'] },
      }),
    ).toEqual([1, 3]);
  });

  it('condition のみ / set のみ でも成立する', () => {
    expect(
      run({
        kind: 'numberSet',
        condition: { mode: 'comparison', operator: '>=', value: 10 },
        set: null,
      }),
    ).toEqual([1, 2, 3]);
    expect(
      run({
        kind: 'numberSet',
        condition: null,
        set: { mode: 'include', values: ['5', '12'] },
      }),
    ).toEqual([0, 2]);
  });

  it('set に候補外(条件不一致)の値の選択が保持されていても AND で安全に落ちる', () => {
    // 「>= 10」なのに include に 5 が残っているケース(条件変更で候補外になった選択の保持)。
    //   5 は condition で落ち、include の他値だけが通る(選択状態は破棄せず結果は AND)。
    expect(
      run({
        kind: 'numberSet',
        condition: { mode: 'comparison', operator: '>=', value: 10 },
        set: { mode: 'include', values: ['5', '12'] },
      }),
    ).toEqual([2]);
  });

  it('blank 条件 + set(空白のみ通過)', () => {
    expect(
      run({
        kind: 'numberSet',
        condition: { mode: 'blank' },
        set: null,
      }),
    ).toEqual([4]);
  });

  it('condition / set とも null は無効(同一参照 = 全通過)', () => {
    const value: NumberSetColumnFilterValue = {
      kind: 'numberSet',
      condition: null,
      set: null,
    };
    expect(isActiveColumnFilterValue(value)).toBe(false);
    const result = filterOrderByColumns(nsRows, order, columns, { n: value });
    expect(result).toBe(order);
  });

  it('numericKeys 経路(B-2)と非 key 経路の合否が一致する', () => {
    const keys = buildNumericKeys(nsRows, 'n');
    const value: NumberSetColumnFilterValue = {
      kind: 'numberSet',
      condition: { mode: 'range', min: 10, max: 20 },
      set: { mode: 'exclude', values: ['12'] },
    };
    expect(run(value, keys)).toEqual(run(value));
  });

  it('matchesParsedNumberFilter は行 predicate と同じ合否(候補連動の土台)', () => {
    const conditions: ParsedNumberFilter[] = [
      { mode: 'comparison', operator: '>=', value: 10 },
      { mode: 'comparison', operator: '!=', value: 12 },
      { mode: 'range', min: 10, max: 20 },
      { mode: 'blank' },
      { mode: 'notBlank' },
    ];
    for (const condition of conditions) {
      const viaOrder = run({ kind: 'numberSet', condition, set: null });
      const viaSingle = nsRows
        .map((_row, index) => index)
        .filter((index) =>
          matchesParsedNumberFilter(condition, nsRows[index].n),
        );
      expect(viaOrder).toEqual(viaSingle);
    }
  });

  it('columnFilterUsesNumericKey: comparison / range を持つ number 系のみ true', () => {
    expect(
      columnFilterUsesNumericKey({
        kind: 'number',
        raw: '10 以上',
        parsed: { mode: 'comparison', operator: '>=', value: 10 },
      }),
    ).toBe(true);
    expect(
      columnFilterUsesNumericKey({
        kind: 'numberSet',
        condition: { mode: 'range', min: 1, max: 2 },
        set: null,
      }),
    ).toBe(true);
    // key を読まない blank / contains / set のみ / 他 kind は false。
    expect(
      columnFilterUsesNumericKey({
        kind: 'number',
        raw: '(空白)',
        parsed: { mode: 'blank' },
      }),
    ).toBe(false);
    expect(
      columnFilterUsesNumericKey({ kind: 'number', raw: 'x', parsed: null }),
    ).toBe(false);
    expect(
      columnFilterUsesNumericKey({
        kind: 'numberSet',
        condition: null,
        set: { values: ['1'] },
      }),
    ).toBe(false);
    expect(columnFilterUsesNumericKey({ kind: 'text', value: 'a' })).toBe(false);
    expect(columnFilterUsesNumericKey(undefined)).toBe(false);
  });
});

// 追加(filter-ext C): textSet(テキスト条件 AND 選択)複合フィルターの predicate 仕様です。
//   合成規則(AND / 片方 null / 両方 null)は numberSet と共通実装のため、ここでは
//   テキスト条件固有の意味論(演算子 / 大小無視 / 空白)を中心に検証します。
describe('filterOrderByColumns (filter-ext C: textSet 複合)', () => {
  const textSetCol = (key: string): GridColumn<Row> => ({
    key,
    width: 100,
    filterType: 'textSet',
  });
  const tsRows: Row[] = [
    { t: '六角ボルト M6' },  // 0
    { t: '六角ボルト M8' },  // 1
    { t: 'アイボルト M10' }, // 2
    { t: 'ナット M6' },      // 3
    { t: null },             // 4: 空白
    { t: '' },               // 5: 空白
  ];
  const order = createSourceOrder(tsRows.length);
  const columns = [textSetCol('t')];
  const run = (value: TextSetColumnFilterValue): number[] =>
    asArray(filterOrderByColumns(tsRows, order, columns, { t: value }));

  it('condition AND set(「ボルト」を含む かつ M8 を除外)', () => {
    expect(
      run({
        kind: 'textSet',
        condition: { mode: 'contains', value: 'ボルト' },
        set: { mode: 'exclude', values: ['六角ボルト M8'] },
      }),
    ).toEqual([0, 2]);
  });

  it('演算子ごとの合否(equals / startsWith / endsWith は大文字小文字無視)', () => {
    expect(
      run({ kind: 'textSet', condition: { mode: 'startsWith', value: '六角' }, set: null }),
    ).toEqual([0, 1]);
    expect(
      run({ kind: 'textSet', condition: { mode: 'endsWith', value: 'm6' }, set: null }),
    ).toEqual([0, 3]);
    expect(
      run({
        kind: 'textSet',
        condition: { mode: 'equals', value: 'ナット m6' },
        set: null,
      }),
    ).toEqual([3]);
  });

  it('blank / notBlank(null と空文字が空白)', () => {
    expect(
      run({ kind: 'textSet', condition: { mode: 'blank' }, set: null }),
    ).toEqual([4, 5]);
    expect(
      run({ kind: 'textSet', condition: { mode: 'notBlank' }, set: null }),
    ).toEqual([0, 1, 2, 3]);
  });

  it('両方 null は無効(同一参照)、matchesParsedTextFilter は行 predicate と一致', () => {
    const inactive: TextSetColumnFilterValue = {
      kind: 'textSet',
      condition: null,
      set: null,
    };
    expect(isActiveColumnFilterValue(inactive)).toBe(false);
    expect(filterOrderByColumns(tsRows, order, columns, { t: inactive })).toBe(
      order,
    );

    const condition = { mode: 'contains', value: 'ボルト' } as const;
    const viaOrder = run({ kind: 'textSet', condition, set: null });
    const viaSingle = tsRows
      .map((_row, index) => index)
      .filter((index) => matchesParsedTextFilter(condition, tsRows[index].t));
    expect(viaOrder).toEqual(viaSingle);
  });
});

// 追加(filter-ext D): dateSet(日付条件 AND 選択)の基礎ロジックと predicate 仕様です。
describe('filterOrderByColumns (filter-ext D: dateSet 複合)', () => {
  // 2026-07-24 を「今日」として固定します(相対プリセットの評価時解決の検証)。
  const NOW = new Date(2026, 6, 24, 12, 0, 0);
  const dateSetCol = (key: string): GridColumn<Row> => ({
    key,
    width: 100,
    filterType: 'dateSet',
  });
  const dsRows: Row[] = [
    { d: '2026-01-15' },  // 0
    { d: '2026/7/1' },    // 1: 表記ゆれ(キーは 2026-07-01)
    { d: '2026-07-24' },  // 2
    { d: '2026-07-20' },  // 3
    { d: null },          // 4: 空白
    { d: 'メモ' },        // 5: 非日付
  ];
  const order = createSourceOrder(dsRows.length);
  const columns = [dateSetCol('d')];
  const run = (value: DateSetColumnFilterValue): number[] =>
    asArray(
      filterOrderByColumns(dsRows, order, columns, { d: value }, undefined, NOW),
    );

  it('toDateKey / toDateSetKey: 表記ゆれの正規化と空白・非日付の扱い', () => {
    expect(toDateKey('2026/7/1')).toBe('2026-07-01');
    expect(toDateKey('2026-07-24T10:30')).toBe('2026-07-24');
    expect(toDateKey(new Date(2026, 6, 24))).toBe('2026-07-24');
    expect(toDateKey('2026-13-01')).toBeNull();
    expect(toDateKey('メモ')).toBeNull();
    expect(toDateKey('')).toBeNull();
    expect(toDateSetKey('2026/7/1')).toBe('2026-07-01');
    expect(toDateSetKey(null)).toBe('');
    expect(toDateSetKey('  ')).toBe('');
    expect(toDateSetKey('メモ')).toBe('メモ');
  });

  it('resolveDateFilterPreset: 今日 / 今月 / 過去 30 日(now 基準・両端含む)', () => {
    expect(resolveDateFilterPreset('today', NOW)).toEqual({
      from: '2026-07-24',
      to: '2026-07-24',
    });
    expect(resolveDateFilterPreset('thisMonth', NOW)).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });
    expect(resolveDateFilterPreset('last30days', NOW)).toEqual({
      from: '2026-06-25',
      to: '2026-07-24',
    });
  });

  it('condition AND set(範囲 かつ 7/20 を除外。set は正規化キーで照合)', () => {
    expect(
      run({
        kind: 'dateSet',
        condition: { mode: 'range', from: '2026-07-01', to: '2026-07-31' },
        set: { mode: 'exclude', values: ['2026-07-20'] },
      }),
    ).toEqual([1, 2]);
  });

  it('相対プリセットは評価時に解決される(今月 = now 基準)', () => {
    expect(
      run({
        kind: 'dateSet',
        condition: { mode: 'preset', preset: 'thisMonth' },
        set: null,
      }),
    ).toEqual([1, 2, 3]);
    // 表記ゆれセル('2026/7/1')も正規化キーで判定されます。
    expect(
      run({
        kind: 'dateSet',
        condition: { mode: 'preset', preset: 'today' },
        set: null,
      }),
    ).toEqual([2]);
  });

  it('以降 / 以前 / 等しくない / 空白(非日付は比較で不一致)', () => {
    expect(
      run({
        kind: 'dateSet',
        condition: { mode: 'onOrAfter', value: '2026-07-01' },
        set: null,
      }),
    ).toEqual([1, 2, 3]);
    expect(
      run({
        kind: 'dateSet',
        condition: { mode: 'onOrBefore', value: '2026-01-31' },
        set: null,
      }),
    ).toEqual([0]);
    expect(
      run({
        kind: 'dateSet',
        condition: { mode: 'notEquals', value: '2026-07-24' },
        set: null,
      }),
    ).toEqual([0, 1, 3]);
    expect(
      run({ kind: 'dateSet', condition: { mode: 'blank' }, set: null }),
    ).toEqual([4]);
  });

  it('set のみ(空白キーと非日付の生値も選択単位)、両方 null は無効', () => {
    expect(
      run({
        kind: 'dateSet',
        condition: null,
        set: { mode: 'include', values: ['', 'メモ'] },
      }),
    ).toEqual([4, 5]);
    const inactive: DateSetColumnFilterValue = {
      kind: 'dateSet',
      condition: null,
      set: null,
    };
    expect(isActiveColumnFilterValue(inactive)).toBe(false);
    expect(filterOrderByColumns(dsRows, order, columns, { d: inactive })).toBe(
      order,
    );
  });

  it('matchesParsedDateFilter は行 predicate と同じ合否(候補連動の土台)', () => {
    const condition = {
      mode: 'range',
      from: '2026-07-01',
      to: '2026-07-31',
    } as const;
    const viaOrder = run({ kind: 'dateSet', condition, set: null });
    const viaSingle = dsRows
      .map((_row, index) => index)
      .filter((index) =>
        matchesParsedDateFilter(condition, dsRows[index].d, NOW),
      );
    expect(viaOrder).toEqual(viaSingle);
  });

  // ── カスタムプリセット(preset-opt) ──────────────────
  //   列定義(dateFilterPresets)の resolve が評価のたびに解決されること・解決不能 ID は
  //   「条件なし」へ倒れることを、行 predicate 経路(compileParsedDatePredicate)で検証します。
  describe('カスタムプリセット(preset-opt)', () => {
    // 「過去 7 日」(now 含む)のカスタム定義です。Date 端値の正規化も同時に検証します。
    const last7days = {
      id: 'last7days',
      label: '過去 7 日',
      resolve: (now: Date) => ({
        from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6),
        to: now,
      }),
    };
    const customCol = (key: string): GridColumn<Row> => ({
      ...dateSetCol(key),
      dateFilterPresets: ['today', last7days],
    });
    const runCustom = (value: DateSetColumnFilterValue): number[] =>
      asArray(
        filterOrderByColumns(
          dsRows,
          order,
          [customCol('d')],
          { d: value },
          undefined,
          NOW,
        ),
      );

    it('カスタム ID は列定義の resolve(now) で評価される', () => {
      // 過去 7 日(2026-07-18 〜 07-24)→ 2026-07-24(index 2)と 2026-07-20(index 3)が一致します。
      expect(
        runCustom({
          kind: 'dateSet',
          condition: { mode: 'preset', preset: 'last7days' },
          set: null,
        }),
      ).toEqual([2, 3]);
    });

    it('resolveParsedDateFilter: 片側のみの範囲は 以降 / 以前 へ、空範囲と未知 ID は null', () => {
      const presets = normalizeDateFilterPresets([
        { id: 'fromOnly', label: 'F', resolve: () => ({ from: '2026-07-01' }) },
        { id: 'toOnly', label: 'T', resolve: () => ({ to: '2026-07-01' }) },
        { id: 'empty', label: 'E', resolve: () => ({}) },
      ]);
      expect(
        resolveParsedDateFilter({ mode: 'preset', preset: 'fromOnly' }, NOW, presets),
      ).toEqual({ mode: 'onOrAfter', value: '2026-07-01' });
      expect(
        resolveParsedDateFilter({ mode: 'preset', preset: 'toOnly' }, NOW, presets),
      ).toEqual({ mode: 'onOrBefore', value: '2026-07-01' });
      expect(
        resolveParsedDateFilter({ mode: 'preset', preset: 'empty' }, NOW, presets),
      ).toBeNull();
      expect(
        resolveParsedDateFilter({ mode: 'preset', preset: 'ghost' }, NOW, presets),
      ).toBeNull();
      // ビルトイン ID は presets に含まれていなくても常に解決できます(後方互換)。
      expect(
        resolveParsedDateFilter({ mode: 'preset', preset: 'today' }, NOW, presets),
      ).toEqual({ mode: 'range', from: '2026-07-24', to: '2026-07-24' });
      // 逆転範囲は from/to を入れ替えて正規化します。
      expect(
        resolveParsedDateFilter(
          { mode: 'preset', preset: 'rev' },
          NOW,
          normalizeDateFilterPresets([
            {
              id: 'rev',
              label: 'R',
              resolve: () => ({ from: '2026-07-31', to: '2026-07-01' }),
            },
          ]),
        ),
      ).toEqual({ mode: 'range', from: '2026-07-01', to: '2026-07-31' });
    });

    it('列定義から消えたカスタム ID は「条件なし」(全行合格)として評価される', () => {
      // dateFilterPresets 未指定の列に保存済みカスタム ID → 条件は無視され、全行が残ります。
      expect(
        run({
          kind: 'dateSet',
          condition: { mode: 'preset', preset: 'last7days' },
          set: null,
        }),
      ).toEqual([0, 1, 2, 3, 4, 5]);
      // matchesParsedDateFilter(候補連動)も同じ規則です。
      expect(
        matchesParsedDateFilter(
          { mode: 'preset', preset: 'ghost' },
          '2020-01-01',
          NOW,
        ),
      ).toBe(true);
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