// React 版(`/lite` に同じ機能を差し込んだもの)と Solid 版のフィルター / 列メニュー / ツールパネルを同じ操作で動かして、
//   DOM と通知と命令的 API の結果が同じかを見る(段階 2-3)。
import { beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type ParityContext } from './harness';

type Row = { id: number; name: string; qty: number; city: string; day: string; code: number };

const columns = [
  { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 120, filterType: 'text' },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' }, filterType: 'number' },
  { key: 'city', title: '都市', width: 100, filterType: 'set' },
  { key: 'day', title: '日付', width: 110, filterType: 'date', editor: { type: 'date' } },
];

const CITIES = ['東京', '大阪', '名古屋', '福岡'];
const pad = (value: number) => String(value).padStart(2, '0');
// 今日から i 日前(相対日付プリセットの「今日」「過去 30 日」に当たる行と当たらない行を作る)。
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `品目 ${i + 1}`,
    qty: i * 10,
    city: CITIES[i % CITIES.length] as string,
    day: daysAgo((i * 5) % 60),
    code: i + 1,
  }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

const pointer = { button: 0, pointerId: 1, isPrimary: true };

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);

const topInput = (ctx: ParityContext) => ctx.container.querySelector<HTMLInputElement>('.ssg-bar-input');

const typeTop = async (ctx: ParityContext, value: string) => {
  await ctx.act(() => {
    const input = topInput(ctx);
    if (!input) {
      throw new Error(`[${ctx.framework}] 上部バーの検索欄がありません`);
    }
    fireEvent.input(input, { target: { value } });
  });
};

const sortBy = async (ctx: ParityContext, key: string) => {
  await ctx.act(() => {
    fireEvent.pointerDown(ctx.header(key), { ...pointer, shiftKey: true });
    fireEvent.pointerUp(window, { ...pointer, shiftKey: true });
  });
};

