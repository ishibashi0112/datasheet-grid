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
    // filterType の無い列は並び替えだけ
    expect(lines).toContain('- note "備考": no ops (sort only).');
    expect(request.prompt).not.toContain('secret');
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
      set: null,
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

  it('答えの欠けた欄は無いものとして扱う', () => {
    const result = read({ filters: [{ column: 'code', op: 'contains', value: 'A' }] });
    expect(result.state.filters.columnFilters).toEqual({ code: { kind: 'text', value: 'A' } });
    expect(result.dropped).toEqual([]);
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