// 行ドラッグ / 列の並べ替えと、ほかの機能(ラベル行 / 展開行 / 固定行 / 合計行 / グループ化 / フィルター)の組み合わせを
//   React 版と Solid 版で比べる(段階 4 の全体レビュー R3 で書いたもの。docs/audits/2026-11-22-solid-quality/)。
import { beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type ParityContext } from './harness';

type Row = { id: number; kind?: 'label'; city: string; name: string; qty: number };

const CITIES = ['東京', '大阪', '名古屋'];
const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, city: CITIES[i % 3] as string, name: `品目 ${i + 1}`, qty: (i * 7) % 11 }));

const columns = [
  { key: 'id', title: 'ID', width: 60, editable: false },
  { key: 'city', title: '都市', width: 100, filterType: 'set' },
  { key: 'name', title: '品名', width: 120, filterType: 'text' },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' }, aggFunc: 'sum' },
];

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

const pointer = { button: 0, pointerId: 1, isPrimary: true };
const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);
// 見出し 40px・行 30px。
const rowY = (k: number) => 40 + 30 * k + 15;
const rowTopY = (k: number) => 40 + 30 * k + 3;
const handleOf = (ctx: ParityContext, row: number) =>
  ctx.container.querySelector(
    `.ssg-body-row[data-row-index="${row}"] [data-ssg-col-key="__ssg_row_drag_handle__"] .ssg-row-drag-handle`,
  );
const ids = (ctx: ParityContext) =>
  (ctx.rows() as Row[]).map((row) => (row.kind === 'label' ? `[${row.name}]` : String(row.id))).join(' ');
const drag = async (ctx: ParityContext, from: number, to: number, label: string) => {
  const handle = handleOf(ctx, from);
  ctx.log(`${label}: ハンドル`, handle !== null);
  if (!handle) {
    return;
  }
  await ctx.act(() => {
    fireEvent.pointerDown(handle, { ...pointer, clientX: 20, clientY: rowY(from) });
    fireEvent.pointerMove(window, { ...pointer, clientX: 20, clientY: rowY(from + 1) });
    fireEvent.pointerMove(window, { ...pointer, clientX: 20, clientY: rowTopY(to) });
  });
  ctx.snapshot(`${label}: 引いている`);
  await ctx.act(() => {
    fireEvent.pointerUp(window, { ...pointer, clientX: 20, clientY: rowTopY(to) });
  }, 450);
  ctx.log(`${label}: 並び`, ids(ctx));
  ctx.snapshot(`${label}: 落とした`);
};
const common = { rowHeight: 30, headerHeight: 40, rowHeaderWidth: 56, height: 400 };

describe('R3 行ドラッグの組み合わせ', () => {
  it.each([['ghost'], ['live']])('ラベル行をまたいで動かす(%s)', async (rowDragMotion) => {
    const rows = (): Row[] => {
      const data = makeRows(6);
      return [
        { id: 100, kind: 'label', city: '', name: '前半', qty: 0 },
        ...data.slice(0, 3),
        { id: 101, kind: 'label', city: '', name: '後半', qty: 0 },
        ...data.slice(3),
      ];
    };
    await expectParity({
      features: ['rowDrag', 'labelRow'],
      watch: ['onRowMove'],
      props: () => ({
        ...common,
        rows: rows(),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        enableRowDrag: true,
        rowDragMotion,
        labelRow: { isLabelRow: (row: Row) => row.kind === 'label', getLabel: (row: Row) => row.name },
      }),
      steps: async (ctx) => {
        ctx.snapshot('はじめ');
        await drag(ctx, 1, 6, '前半の先頭を後半へ');
        await drag(ctx, 6, 0, '後半から先頭のラベルの上へ');
      },
    });
  }, 20_000);

  it.each([['ghost'], ['live']])('展開行を開いたまま動かす(%s)', async (rowDragMotion) => {
    await expectParity({
      watch: ['onRowMove'],
      features: ['rowDrag'],
      props: (framework) => ({
        ...common,
        rows: makeRows(6),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        enableRowDrag: true,
        rowDragMotion,
        detailRow: {
          height: 60,
          render: (ctx: { row: Row }) =>
            framework === 'react' ? `詳細 ${ctx.row.id}` : `詳細 ${ctx.row.id}`,
        },
      }),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'setDetailRowExpanded', 2, true);
        }, 100);
        ctx.snapshot('2 を開いた');
        await drag(ctx, 1, 4, '開いた行を下へ');
        await drag(ctx, 4, 0, '下の行を先頭へ');
      },
    });
  }, 20_000);

  it('固定行 + 合計行 + フィルター中 / グループ化中のハンドル', async () => {
    await expectParity({
      features: ['rowDrag', 'pinnedRows', 'totalRow', 'filtering', 'grouping'],
      watch: ['onRowMove'],
      props: () => ({
        ...common,
        rows: makeRows(6),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        enableRowDrag: true,
        totalRow: true,
        pinnedTopRows: [{ id: 900, city: '上', name: '上', qty: 1 }],
        pinnedBottomRows: [{ id: 901, city: '下', name: '下', qty: 2 }],
      }),
      steps: async (ctx) => {
        ctx.snapshot('はじめ');
        await drag(ctx, 1, 5, '固定行のある表で下へ');
        await ctx.act(() => {
          call(ctx, 'applyState', { filters: { globalText: '品目', columnFilters: {} } });
        });
        ctx.snapshot('フィルター中');
        await drag(ctx, 1, 3, 'フィルター中');
        await ctx.act(() => {
          call(ctx, 'applyState', { filters: { globalText: '', columnFilters: {} } });
        });
        await ctx.setProps({ columns: columns.map((c) => (c.key === 'city' ? { ...c, rowGroup: true } : c)) });
        ctx.snapshot('グループ化中');
        await drag(ctx, 1, 3, 'グループ化中');
      },
    });
  }, 20_000);
});

describe('R3 列の並べ替えの組み合わせ', () => {
  const gripOf = (ctx: ParityContext, key: string) => ctx.header(key).querySelector('.ssg-header-grip');
  it.each([['ghost'], ['live']])('グループ化 + 行ドラッグの合成列がある表で列を動かす(%s)', async (columnDragMotion) => {
    let latest: unknown = null;
    await expectParity({
      features: ['columnReorder', 'grouping', 'rowDrag'],
      props: () => ({
        ...common,
        rows: makeRows(6),
        columns: columns.map((c) => (c.key === 'city' ? { ...c, rowGroup: true } : c)),
        rowKeyGetter: (row: Row) => row.id,
        enableRowDrag: true,
        columnDragMotion,
        onColumnsChange: (next: { key: string }[]) => {
          latest = next.map((c) => c.key);
        },
      }),
      steps: async (ctx) => {
        latest = null;
        ctx.snapshot('はじめ');
        const grip = gripOf(ctx, 'qty');
        ctx.log('grip', grip !== null);
        if (!grip) {
          return;
        }
        await ctx.act(() => {
          fireEvent.pointerDown(grip, { ...pointer, clientX: 300, clientY: 20 });
          fireEvent.pointerMove(window, { ...pointer, clientX: 280, clientY: 20 });
          fireEvent.pointerMove(window, { ...pointer, clientX: 60, clientY: 20 });
        });
        ctx.snapshot('引いている');
        await ctx.act(() => {
          fireEvent.pointerUp(window, { ...pointer, clientX: 60, clientY: 20 });
        }, 450);
        ctx.log('onColumnsChange', latest);
        ctx.snapshot('落とした');
      },
    });
  }, 20_000);
});