describe('行の絞り込み(filtering)', () => {
  it.each([
    ['あり', ['filtering', 'export']],
    ['なし', ['export']],
  ])('上部バーの検索欄と applyState の列フィルター(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      watch: ['onFiltersChange', 'onStateChange'],
      props: () => ({ rows: makeRows(24), columns, rowKeyGetter: (row: Row) => row.id, height: 360 }),
      steps: async (ctx) => {
        ctx.snapshot('最初');
        ctx.track('検索欄', () => topInput(ctx));
        if (topInput(ctx)) {
          await typeTop(ctx, '品目 1');
          ctx.snapshot('「品目 1」で絞り込み');
          await typeTop(ctx, '  ');
          ctx.snapshot('空白だけ');
          await typeTop(ctx, '大阪');
          ctx.snapshot('「大阪」');
          // × で消す。
          await ctx.act(() => {
            const clear = ctx.container.querySelector<HTMLElement>('.ssg-bar-input-clear');
            if (clear) {
              fireEvent.click(clear);
            }
          });
          ctx.snapshot('× で消した');
          await typeTop(ctx, '一致しない文字');
          ctx.snapshot('一致なし(空の表の文言)');
          await typeTop(ctx, '');
        }
        // 列フィルター(数量 > 100、都市は 東京 と 福岡 だけ)。
        await ctx.act(() => {
          call(ctx, 'applyState', {
            filters: {
              globalText: '',
              columnFilters: {
                qty: { kind: 'number', raw: '>100', parsed: { mode: 'comparison', operator: '>', value: 100 } },
                city: { kind: 'set', values: ['東京', '福岡'] },
              },
            },
          });
        });
        ctx.snapshot('列フィルター 2 つ');
        ctx.log('getState(列フィルター 2 つ)', call(ctx, 'getState'));
        ctx.log('exportCsv(列フィルター 2 つ)', call(ctx, 'exportCsv'));
        await sortBy(ctx, 'qty');
        await sortBy(ctx, 'qty');
        ctx.snapshot('列フィルター + 数量の降順');
        // 検索の文字を命令的 API で(入力欄の値も追従する)。
        await ctx.act(() => {
          call(ctx, 'applyState', { filters: { globalText: '品目 1', columnFilters: {} } });
        });
        ctx.snapshot('applyState の検索の文字');
        ctx.log('入力欄の値', topInput(ctx)?.value ?? null);
        // 編集で行が条件から外れる(数量を 0 にすると「> 100」に当たらなくなる)。
        await ctx.act(() => {
          call(ctx, 'applyState', {
            filters: {
              globalText: '',
              columnFilters: {
                qty: { kind: 'number', raw: '>100', parsed: { mode: 'comparison', operator: '>', value: 100 } },
              },
            },
          });
        });
        await ctx.act(() => {
          const cell = ctx.cell(0, 'qty');
          fireEvent.pointerDown(cell, pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'Delete' });
        });
        ctx.snapshot('編集で条件から外れた');
        await ctx.act(() => {
          call(ctx, 'applyState', { filters: { globalText: '', columnFilters: {} } });
        });
        ctx.snapshot('フィルターを外した');
      },
    });
  });

  it.each([
    ['あり', ['filtering']],
    ['なし', []],
  ])('相対日付プリセットと text / dateSet の列フィルター(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      watch: ['onFiltersChange'],
      props: () => ({ rows: makeRows(24), columns, rowKeyGetter: (row: Row) => row.id, height: 360 }),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'applyState', {
            filters: {
              globalText: '',
              columnFilters: {
                day: { kind: 'dateSet', condition: { mode: 'preset', preset: 'last30days' }, set: null },
              },
            },
          });
        });
        ctx.snapshot('過去 30 日');
        await ctx.act(() => {
          call(ctx, 'applyState', {
            filters: {
              globalText: '',
              columnFilters: {
                day: { kind: 'dateSet', condition: { mode: 'preset', preset: 'today' }, set: null },
                name: { kind: 'text', value: '1' },
              },
            },
          });
        });
        ctx.snapshot('今日 + 品名に 1');
      },
    });
  });

  it('グローバルフィルターの対象と出し分けの props(enableGlobalFilter / showTopBarFilter / placeholder / icon / globalFilterMatch)', async () => {
    await expectParity({
      features: ['filtering'],
      props: () => ({
        rows: makeRows(12),
        columns: [
          ...columns,
          { key: 'code', title: 'コード', width: 90, valueFormatter: ({ value }: { value: unknown }) => `C-${String(value)}` },
        ],
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
      }),
      steps: async (ctx) => {
        await typeTop(ctx, 'C-1');
        ctx.snapshot('globalFilterMatch 既定(value)で C-1');
        await ctx.setProps({ globalFilterMatch: 'display' });
        ctx.snapshot("globalFilterMatch 'display' で C-1");
        await ctx.setProps({ globalFilterPlaceholder: '表を検索', globalFilterIcon: null });
        ctx.snapshot('placeholder とアイコン無し');
        await ctx.setProps({ globalFilterPlaceholder: '' });
        ctx.snapshot('placeholder が空(既定の名前)');
        await ctx.setProps({ showTopBarSummary: false });
        ctx.snapshot('要約なし(検索欄だけ)');
        await ctx.setProps({ showTopBarFilter: false });
        ctx.snapshot('要約も検索欄もなし(バーなし)');
        await ctx.setProps({ showTopBarSummary: true, showTopBarFilter: true, enableGlobalFilter: false });
        ctx.snapshot('enableGlobalFilter: false(検索欄なし・絞り込みも効かない)');
        await ctx.setProps({ enableGlobalFilter: true });
        ctx.snapshot('enableGlobalFilter を戻した');
      },
    });
  });

  it.each([
    ['あり', ['filtering']],
    ['なし', []],
  ])('manualFiltering / manualSorting(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      watch: ['onFiltersChange', 'onSortChange'],
      props: () => ({
        rows: makeRows(10),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        manualFiltering: true,
        manualSorting: true,
      }),
      steps: async (ctx) => {
        if (topInput(ctx)) {
          await typeTop(ctx, '品目 3');
        }
        await sortBy(ctx, 'qty');
        await sortBy(ctx, 'qty');
        ctx.snapshot('手動(行は並べ替えも絞り込みもしない)');
        // 利用側が絞り込んだ結果 0 件(フィルターが載っているので「一致する行がありません」)。
        await ctx.setProps({ rows: [] });
        ctx.snapshot('rows が空(条件あり)');
        await ctx.act(() => {
          call(ctx, 'applyState', { filters: { globalText: '', columnFilters: {} } });
        });
        ctx.snapshot('rows が空(条件なし)');
      },
    });
  });
});