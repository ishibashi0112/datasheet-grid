// 機能の組み合わせ(行のグループ化 / ラベル行 / SSRM / 固定行 / 合計行 と、フィルハンドル / 検索 / 選択範囲の集計 / 右クリック /
//   列メニュー)を React 版と Solid 版で比べる(段階 4 の全体レビュー R3 で書いたもの。docs/audits/2026-11-22-solid-quality/)。
import { beforeAll, describe, it } from 'vitest';
import { createEvent, fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import type { ServerSideDataSource } from '@ishibashi0112/spreadsheet-grid-core';
import { expectParity, type ParityContext } from './harness';

type Row = { id: number; kind?: 'label'; city: string; name: string; qty: number | null; price: number | null };

const CITIES = ['東京', '大阪', '名古屋'];
const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    city: CITIES[i % 3] as string,
    name: `品目 ${i + 1}`,
    qty: (i * 7) % 11,
    price: 100 + i,
  }));

const columns = [
  { key: 'id', title: 'ID', width: 60, editable: false },
  { key: 'city', title: '都市', width: 100, filterType: 'set' },
  { key: 'name', title: '品名', width: 120, filterType: 'text' },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' }, aggFunc: 'sum' },
  { key: 'price', title: '単価', width: 90, align: 'right', editor: { type: 'number' } },
];

beforeAll(async () => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
  const reactLite = (await import(/* @vite-ignore */ new URL('../../../react/src/lite.ts', import.meta.url).pathname)) as {
    preloadGridPopups: () => Promise<void>;
  };
  await reactLite.preloadGridPopups();
});

const pointer = { button: 0, pointerId: 1, isPrimary: true };
const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);
const focused = () => document.activeElement ?? document.body;
const send = (
  target: Element | Window,
  type: 'pointerDown' | 'pointerMove' | 'pointerUp',
  init: { clientX: number; clientY: number; ctrlKey?: boolean },
  timeStamp: number,
) => {
  const event = createEvent[type](target, { ...pointer, ...init });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  fireEvent(target, event);
};
const select = (ctx: ParityContext, start: [number, number], end: [number, number]) =>
  ctx.act(() => {
    call(ctx, 'selectRange', { start: { row: start[0], col: start[1] }, end: { row: end[0], col: end[1] } });
  });
// ハンドルを押して (x, y) まで引いて離す(座標は両方で同じ。行 30px・見出し 40px)。
const dragFill = async (ctx: ParityContext, x: number, y: number, timeStamp: number) => {
  const handle = ctx.container.querySelector('.ssg-fill-handle');
  ctx.log('ハンドル', handle !== null);
  if (!handle) {
    return;
  }
  await ctx.act(() => {
    send(handle, 'pointerDown', { clientX: 0, clientY: 0 }, timeStamp);
    send(window, 'pointerMove', { clientX: x, clientY: y }, timeStamp + 50);
  });
  ctx.snapshot(`引いている(${x}, ${y})`);
  await ctx.act(() => {
    send(window, 'pointerUp', { clientX: x, clientY: y }, timeStamp + 100);
  });
};
const values = (ctx: ParityContext) =>
  (ctx.rows() as Row[]).map((row) => (row.kind === 'label' ? `[${row.name}]` : `${row.id}:${row.qty}/${row.price}`)).join(' ');
const bottomBar = (ctx: ParityContext) => ctx.container.querySelector('.ssg-bar--bottom')?.textContent ?? null;
const common = {
  rowHeight: 30,
  headerHeight: 40,
  rowHeaderWidth: 56,
  height: 400,
  animateRows: false,
};

