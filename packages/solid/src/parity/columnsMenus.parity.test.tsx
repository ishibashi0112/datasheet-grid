// 列・見出し・メニューの所見(Solid 版の品質の段 2-4。docs/audits/2026-11-22-solid-quality/)を React 版と Solid 版で比べる。
//   React 版の結合テストは packages/react/src/SpreadsheetGrid.columnsMenus.integration.test.tsx(2 つの表のメニュー S6-21 は
//   そちらと core の popoverSupport.test.ts、実ブラウザは audit/harness/t-v130.mjs の 'two')。
//   R3-2: フィルターのポップオーバーを開いたまま別の列へ移ると(ツールパネルの ✎)、set の候補の検索の文字が前の列のまま残っていた。
//   S12-01: 列メニューの固定などで列を変えると、アクティブセルと選択が消えていた(今はその列に付いていく)。
//   S12-05: 左に固定した列があると、横にスクロールした後の Ctrl+Home / Home で左端へ戻らなかった。
//   RV5-4: renderHeader の中のボタンの上にポインタがある間は、見出しのセルに data-ssg-header-control-hover が付く。
import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type ParityContext } from './harness';

type Row = { id: number; name: string; qty: number; city: string; area: string };

const CITIES = ['東京', '大阪', '名古屋', '福岡'];
const AREAS = ['東', '西'];
const columns = [
  { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 120 },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' } },
  { key: 'city', title: '都市', width: 300, filterType: 'set' },
  { key: 'area', title: '地域', width: 300, filterType: 'set' },
];
const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `品目 ${i + 1}`,
    qty: i * 10,
    city: CITIES[i % 4] as string,
    area: AREAS[i % 2] as string,
  }));

beforeAll(async () => {
  installJsdomLayoutStubs({ width: 600, height: 400 });
  // React 版の後から読み込むポップアップ(ツールパネル / 列フィルター)を先に読む(Solid 版は vitest.setup.ts で読む)。
  const reactLite = (await import(/* @vite-ignore */ new URL('../../../react/src/lite.ts', import.meta.url).pathname)) as {
    preloadGridPopups: () => Promise<void>;
  };
  await reactLite.preloadGridPopups();
});

const pointer = { button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse' };
const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const byLabel = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const searchInput = () => byLabel('検索（Enter で確定）') as HTMLInputElement | null;
const menuItem = (label: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')).find((el) =>
    el.textContent?.includes(label),
  );
const click = async (ctx: ParityContext, find: () => HTMLElement | null | undefined, what: string) => {
  await ctx.act(async () => {
    const element = find();
    if (!element) {
      const labels = Array.from(document.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label'));
      throw new Error(`[${ctx.framework}] ${what}がありません: ${labels.join(' / ')}`);
    }
    fireEvent.click(element, { detail: 1 });
    await nextFrame();
  });
};
const logPosition = (ctx: ParityContext, label: string) => {
  ctx.log(label, { active: call(ctx, 'getActiveCell'), selection: call(ctx, 'getSelection') });
};

describe('R3-2 開いたまま別の列のフィルターへ移る', () => {
  it('ツールパネルの ✎ で別の set の列へ移ると、検索の文字は空から始まる', async () => {
    await expectParity({
      features: ['filtering', 'columnMenu', 'toolPanel'],
      props: () => ({ rows: makeRows(8), columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'applyState', {
            filters: {
              columnFilters: {
                city: { kind: 'set', mode: 'include', values: ['東京'] },
                area: { kind: 'set', mode: 'include', values: ['東'] },
              },
            },
          });
        });
        await ctx.act(() => {
          call(ctx, 'openFilterManager');
        });
        await click(ctx, () => byLabel('都市 のフィルターを編集'), '都市の ✎ ');
        await ctx.act(() => {
          const input = searchInput();
          if (!input) {
            throw new Error(`[${ctx.framework}] 検索の入力欄がありません`);
          }
          fireEvent.input(input, { target: { value: 'zz' } });
        });
        ctx.log('都市: 検索の文字', searchInput()?.value ?? null);
        await click(ctx, () => byLabel('地域 のフィルターを編集'), '地域の ✎ ');
        ctx.log('地域: 検索の文字', searchInput()?.value ?? null);
        expect(searchInput()?.value).toBe('');
        ctx.snapshot('地域へ移った');
      },
    });
  });
});

