import { describe, it, expect } from 'vitest';

import {
  createGridAskRequest,
  describeGridAskView,
  gridAskSystemPrompt,
  isGridAskColumnsChanged,
  isSameGridAskView,
  readGridAskAnswer,
  removeGridAskItem,
  type GridAskFilter,
  type GridAskOptions,
} from './gridAsk';
import { buildGridState } from './gridState';
import type { ColumnFilterValue, GridColumn, GridState } from '../model/gridTypes.unbound';

type Row = Record<string, unknown>;

const columns: GridColumn<Row>[] = [
  { key: 'code', title: '品番', width: 100, filterType: 'text' },
  { key: 'name', title: '品名', width: 160, filterType: 'textSet' },
  {
    key: 'warehouse',
    title: '倉庫',
    width: 80,
    filterType: 'set',
    filterOptions: [
      { value: 'tokyo', label: '東京' },
      { value: 'osaka', label: '大阪' },
    ],
  },
  {
    key: 'category',
    title: '分類',
    width: 80,
    filterType: 'select',
    editor: {
      type: 'select',
      options: [
        { value: '文具', label: '文具' },
        { value: '家電', label: '家電' },
      ],
    },
  },
  { key: 'stock', title: '在庫数', width: 80, filterType: 'numberSet' },
  { key: 'price', title: '単価', width: 80, filterType: 'number' },
  { key: 'arrived', title: '入荷日', width: 100, filterType: 'dateSet' },
  { key: 'amount', title: '金額', width: 80, filterType: 'auto', editor: { type: 'number' } },
  { key: 'memo', title: 'メモ', width: 120, filterType: 'auto' },
  { key: 'note', title: '備考', width: 120 },
  { key: 'secret', title: '原価', width: 80, filterType: 'number' },
];

const options: GridAskOptions<Row> = {
  columns,
  columnHints: { stock: '個', secret: false },
  allowColumnVisibility: true,
  now: new Date(2026, 9, 27),
};

const stateOf = (
  columnFilters: Record<string, ColumnFilterValue> = {},
  extra: Partial<Pick<GridState, 'sort'>> & { globalText?: string; hidden?: string[] } = {},
): GridState =>
  buildGridState(
    { code: 120 },
    { globalText: extra.globalText ?? '', columnFilters },
    extra.sort ?? [],
    columns.map((column) =>
      extra.hidden?.includes(column.key) ? { key: column.key, visible: false } : { key: column.key },
    ),
  );

const f = (column: string, op: GridAskFilter['op'], extra: Partial<GridAskFilter> = {}): GridAskFilter => ({
  column,
  op,
  value: null,
  values: null,
  to: null,
  ...extra,
});

const answer = (extra: Record<string, unknown>) => ({
  mode: 'replace',
  filters: [],
  sort: null,
  search: null,
  hide: [],
  show: [],
  unsupported: null,
  ...extra,
});

const read = (value: unknown, state: GridState = stateOf(), opts: GridAskOptions<Row> = options) => {
  const result = readGridAskAnswer(value, state, opts);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result;
};