describe('R3 機能の組み合わせ', () => {
  it('行のグループ化 + フィルハンドル + 選択範囲の集計 + 検索', async () => {
    await expectParity({
      features: ['grouping', 'fillHandle', 'selectionAggregates', 'find'],
      watch: ['onFindChange'],
      props: () => ({
        ...common,
        rows: makeRows(9),
        columns: columns.map((c) => (c.key === 'city' ? { ...c, rowGroup: true } : c)),
        rowKeyGetter: (row: Row) => row.id,
        fillHandle: true,
        find: true,
      }),
      steps: async (ctx) => {
        ctx.snapshot('はじめ');
        // グループ行をまたぐ範囲。
        await select(ctx, [0, 3], [5, 3]);
        ctx.log('下部バー', bottomBar(ctx));
        ctx.snapshot('グループ行をまたぐ範囲');
        await select(ctx, [1, 3], [2, 3]);
        await dragFill(ctx, 300, 40 + 6 * 30 + 15, 1000);
        ctx.log('値', values(ctx));
        ctx.snapshot('グループ行をまたいで埋めた');
        await ctx.act(() => {
          call(ctx, 'openFind', '品目 1');
        }, 150);
        ctx.snapshot('検索');
        await ctx.act(() => {
          call(ctx, 'findNext');
        }, 80);
        ctx.snapshot('次へ');
        await ctx.act(() => {
          call(ctx, 'collapseAllGroups');
        }, 150);
        ctx.snapshot('全部閉じた');
        await ctx.act(() => {
          call(ctx, 'findNext');
        }, 80);
        ctx.snapshot('閉じたまま次へ');
      },
    });
  }, 30_000);

  it('ラベル行 + フィルハンドル + 選択範囲の集計 + 検索 + 右クリック', async () => {
    const rows = (): Row[] => {
      const data = makeRows(8);
      return [
        { id: 100, kind: 'label', city: '', name: '前半', qty: null, price: null },
        ...data.slice(0, 4),
        { id: 101, kind: 'label', city: '', name: '後半', qty: null, price: null },
        ...data.slice(4),
      ];
    };
    await expectParity({
      features: ['labelRow', 'fillHandle', 'selectionAggregates', 'find', 'contextMenu'],
      watch: ['onFindChange', 'onContextMenuOpen'],
      props: () => ({
        ...common,
        rows: rows(),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        labelRow: { isLabelRow: (row: Row) => row.kind === 'label', getLabel: (row: Row) => row.name },
        fillHandle: true,
        find: true,
        enableContextMenu: true,
        getContextMenuItems: () => [{ label: 'コピー', onSelect: () => {} }],
      }),
      steps: async (ctx) => {
        await select(ctx, [0, 3], [6, 3]);
        ctx.log('下部バー', bottomBar(ctx));
        ctx.snapshot('ラベル行をまたぐ範囲');
        await select(ctx, [3, 3], [4, 3]);
        await dragFill(ctx, 300, 40 + 7 * 30 + 15, 1000);
        ctx.log('値', values(ctx));
        ctx.snapshot('ラベル行をまたいで埋めた');
        await ctx.act(() => {
          call(ctx, 'openFind', '前半');
        }, 150);
        ctx.snapshot('ラベルの文字を検索');
        await ctx.act(() => {
          call(ctx, 'closeFind');
        });
        // ラベル行の右クリック。
        await ctx.act(() => {
          const label = ctx.container.querySelector('[data-ssg-label-row], .ssg-label-row');
          if (label) {
            ctx.log('ラベル行の右クリックの標準のメニューを止めたか', !fireEvent.contextMenu(label, { button: 2, clientX: 100, clientY: 60 }));
          }
        });
        ctx.snapshot('ラベル行の右クリック');
      },
    });
  }, 30_000);

  it('固定行 + 合計行 + フィルハンドル + 選択範囲の集計 + 検索', async () => {
    await expectParity({
      features: ['pinnedRows', 'totalRow', 'fillHandle', 'selectionAggregates', 'find'],
      watch: ['onFindChange'],
      props: () => ({
        ...common,
        rows: makeRows(6),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        pinnedTopRows: [{ id: 900, city: '上', name: '品目 上', qty: 1, price: 2 }],
        pinnedBottomRows: [{ id: 901, city: '下', name: '品目 下', qty: 3, price: 4 }],
        totalRow: true,
        fillHandle: true,
        find: true,
      }),
      steps: async (ctx) => {
        ctx.snapshot('はじめ');
        await select(ctx, [4, 3], [5, 3]);
        ctx.log('下部バー', bottomBar(ctx));
        // 合計行・下の固定行の上まで引く。
        await dragFill(ctx, 300, 390, 1000);
        ctx.log('値', values(ctx));
        ctx.snapshot('下端より先へ引いた');
        await ctx.act(() => {
          call(ctx, 'openFind', '品目');
        }, 150);
        ctx.snapshot('検索(固定行は数えない)');
        await ctx.setProps({ pinnedTopRows: [], totalRow: false });
        ctx.snapshot('固定行と合計行を外した');
      },
    });
  }, 30_000);

  it('SSRM + 選択範囲の集計 + 検索 + フィルハンドル + 列メニュー', async () => {
    const all = makeRows(60);
    const updates: unknown[] = [];
    const dataSource = (): ServerSideDataSource<Row> => ({
      blockSize: 20,
      initialRowCount: all.length,
      getRows: async (params) => ({ rows: all.slice(params.startIndex, params.endIndex), totalRowCount: all.length }),
      updateRows: async (params) => {
        updates.push(params.updates.map((update) => ({ rowKey: update.rowKey, changes: update.changes })));
      },
    });
    await expectParity({
      features: ['serverSide', 'selectionAggregates', 'find', 'fillHandle', 'columnMenu', 'filtering'],
      watch: ['onFindChange'],
      controlledRows: false,
      props: () => ({
        ...common,
        columns,
        rowKeyGetter: (row: Row) => row.id,
        dataSource: dataSource(),
        fillHandle: true,
        find: true,
        showSaveStatus: false,
        // 読み込んだ行のフェードインの印(jsdom では 1.5 秒の後に外れる)が、比べる時点しだいで片方だけに残るので止める
        //   (2026-11-22、重いときに 1 回落ちた)。
        motion: 'off',
      }),
      steps: async (ctx) => {
        updates.length = 0;
        await ctx.act(() => {}, 250);
        ctx.snapshot('読み込んだ');
        await select(ctx, [0, 3], [40, 3]);
        await ctx.act(() => {}, 100);
        ctx.log('下部バー(読んでいない行を含む)', bottomBar(ctx));
        await select(ctx, [0, 3], [1, 3]);
        await dragFill(ctx, 300, 40 + 4 * 30 + 15, 1000);
        await ctx.act(() => {}, 100);
        ctx.log('updateRows', JSON.stringify(updates));
        ctx.snapshot('埋めた');
        await ctx.act(() => {
          call(ctx, 'openFind', '品目 5');
        }, 200);
        ctx.snapshot('検索');
        await ctx.act(() => {
          const button = ctx.header('city').querySelector<HTMLButtonElement>('.ssg-icon-btn');
          if (button) {
            fireEvent.pointerDown(button, { ...pointer, pointerType: 'mouse' });
            fireEvent.pointerUp(button, { ...pointer, pointerType: 'mouse' });
            fireEvent.click(button, { detail: 1 });
          }
        });
        ctx.snapshot('SSRM の列メニュー');
        await ctx.act(() => {
          const item = Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((el) =>
            el.textContent?.includes('フィルター…'),
          );
          if (item) {
            fireEvent.click(item, { detail: 1 });
          }
        }, 100);
        ctx.snapshot('SSRM の set フィルター');
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'Escape' });
        });
      },
    });
  }, 30_000);
});