describe('S12-01 列を変えた後のアクティブセル', () => {
  it('列メニューで左に固定すると、アクティブセルと選択はその列に付いていき、次の矢印キーはその列から', async () => {
    await expectParity({
      features: ['columnMenu'],
      props: () => ({ rows: makeRows(6), columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'setActiveCell', { row: 1, col: 2 });
        });
        await ctx.act(async () => {
          fireEvent.keyDown(ctx.shell(), { key: 'ArrowDown', altKey: true });
          await nextFrame();
        });
        await click(ctx, () => menuItem('列の固定'), '「列の固定」');
        await click(ctx, () => menuItem('左に固定'), '「左に固定」');
        logPosition(ctx, '左に固定した後');
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'ArrowRight' });
        });
        logPosition(ctx, '→ の後');
        ctx.snapshot('左に固定して → ');
      },
    });
  });
});

describe('S12-05 左に固定した列があるときの Ctrl+Home / Home', () => {
  it('横にスクロールした後の Ctrl+Home と Home で左端へ戻る', async () => {
    await expectParity({
      props: () => ({ rows: makeRows(6), columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      steps: async (ctx) => {
        const scroller = () => ctx.container.querySelector<HTMLElement>('.ssg-scroll-container');
        await ctx.act(() => {
          call(ctx, 'selectCell', 3, 4);
        });
        for (const init of [
          { key: 'Home', ctrlKey: true },
          { key: 'Home' },
        ]) {
          await ctx.act(() => {
            call(ctx, 'selectCell', 3, 4);
            const element = scroller();
            if (element) {
              element.scrollLeft = 300;
            }
          });
          await ctx.act(() => {
            fireEvent.keyDown(ctx.shell(), init);
          });
          ctx.log(`${init.ctrlKey ? 'Ctrl+' : ''}Home`, { scrollLeft: scroller()?.scrollLeft ?? null, active: call(ctx, 'getActiveCell') });
          expect(scroller()?.scrollLeft).toBe(0);
        }
      },
    });
  });
});

describe('RV5-4 renderHeader の中のボタンの上のポインタ', () => {
  it('ボタンの上でだけ見出しのセルに印が付き、外れたら外れる', async () => {
    await expectParity({
      features: ['columnMenu'],
      props: () => ({
        rows: makeRows(4),
        // renderHeader の中身は React と Solid で書き方が違うので空にし、同じボタンを後から直接入れて比べる。
        columns: columns.map((column) => (column.key === 'qty' ? { ...column, width: 46, renderHeader: () => null } : column)),
        rowKeyGetter: (row: Row) => row.id,
        height: 300,
      }),
      steps: async (ctx) => {
        const header = ctx.header('qty');
        const label = header.querySelector<HTMLElement>('.ssg-header-label');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'B';
        button.getBoundingClientRect = () =>
          ({ left: 10, top: 0, right: 30, bottom: 20, width: 20, height: 20, x: 10, y: 0, toJSON: () => ({}) }) as DOMRect;
        label?.replaceChildren(button);
        const mark = () => header.hasAttribute('data-ssg-header-control-hover');
        await ctx.act(() => {
          fireEvent.pointerMove(header, { ...pointer, clientX: 15, clientY: 10 });
        });
        ctx.log('ボタンの上', mark());
        await ctx.act(() => {
          fireEvent.pointerMove(header, { ...pointer, clientX: 40, clientY: 10 });
        });
        ctx.log('ボタンの外', mark());
        await ctx.act(() => {
          fireEvent.pointerMove(header, { ...pointer, clientX: 15, clientY: 10 });
          // React の onPointerLeave は pointerout から作られ、Solid は pointerleave を直接聞く。
          fireEvent.pointerOut(header, { ...pointer, relatedTarget: document.body });
          fireEvent.pointerLeave(header, { ...pointer, relatedTarget: document.body });
        });
        ctx.log('見出しから出た', mark());
      },
    });
  });
});