describe('createGridAskRequest', () => {
  it('列の説明・今日・今の条件・利用者の文を組み立てる(行のデータは入らない)', () => {
    const request = createGridAskRequest(' 東京の在庫が少ないもの ', stateOf(), options);
    expect(request.system).toBe(gridAskSystemPrompt);
    expect(request.text).toBe('東京の在庫が少ないもの');
    const lines = request.prompt.split('\n');
    expect(lines[0]).toBe('Today: 2026-10-27 (Tue)');
    expect(lines).toContain('- code "品番": text. ops: contains, clear');
    expect(lines).toContain(
      '- stock "在庫数" (個): number. ops: =, !=, >, >=, <, <=, between, blank, notBlank, in, notIn, clear',
    );
    expect(lines).toContain('- warehouse "倉庫": choice. values: "tokyo" (東京), "osaka" (大阪). ops: in, notIn, clear');
    // select はエディタの静的な選択肢を候補にする
    expect(lines).toContain('- category "分類": choice (one value). values: "文具", "家電". ops: equals, clear');
    expect(lines.find((line) => line.startsWith('- arrived'))).toContain(
      'preset (today = 今日, thisMonth = 今月, last30days = 過去 30 日)',
    );
    // auto は editor が number なら numberSet、手がかりが無ければ text(含む だけ)
    expect(lines.find((line) => line.startsWith('- amount'))).toContain('number.');
    expect(lines).toContain('- memo "メモ": text. ops: contains, clear');
    // filterType の無い列は絞り込めない(並び替えだけ)
    expect(lines).toContain('- note "備考": no ops.');
    expect(request.prompt).not.toContain('secret');
    expect(lines).toContain("Filters: allowed (by each column's ops).");
    expect(lines).toContain('Sort: allowed (any column above).');
    expect(lines).toContain('Hide or show columns: allowed.');
    expect(lines).toContain('Current view: {"filters":[],"sort":[],"search":null,"hidden":[]}');
    expect(lines[lines.length - 1]).toBe('Request: 東京の在庫が少ないもの');
  });

  it('今の条件を答えと同じ形で書く(見せない列は書かない)', () => {
    const state = stateOf(
      {
        stock: { kind: 'numberSet', condition: { mode: 'comparison', operator: '<=', value: 10 }, set: { values: ['3'] } },
        arrived: { kind: 'dateSet', condition: { mode: 'preset', preset: 'thisMonth' }, set: null },
        secret: { kind: 'number', raw: '5 以上', parsed: { mode: 'comparison', operator: '>=', value: 5 } },
      },
      { sort: [{ columnKey: 'price', direction: 'desc' }], globalText: 'ペン', hidden: ['memo'] },
    );
    const current = createGridAskRequest('x', state, options).prompt.split('\n').find((line) => line.startsWith('Current view: '));
    expect(JSON.parse(current!.slice('Current view: '.length))).toEqual({
      filters: [
        f('stock', '<=', { value: '10' }),
        f('stock', 'in', { values: ['3'] }),
        f('arrived', 'preset', { value: 'thisMonth' }),
      ],
      sort: [{ column: 'price', direction: 'desc' }],
      search: 'ペン',
      hidden: ['memo'],
    });
  });

  it('答えの形は列の key だけが変わる JSON Schema', () => {
    const { schema } = createGridAskRequest('x', stateOf(), options);
    const properties = schema.properties as Record<string, { items?: { properties?: Record<string, { enum?: string[] }> } }>;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['mode', 'filters', 'sort', 'search', 'hide', 'show', 'unsupported']);
    expect(properties.filters.items?.properties?.column.enum).toEqual(
      columns.map((column) => column.key).filter((key) => key !== 'secret'),
    );
    const other = createGridAskRequest('y', stateOf({ code: { kind: 'text', value: 'A' } }), options).schema;
    expect(other).toEqual(schema);
  });

  it('許さないものはそう書く', () => {
    const prompt = createGridAskRequest('x', stateOf(), {
      ...options,
      allowSort: false,
      allowSearch: false,
      allowColumnVisibility: false,
    }).prompt;
    expect(prompt).toContain('Sort: not allowed.');
    expect(prompt).toContain('Search: not allowed.');
    expect(prompt).toContain('Hide or show columns: not allowed.');
    expect(prompt).toContain('Current view: {"filters":[]}');
  });

  it('プリセットを消した dateSet では preset を使わせない', () => {
    const prompt = createGridAskRequest('x', stateOf(), {
      columns: [{ key: 'd', title: '日付', width: 80, filterType: 'dateSet', dateFilterPresets: false }],
    }).prompt;
    expect(prompt).toContain('- d "日付": date. ops: between, onOrAfter, onOrBefore, equals, notEquals, blank, notBlank, in, notIn, clear');
  });
});

describe('readGridAskAnswer', () => {
  it('条件・並びを列の filterType どおりの記述子にする', () => {
    const result = read(
      answer({
        filters: [f('warehouse', 'in', { values: ['東京'] }), f('stock', '<=', { value: '10' })],
        sort: [{ column: 'price', direction: 'desc' }],
      }),
    );
    expect(result.dropped).toEqual([]);
    expect(result.changed).toBe(true);
    expect(result.state.filters.columnFilters).toEqual({
      warehouse: { kind: 'set', mode: 'include', values: ['tokyo'] },
      stock: { kind: 'numberSet', condition: { mode: 'comparison', operator: '<=', value: 10 }, set: null },
    });
    expect(result.state.sort).toEqual([{ columnKey: 'price', direction: 'desc' }]);
    // 列幅と列メタは今のまま
    expect(result.state.columnWidths).toEqual({ code: 120 });
    expect(isGridAskColumnsChanged(stateOf(), result.state)).toBe(false);
  });

  it('number は raw に画面と同じ表示を入れる / text・date・select', () => {
    const result = read(
      answer({
        filters: [
          f('price', 'between', { value: '30000', to: '1000' }),
          f('code', 'contains', { value: ' A- ' }),
          f('category', 'equals', { value: '家電' }),
        ],
      }),
    );
    expect(result.state.filters.columnFilters).toEqual({
      price: { kind: 'number', raw: '1000 〜 30000', parsed: { mode: 'range', min: 1000, max: 30000 } },
      code: { kind: 'text', value: 'A-' },
      category: { kind: 'select', value: '家電' },
    });
  });

  it('全角の数字と 3 桁区切り、数のままの値も読む', () => {
    const result = read(
      answer({
        filters: [f('price', '>=', { value: '１万' }), f('stock', '>', { value: '1,000' })],
      }),
    );
    expect(result.dropped).toEqual(['単価: 「１万」は数として読めません']);
    const numeric = read(answer({ filters: [{ ...f('price', '<'), value: 500 }, f('stock', '=', { value: '１２' })] }));
    expect(numeric.state.filters.columnFilters).toEqual({
      price: { kind: 'number', raw: '500 未満', parsed: { mode: 'comparison', operator: '<', value: 500 } },
      stock: { kind: 'numberSet', condition: { mode: 'comparison', operator: '=', value: 12 }, set: null },
    });
    expect(result.state.filters.columnFilters.stock).toEqual({
      kind: 'numberSet',
      condition: { mode: 'comparison', operator: '>', value: 1000 },
      set: null,
    });
  });

  it('日付は YYYY-MM-DD へ揃え、範囲の逆転は入れ替え、プリセットは列の id だけ', () => {
    const result = read(
      answer({
        filters: [f('arrived', 'between', { value: '2026/10/31', to: '2026-10-1' })],
      }),
    );
    expect(result.state.filters.columnFilters.arrived).toEqual({
      kind: 'dateSet',
      condition: { mode: 'range', from: '2026-10-01', to: '2026-10-31' },
      set: null,
    });
    const preset = read(answer({ filters: [f('arrived', 'preset', { value: 'thisMonth' })] }));
    expect(preset.state.filters.columnFilters.arrived).toEqual({
      kind: 'dateSet',
      condition: { mode: 'preset', preset: 'thisMonth' },
      set: null,
    });
    const bad = read(
      answer({
        filters: [f('arrived', 'preset', { value: 'lastYear' }), f('arrived', 'onOrAfter', { value: '2026-02-30' })],
      }),
    );
    expect(bad.dropped).toEqual([
      '入荷日: 「lastYear」という期間は使えません',
      '入荷日: 「2026-02-30」は日付として読めません',
    ]);
    expect(bad.state.filters.columnFilters).toEqual({});
  });

  it('複合の列は条件 1 つと選択 1 つを合わせ、2 つ目の条件は捨てる', () => {
    const result = read(
      answer({
        filters: [
          f('name', 'startsWith', { value: 'ボール' }),
          f('name', 'notIn', { values: ['ボールペン 赤'] }),
          f('name', 'contains', { value: '黒' }),
          f('arrived', 'in', { values: ['2026/10/2', '未定'] }),
        ],
      }),
    );
    expect(result.state.filters.columnFilters).toEqual({
      name: {
        kind: 'textSet',
        condition: { mode: 'startsWith', value: 'ボール' },
        set: { mode: 'exclude', values: ['ボールペン 赤'] },
      },
      arrived: { kind: 'dateSet', condition: null, set: { mode: 'include', values: ['2026-10-02', '未定'] } },
    });
    expect(result.dropped).toEqual(['品名: 条件は 1 列に 1 つまでです']);
  });

  it('複合でない列に 2 つ目が来たら捨てる', () => {
    const result = read(answer({ filters: [f('price', '>=', { value: '10' }), f('price', '<=', { value: '20' })] }));
    expect(result.dropped).toEqual(['単価: 条件は 1 列に 1 つまでです']);
    expect(result.state.filters.columnFilters.price).toMatchObject({ raw: '10 以上' });
  });

  it('候補は値・表示名・大文字小文字の違いでも引き、候補に無い値は捨てる', () => {
    const result = read(
      answer({
        filters: [
          f('warehouse', 'notIn', { values: ['大阪', 'TOKYO', '福岡'] }),
          f('category', 'equals', { value: '家具' }),
        ],
      }),
    );
    expect(result.state.filters.columnFilters).toEqual({
      warehouse: { kind: 'set', mode: 'exclude', values: ['osaka', 'tokyo'] },
    });
    expect(result.dropped).toEqual(['倉庫: 「福岡」は候補にありません', '分類: 「家具」は候補にありません']);
    const none = read(answer({ filters: [f('warehouse', 'in', { values: ['福岡'] })] }));
    expect(none.dropped).toEqual(['倉庫: 「福岡」は候補にありません', '倉庫: 選べる値がありません']);
  });

  it('無い列・見せていない列・使えない条件・絞り込めない列は理由を付けて捨てる', () => {
    const result = read(
      answer({
        filters: [
          f('color', 'equals', { value: '赤' }),
          f('secret', '>', { value: '1' }),
          f('code', '>', { value: '1' }),
          f('note', 'contains', { value: 'x' }),
          f('memo', 'startsWith', { value: 'x' }),
          f('stock', 'contains', { value: '' }),
          'not a filter',
        ],
        sort: [{ column: 'color', direction: 'asc' }, { column: 'note', direction: 'desc' }],
      }),
    );
    expect(result.dropped).toEqual([
      '「color」という列はありません',
      '「secret」という列はありません',
      '品番: この列では「より大きい」の条件は使えません',
      '備考: この列では絞り込めません',
      'メモ: この列では「で始まる」の条件は使えません',
      '在庫数: この列では「を含む」の条件は使えません',
      '並び: 「color」という列はありません',
    ]);
    // 絞り込めない列でも並び替えはできる
    expect(result.state.sort).toEqual([{ columnKey: 'note', direction: 'desc' }]);
  });

  it('auto は手がかりが無ければ text の記述子、editor が number なら numberSet', () => {
    const result = read(
      answer({ filters: [f('memo', 'contains', { value: '至急' }), f('amount', '>=', { value: '100' })] }),
    );
    expect(result.state.filters.columnFilters).toEqual({
      memo: { kind: 'text', value: '至急' },
      amount: { kind: 'numberSet', condition: { mode: 'comparison', operator: '>=', value: 100 }, set: null },
    });
  });

  it('auto は適用中の記述子の種類に合わせる', () => {
    const state = stateOf({ memo: { kind: 'textSet', condition: null, set: { values: ['a'] } } });
    const result = read(answer({ mode: 'refine', filters: [f('memo', 'equals', { value: 'b' })] }), state);
    expect(result.state.filters.columnFilters.memo).toEqual({
      kind: 'textSet',
      condition: { mode: 'equals', value: 'b' },
      set: { values: ['a'] },
    });
  });

  it('refine で複合の列の片方だけ来たら、今の記述子のもう片方は残す', () => {
    const state = stateOf({
      stock: { kind: 'numberSet', condition: { mode: 'comparison', operator: '<=', value: 10 }, set: null },
    });
    // 「さらに 0 は除いて」: 「10 以下」は残して選択を足す
    expect(read(answer({ mode: 'refine', filters: [f('stock', 'notIn', { values: ['0'] })] }), state).state.filters.columnFilters.stock).toEqual({
      kind: 'numberSet',
      condition: { mode: 'comparison', operator: '<=', value: 10 },
      set: { mode: 'exclude', values: ['0'] },
    });
    // 今の条件の側は上書きする(2 つ目扱いにしない)
    const both = stateOf({
      stock: {
        kind: 'numberSet',
        condition: { mode: 'comparison', operator: '<=', value: 10 },
        set: { mode: 'exclude', values: ['0'] },
      },
    });
    const replaced = read(answer({ mode: 'refine', filters: [f('stock', '<=', { value: '5' })] }), both);
    expect(replaced.state.filters.columnFilters.stock).toEqual({
      kind: 'numberSet',
      condition: { mode: 'comparison', operator: '<=', value: 5 },
      set: { mode: 'exclude', values: ['0'] },
    });
    expect(replaced.dropped).toEqual([]);
    // 同じ答えの中の 2 つ目は今までどおり捨てる
    const twice = read(
      answer({ mode: 'refine', filters: [f('stock', '<=', { value: '5' }), f('stock', '>=', { value: '1' })] }),
      both,
    );
    expect(twice.dropped).toEqual(['在庫数: 条件は 1 列に 1 つまでです']);
    // replace は今の記述子を使わない
    expect(read(answer({ filters: [f('stock', 'notIn', { values: ['0'] })] }), state).state.filters.columnFilters.stock).toEqual({
      kind: 'numberSet',
      condition: null,
      set: { mode: 'exclude', values: ['0'] },
    });
  });

  it('numberSet の選択の値は数として揃える', () => {
    const result = read(answer({ filters: [f('stock', 'in', { values: ['1,000', '０', '10.0', '未定'] })] }));
    expect(result.state.filters.columnFilters.stock).toEqual({
      kind: 'numberSet',
      condition: null,
      set: { mode: 'include', values: ['1000', '0', '10', '未定'] },
    });
  });

  it('replace は見せた列の条件・並び・検索を空にし、見せていない列の条件と隠した列は残す', () => {
    const state = stateOf(
      {
        code: { kind: 'text', value: 'A' },
        secret: { kind: 'number', raw: '5 以上', parsed: { mode: 'comparison', operator: '>=', value: 5 } },
      },
      { sort: [{ columnKey: 'code', direction: 'asc' }], globalText: 'ペン', hidden: ['memo'] },
    );
    const result = read(answer({ filters: [f('price', '<', { value: '100' })] }), state);
    expect(Object.keys(result.state.filters.columnFilters).sort()).toEqual(['price', 'secret']);
    expect(result.state.sort).toEqual([]);
    expect(result.state.filters.globalText).toBe('');
    expect(isGridAskColumnsChanged(state, result.state)).toBe(false);
  });

  it('replace でも AI に見せていない並びと、絞り込めない列のフィルターは残す', () => {
    const state = stateOf(
      { note: { kind: 'text', value: '至急' }, code: { kind: 'text', value: 'A' } },
      { sort: [{ columnKey: 'secret', direction: 'desc' }, { columnKey: 'code', direction: 'asc' }] },
    );
    const replaced = read(answer({ sort: [{ column: 'price', direction: 'asc' }] }), state);
    expect(replaced.state.filters.columnFilters).toEqual({ note: { kind: 'text', value: '至急' } });
    expect(replaced.state.sort).toEqual([
      { columnKey: 'price', direction: 'asc' },
      { columnKey: 'secret', direction: 'desc' },
    ]);
    expect(read(answer({}), state).state.sort).toEqual([{ columnKey: 'secret', direction: 'desc' }]);
    // refine で並びが来ても、見せていない列の並びは後ろに残す
    expect(read(answer({ mode: 'refine', sort: [{ column: 'price', direction: 'asc' }] }), state).state.sort).toEqual([
      { columnKey: 'price', direction: 'asc' },
      { columnKey: 'secret', direction: 'desc' },
    ]);
  });

  it('refine は今の条件に足し、clear で列の条件を外す', () => {
    const state = stateOf(
      { code: { kind: 'text', value: 'A' }, warehouse: { kind: 'set', values: ['tokyo'] } },
      { sort: [{ columnKey: 'code', direction: 'asc' }], globalText: 'ペン' },
    );
    const result = read(
      answer({ mode: 'refine', filters: [f('price', '>=', { value: '10000' }), f('code', 'clear')] }),
      state,
    );
    expect(result.state.filters.columnFilters).toEqual({
      warehouse: { kind: 'set', values: ['tokyo'] },
      price: { kind: 'number', raw: '10000 以上', parsed: { mode: 'comparison', operator: '>=', value: 10000 } },
    });
    expect(result.state.sort).toEqual([{ columnKey: 'code', direction: 'asc' }]);
    expect(result.state.filters.globalText).toBe('ペン');
  });

  it('検索は文字で置き換え、"" で消し、null はそのまま', () => {
    const state = stateOf({}, { globalText: 'ペン' });
    expect(read(answer({ mode: 'refine', search: ' ノート ' }), state).state.filters.globalText).toBe('ノート');
    expect(read(answer({ mode: 'refine', search: '' }), state).state.filters.globalText).toBe('');
    expect(read(answer({ mode: 'refine', search: null }), state).state.filters.globalText).toBe('ペン');
  });

  it('許さない並び・検索・列の表示は変えずに理由を出す', () => {
    const state = stateOf({}, { sort: [{ columnKey: 'code', direction: 'asc' }], globalText: 'ペン' });
    const result = read(
      answer({ sort: [{ column: 'price', direction: 'asc' }], search: 'ノート', hide: ['memo'] }),
      state,
      { ...options, allowSort: false, allowSearch: false, allowColumnVisibility: false },
    );
    expect(result.state.sort).toEqual([{ columnKey: 'code', direction: 'asc' }]);
    expect(result.state.filters.globalText).toBe('ペン');
    expect(result.dropped).toEqual(['並びは変えない設定です', '検索の文字は変えない設定です', '列の表示は変えない設定です']);
    expect(result.changed).toBe(false);
    // replace の「空から」どおりの空の検索は知らせない
    const empty = read(answer({ search: '' }), state, { ...options, allowSearch: false });
    expect(empty.dropped).toEqual([]);
    expect(empty.state.filters.globalText).toBe('ペン');
  });

  it('列を隠す・見せる(無い列は捨て、すべては隠さない)', () => {
    const state = stateOf({}, { hidden: ['memo'] });
    const result = read(answer({ hide: ['price', 'secret'], show: ['memo'] }), state);
    expect(result.dropped).toEqual(['「secret」という列はありません']);
    const hidden = result.state.columns!.filter((entry) => entry.visible === false).map((entry) => entry.key);
    expect(hidden).toEqual(['price']);
    expect(result.state.columns!.find((entry) => entry.key === 'memo')).toEqual({ key: 'memo' });
    expect(isGridAskColumnsChanged(state, result.state)).toBe(true);

    const all = read(answer({ hide: columns.map((column) => column.key).filter((key) => key !== 'secret') }), stateOf({}, { hidden: ['secret'] }));
    expect(all.dropped).toContain('すべての列は隠せません');
    expect(isGridAskColumnsChanged(stateOf({}, { hidden: ['secret'] }), all.state)).toBe(false);
  });

  it('AI の「できなかった」をそのまま返し、変わらなければ changed は false', () => {
    const result = read(answer({ unsupported: ' 色の列はありません ' }));
    expect(result.unsupported).toBe('色の列はありません');
    expect(result.changed).toBe(false);
  });

  it('文字列の答え(```json の囲みや前後の文つき)も読み、読めないものは ok: false', () => {
    const json = JSON.stringify(answer({ filters: [f('code', 'contains', { value: 'A' })] }));
    expect(read(`\`\`\`json\n${json}\n\`\`\``).state.filters.columnFilters).toEqual({ code: { kind: 'text', value: 'A' } });
    expect(read(`こちらです: ${json} 以上`).state.filters.columnFilters).toEqual({ code: { kind: 'text', value: 'A' } });
    expect(readGridAskAnswer('こんにちは', stateOf(), options)).toEqual({
      ok: false,
      message: 'AI の答えを読めませんでした。言い方を変えて、もう一度試してください。',
    });
    expect(readGridAskAnswer([1, 2], stateOf(), options)).toEqual({
      ok: false,
      message: 'AI の答えが表への指示になっていませんでした。言い方を変えてください。',
    });
    expect(readGridAskAnswer(null, stateOf(), options).ok).toBe(false);
  });

  it('表への指示に見えない答え・mode が違う答えは表を変えずに ok: false(サーバーのエラーなど)', () => {
    const state = stateOf({ code: { kind: 'text', value: 'A' } }, { sort: [{ columnKey: 'code', direction: 'asc' }] });
    const shape = { ok: false, message: 'AI の答えが表への指示になっていませんでした。言い方を変えてください。' };
    expect(readGridAskAnswer({ error: 'Too many requests' }, state, options)).toEqual(shape);
    expect(readGridAskAnswer({}, state, options)).toEqual(shape);
    expect(readGridAskAnswer(JSON.stringify({ error: 'x' }), state, options)).toEqual(shape);
    expect(readGridAskAnswer({ mode: 'refine', filters: { code: 'A' } }, state, options)).toEqual(shape);
    expect(readGridAskAnswer({ mode: 'add', filters: [] }, state, options)).toEqual(shape);
    // mode があって filters だけが無い答え(並びだけを返したもの)は、条件なしとして読む
    const sortOnly = read({ mode: 'refine', sort: [{ column: 'price', direction: 'desc' }] }, state);
    expect(sortOnly.state.filters.columnFilters).toEqual({ code: { kind: 'text', value: 'A' } });
    expect(sortOnly.state.sort).toEqual([{ columnKey: 'price', direction: 'desc' }]);
  });

  it('知らない条件の名前は答えの文字のまま理由に出す', () => {
    const result = read(answer({ filters: [f('code', 'toString' as GridAskFilter['op'], { value: 'A' })] }));
    expect(result.dropped).toEqual(['品番: この列では「toString」の条件は使えません']);
  });

  it('答えの欠けた欄は無いものとして扱う', () => {
    const result = read({ filters: [{ column: 'code', op: 'contains', value: 'A' }] });
    expect(result.state.filters.columnFilters).toEqual({ code: { kind: 'text', value: 'A' } });
    expect(result.dropped).toEqual([]);
  });
});

describe('readGridAskAnswer: 利用者の条件を黙って変えない', () => {
  // AI が Current view をそのまま返したときの答えです(言い直し)。
  const echo = (state: GridState, mode: 'replace' | 'refine', opts: GridAskOptions<Row> = options) => {
    const line = createGridAskRequest('x', state, opts).prompt.split('\n').find((text) => text.startsWith('Current view: '));
    const current = JSON.parse((line ?? '').slice('Current view: '.length)) as {
      filters?: GridAskFilter[];
      sort?: { column: string; direction: string }[];
      search?: string | null;
    };
    return answer({
      mode,
      filters: (current.filters ?? []).map(({ column, op, value, values, to }) => ({ column, op, value, values, to })),
      sort: current.sort ?? null,
      search: current.search ?? null,
    });
  };

  it('今の条件をそのまま言い直しても変わらない(空白・文字列の数・前後の空白・打った書き方)', () => {
    const states = [
      stateOf({ warehouse: { kind: 'set', mode: 'exclude', values: ['', 'tokyo'] } }),
      stateOf({ name: { kind: 'textSet', condition: null, set: { mode: 'include', values: ['', 'ABC '] } } }),
      stateOf({ stock: { kind: 'numberSet', condition: { mode: 'comparison', operator: '<=', value: 10 }, set: { mode: 'include', values: ['100.00', '007'] } } }),
      stateOf({ arrived: { kind: 'dateSet', condition: null, set: { mode: 'exclude', values: ['', '未定'] } } }),
      stateOf({ price: { kind: 'number', raw: '1,000 以上', parsed: { mode: 'comparison', operator: '>=', value: 1000 } } }),
      stateOf({ code: { kind: 'text', value: 'ペン ' } }, { globalText: '赤 ' }),
      stateOf({ name: { kind: 'textSet', condition: null, set: { mode: 'include', values: ['x'.repeat(1200)] } } }),
      stateOf({ warehouse: { kind: 'set', mode: 'include', values: ['nagoya'] } }),
      stateOf({}, { sort: [{ columnKey: 'secret', direction: 'desc' }, { columnKey: 'code', direction: 'asc' }] }),
    ];
    states.forEach((state, index) => {
      for (const mode of ['replace', 'refine'] as const) {
        const result = read(echo(state, mode), state);
        const label = `${index} ${mode}`;
        expect({ changed: result.changed, dropped: result.dropped }, label).toEqual({ changed: false, dropped: [] });
        expect(result.state.filters, label).toEqual(state.filters);
        expect(result.state.sort, label).toEqual(state.sort);
      }
    });
  });

  it('"" は空白のセル。言い直しで値を足しても空白の除外は残る', () => {
    const state = stateOf({ warehouse: { kind: 'set', mode: 'exclude', values: ['', 'tokyo'] } });
    const result = read(answer({ mode: 'refine', filters: [f('warehouse', 'notIn', { values: ['', 'tokyo', 'osaka'] })] }), state);
    expect(result.state.filters.columnFilters.warehouse).toEqual({ kind: 'set', mode: 'exclude', values: ['', 'tokyo', 'osaka'] });
    expect(result.dropped).toEqual([]);
    // 空白だけを選ぶこともできる(候補に無くても空白は選べる)
    const blankOnly = read(answer({ filters: [f('stock', 'in', { values: [''] })] }));
    expect(blankOnly.state.filters.columnFilters.stock).toEqual({ kind: 'numberSet', condition: null, set: { mode: 'include', values: [''] } });
  });

  it('長い選択は Current view に一部だけ書き、AI が見ていない残りは言い直しでは消さない', () => {
    const values = Array.from({ length: 600 }, (_, index) => `v${index}`);
    const state = stateOf({ name: { kind: 'textSet', condition: null, set: { mode: 'exclude', values } } });
    const prompt = createGridAskRequest('x', state, options).prompt;
    expect(prompt).toContain('"v499"],"to":null,"more":100}');
    expect(prompt).not.toContain('"v500"');
    const shown = values.slice(0, 500);
    // refine で同じ op のまま足す → 残りの 100 件も残る
    const refined = read(answer({ mode: 'refine', filters: [f('name', 'notIn', { values: [...shown, 'new'] })] }), state);
    expect(refined.state.filters.columnFilters.name).toEqual({
      kind: 'textSet',
      condition: null,
      set: { mode: 'exclude', values: [...shown, 'new', ...values.slice(500)] },
    });
    // refine で見せた値を外す → 外した値だけが消える
    const removed = read(answer({ mode: 'refine', filters: [f('name', 'notIn', { values: shown.slice(1) })] }), state);
    expect(removed.state.filters.columnFilters.name).toEqual({
      kind: 'textSet',
      condition: null,
      set: { mode: 'exclude', values: values.slice(1) },
    });
    // replace で別の選択を書いた → 書いたものだけ(前の選択は引き継がない)
    const replaced = read(answer({ filters: [f('name', 'notIn', { values: ['v1'] })] }), state);
    expect(replaced.state.filters.columnFilters.name).toEqual({ kind: 'textSet', condition: null, set: { mode: 'exclude', values: ['v1'] } });
    // op を変えた → 書いたものだけ
    const flipped = read(answer({ mode: 'refine', filters: [f('name', 'in', { values: shown })] }), state);
    expect(flipped.state.filters.columnFilters.name).toEqual({ kind: 'textSet', condition: null, set: { mode: 'include', values: shown } });
  });

  it('選ぶ値の数と長さの上限は、切り詰めずに理由を出す', () => {
    const many = Array.from({ length: 1003 }, (_, index) => `v${index}`);
    const result = read(answer({ filters: [f('name', 'in', { values: [...many, 'x'.repeat(1001)] })] }));
    const set = (result.state.filters.columnFilters.name as Extract<ColumnFilterValue, { kind: 'textSet' }>).set;
    expect(set?.values).toEqual(many.slice(0, 1000));
    expect(result.dropped).toEqual(['品名: 選べる値は 1000 件までです(4 件は使いませんでした)']);
    const long = read(answer({ filters: [f('name', 'in', { values: ['x'.repeat(1001), 'ok', null, 3] as unknown as string[] })] }));
    expect((long.state.filters.columnFilters.name as Extract<ColumnFilterValue, { kind: 'textSet' }>).set?.values).toEqual(['ok', '3']);
    expect(long.dropped).toEqual(['品名: 1000 字を超える値(1 件)は使えません', '品名: 値として読めないもの(1 件)は使えません']);
    const text = read(answer({ filters: [f('code', 'contains', { value: 'x'.repeat(201) })], search: 'y'.repeat(201) }));
    expect(text.state.filters).toEqual({ globalText: '', columnFilters: {} });
    expect(text.dropped).toEqual(['品番: 探す文字は 200 字までです', '検索の文字は 200 字までです']);
  });

  it('filterOptions: [] は行から集める列(候補を決めずに値を受け取る)', () => {
    const cols: GridColumn<Row>[] = [{ key: 'tag', title: 'タグ', width: 80, filterType: 'set', filterOptions: [] }];
    const prompt = createGridAskRequest('x', stateOf(), { columns: cols }).prompt;
    expect(prompt).toContain('- tag "タグ": choice. ops: in, notIn, clear');
    const result = read(answer({ filters: [f('tag', 'in', { values: ['赤'] })] }), stateOf(), { columns: cols });
    expect(result.state.filters.columnFilters.tag).toEqual({ kind: 'set', mode: 'include', values: ['赤'] });
  });

  it('select の値 "" は並べず、選ばれても今の条件を残して理由を出す', () => {
    const cols: GridColumn<Row>[] = [
      {
        key: 'status',
        title: '状態',
        width: 80,
        filterType: 'select',
        editor: { type: 'select', options: [{ value: '', label: '未設定' }, { value: 'done', label: '完了' }] },
      },
    ];
    expect(createGridAskRequest('x', stateOf(), { columns: cols }).prompt).toContain('values: "done" (完了). ops: equals, clear');
    const state = stateOf({ status: { kind: 'select', value: 'done' } });
    const result = read(answer({ mode: 'refine', filters: [f('status', 'equals', { value: '未設定' })] }), state, { columns: cols });
    expect(result.state.filters.columnFilters).toEqual({ status: { kind: 'select', value: 'done' } });
    expect(result).toMatchObject({ changed: false, dropped: ['状態: 「未設定」では絞り込めません'] });
  });

  it('AI に見せていない並びは、並びが変わらなければ元の位置のまま', () => {
    const state = stateOf({}, { sort: [{ columnKey: 'secret', direction: 'desc' }, { columnKey: 'code', direction: 'asc' }] });
    const same = read(answer({ mode: 'refine', sort: [{ column: 'code', direction: 'asc' }] }), state);
    expect(same.changed).toBe(false);
    expect(same.state.sort).toEqual(state.sort);
    const changed = read(answer({ mode: 'refine', sort: [{ column: 'price', direction: 'desc' }] }), state);
    expect(changed.state.sort).toEqual([
      { columnKey: 'price', direction: 'desc' },
      { columnKey: 'secret', direction: 'desc' },
    ]);
  });

  it('並びの向きは大文字・ascending / descending も読み、読めない向きは理由を出す。op は文字だけ', () => {
    const result = read(
      answer({
        sort: [
          { column: 'price', direction: 'DESC' },
          { column: 'code', direction: 'ascending' },
          { column: 'stock', direction: 'up' },
        ],
        filters: [{ column: 'warehouse', op: ['in'], value: null, values: ['東京'], to: null }],
      }),
    );
    expect(result.state.sort).toEqual([
      { columnKey: 'price', direction: 'desc' },
      { columnKey: 'code', direction: 'asc' },
    ]);
    expect(result.dropped).toEqual(['倉庫: 条件の種類がありません', '並び: 在庫数 の向き「up」は使えません']);
  });

  it('理由の数と、理由に引く答えの文字は長くしない', () => {
    const result = read(
      answer({
        filters: [
          f('code', 'x'.repeat(10_000) as GridAskFilter['op'], { value: 'A' }),
          ...Array.from({ length: 30 }, (_, index) => f(`none${index}`, 'contains', { value: 'A' })),
        ],
      }),
    );
    expect(result.dropped).toHaveLength(20);
    expect(result.dropped[0]).toBe(`品番: この列では「${'x'.repeat(40)}…」の条件は使えません`);
    expect(result.dropped[19]).toBe('ほか 12 件');
    const unknown = read(answer({ filters: [f('warehouse', 'in', { values: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })] }));
    expect(unknown.dropped).toEqual(['倉庫: 「a」「b」「c」「d」「e」ほか 2 件は候補にありません', '倉庫: 選べる値がありません']);
  });

  it('列が多い表は答えの形で列を enum にせず、列は key か見出しで引く', () => {
    const wide: GridColumn<Row>[] = Array.from({ length: 101 }, (_, index) => ({
      key: `c${index}`,
      title: `列${index}`,
      width: 80,
      filterType: 'text' as const,
    }));
    const { schema } = createGridAskRequest('x', stateOf(), { columns: wide });
    expect(JSON.stringify(schema)).not.toContain('"c0"');
    const result = read(answer({ filters: [f('列5', 'contains', { value: 'A' })], sort: [{ column: 'c7', direction: 'asc' }] }), stateOf(), {
      columns: wide,
    });
    expect(result.state.filters.columnFilters).toEqual({ c5: { kind: 'text', value: 'A' } });
    expect(result.state.sort).toEqual([{ columnKey: 'c7', direction: 'asc' }]);
    // 見出しが重なる列は見出しでは引かない
    const twins: GridColumn<Row>[] = [
      { key: 'a', title: '名前', width: 80, filterType: 'text' },
      { key: 'b', title: '名前', width: 80, filterType: 'text' },
    ];
    expect(read(answer({ filters: [f('名前', 'contains', { value: 'A' })] }), stateOf(), { columns: twins }).dropped).toEqual([
      '「名前」という列はありません',
    ]);
  });

  it('allowFilter: false は列の条件を変えない(今の条件は replace でも残す)', () => {
    const state = stateOf({ code: { kind: 'text', value: 'A' } });
    const opts = { ...options, allowFilter: false };
    const prompt = createGridAskRequest('x', state, opts).prompt;
    expect(prompt).toContain('Filters: not allowed.');
    expect(prompt).toContain('- code "品番": no ops.');
    expect(prompt).not.toContain('"filters"');
    const result = read(answer({ filters: [f('code', 'contains', { value: 'B' })], sort: [{ column: 'code', direction: 'asc' }] }), state, opts);
    expect(result.state.filters.columnFilters).toEqual({ code: { kind: 'text', value: 'A' } });
    expect(result.state.sort).toEqual([{ columnKey: 'code', direction: 'asc' }]);
    expect(result.dropped).toEqual(['列の条件は変えない設定です']);
  });

  it('Current view には AI が変えられる列の条件だけを書く', () => {
    const state = stateOf({ note: { kind: 'text', value: '急ぎ' }, code: { kind: 'text', value: 'A' } });
    expect(createGridAskRequest('x', state, options).prompt).toContain(
      'Current view: {"filters":[{"column":"code","op":"contains","value":"A","values":null,"to":null}]',
    );
  });

  it('列の key が __proto__ でも普通の列として扱う', () => {
    const cols: GridColumn<Row>[] = [
      { key: '__proto__', title: 'P', width: 80, filterType: 'text' },
      { key: 'b', title: 'B', width: 80, filterType: 'text' },
    ];
    const result = read(answer({ filters: [f('__proto__', 'contains', { value: 'x' })] }), stateOf(), { columns: cols });
    expect(Object.keys(result.state.filters.columnFilters)).toEqual(['__proto__']);
    expect(result.changed).toBe(true);
    expect(Object.getPrototypeOf(result.state.filters.columnFilters)).toBe(Object.prototype);
  });
});

describe('見え方の比較とチップ', () => {
  const state = stateOf(
    {
      warehouse: { kind: 'set', mode: 'include', values: ['tokyo'] },
      arrived: { kind: 'dateSet', condition: { mode: 'preset', preset: 'thisMonth' }, set: null },
    },
    { sort: [{ columnKey: 'price', direction: 'desc' }], globalText: 'ペン', hidden: ['memo'] },
  );

  it('チップはフィルター → 並び → 検索 → 隠した列', () => {
    expect(describeGridAskView(state, options)).toEqual([
      { id: 'f:warehouse', label: '倉庫', text: '"tokyo"' },
      { id: 'f:arrived', label: '入荷日', text: '今月' },
      { id: 's:price', label: '並び', text: '単価 降順' },
      { id: 'q', label: '検索', text: '「ペン」' },
      { id: 'h:memo', label: '隠した列', text: 'メモ' },
    ]);
    expect(describeGridAskView(state, { ...options, allowColumnVisibility: false }).map((item) => item.id)).not.toContain(
      'h:memo',
    );
  });

  it('チップを外した状態', () => {
    expect(removeGridAskItem(state, 'f:warehouse').filters.columnFilters).not.toHaveProperty('warehouse');
    expect(removeGridAskItem(state, 's:price').sort).toEqual([]);
    expect(removeGridAskItem(state, 'q').filters.globalText).toBe('');
    expect(removeGridAskItem(state, 'h:memo').columns!.find((entry) => entry.key === 'memo')).toEqual({ key: 'memo' });
    // 元の状態は変えない
    expect(state.filters.columnFilters).toHaveProperty('warehouse');
  });

  it('見え方の比較は列幅・列の順番・固定を見ない', () => {
    const moved: GridState = {
      ...state,
      columnWidths: { code: 300 },
      columns: [...state.columns!].reverse().map((entry) => (entry.key === 'code' ? { ...entry, pinned: 'left' } : entry)),
    };
    expect(isSameGridAskView(state, moved)).toBe(true);
    expect(isSameGridAskView(state, removeGridAskItem(state, 'q'))).toBe(false);
    expect(isSameGridAskView(state, removeGridAskItem(state, 'h:memo'))).toBe(false);
  });
});