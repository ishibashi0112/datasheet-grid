// React 版(`/lite` に同じ機能を差し込んだもの)と Solid 版の行のグループ化 / ラベル行 / サーバーサイドの行モデルを同じ操作で
//   動かして、DOM と通知と命令的 API の結果が同じかを見る(段階 2-4)。
import { beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type ParityContext } from './harness';

beforeAll(async () => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
  // React 版はツールパネルと列フィルターの部品を遅れて読み込むので、先に読んでおく(開いた直後に同じ DOM を比べるため)。
  const reactLite = (await import(/* @vite-ignore */ new URL('../../../react/src/lite.ts', import.meta.url).pathname)) as {
    preloadGridPopups: () => Promise<void>;
  };
  await reactLite.preloadGridPopups();
});

const pointer = { button: 0, pointerId: 1, isPrimary: true };

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);

const focused = () => document.activeElement ?? document.body;

const key = async (ctx: ParityContext, init: KeyboardEventInit & { key: string }) => {
  await ctx.act(() => {
    fireEvent.keyDown(focused(), init);
  });
};

const press = async (ctx: ParityContext, target: Element) => {
  await ctx.act(() => {
    fireEvent.pointerDown(target, pointer);
    fireEvent.pointerUp(window, pointer);
    fireEvent.click(target, { detail: 1 });
  });
};

describe('行のグループ化(grouping)', () => {
  type Row = { id: number; region: string | null; category: string; name: string; qty: number; price: number; note: string };
  const REGIONS = ['関東', '関西', null, '九州'];
  const CATEGORIES = ['果物', '野菜'];
  const makeRows = (count: number): Row[] =>
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      region: REGIONS[i % REGIONS.length] as string | null,
      category: CATEGORIES[Math.floor(i / 4) % CATEGORIES.length] as string,
      name: `品目 ${i + 1}`,
      qty: (i * 7) % 50,
      price: 100 + (i % 5) * 1234.5,
      note: i % 3 === 0 ? `メモ ${i}` : '',
    }));
  const groupedColumns = [
    { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
    { key: 'region', title: '地域', width: 100, rowGroup: true, filterType: 'set' },
    { key: 'category', title: '分類', width: 100, rowGroup: true },
    { key: 'name', title: '品名', width: 120, filterType: 'text' },
    { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' }, aggFunc: 'sum', filterType: 'number' },
    { key: 'price', title: '単価', width: 60, align: 'right', aggFunc: 'avg' },
    { key: 'note', title: 'メモ', width: 160, pinned: 'right', aggFunc: 'count' },
  ];
  // グループ行の開閉のボタン(自動グループ列のセルの中)。
  const toggleOf = (ctx: ParityContext, row: number) => {
    const button = ctx.cell(row, '__ssg_group__').querySelector<HTMLButtonElement>('.ssg-group-toggle');
    if (!button) {
      throw new Error(`[${ctx.framework}] 開閉のボタンがありません: ${row}`);
    }
    return button;
  };

  it.each([
    ['あり', ['grouping']],
    ['なし(rowGroup の列もそのまま)', []],
  ])('グループ行の表示・開閉(ボタン / ダブルクリック / Enter・Space)・集計・ホバー・命令的 API(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      watch: ['onStateChange'],
      props: () => ({ rows: makeRows(16), columns: groupedColumns, rowKeyGetter: (row: Row) => row.id, height: 360 }),
      steps: async (ctx) => {
        ctx.snapshot('最初');
        ctx.log('getGroupRows', call(ctx, 'getGroupRows'));
        if (features.length === 0) {
          return;
        }
        ctx.track('最初のグループ行の自動グループ列のセル', () => ctx.container.querySelector('[data-ssg-group-row] [data-ssg-col-key="__ssg_group__"]'));
        // 開閉のボタンで閉じる(2 段目のグループごと隠れる)。
        await press(ctx, toggleOf(ctx, 0));
        ctx.snapshot('ボタンで最初のグループを閉じた');
        // 行のダブルクリックで開く。
        await ctx.act(() => {
          fireEvent.dblClick(ctx.cell(0, 'qty'));
        });
        ctx.snapshot('ダブルクリックで開いた');
        // グループ行のセルを押すとアクティブセル。Enter / Space で開閉。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(1, 'name'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await key(ctx, { key: 'Enter' });
        ctx.snapshot('2 段目のグループで Enter');
        await key(ctx, { key: ' ' });
        ctx.snapshot('もう一度 Space');
        // ホバー(行番号の欄 / セル)。
        await ctx.act(() => {
          ctx.hover(ctx.cell(0, 'name'));
        });
        ctx.snapshot('グループ行にホバー');
        // 命令的 API。
        await ctx.act(() => {
          call(ctx, 'collapseAllGroups');
        });
        ctx.snapshot('すべて閉じた');
        ctx.log('getGroupRows(すべて閉じた)', call(ctx, 'getGroupRows'));
        await ctx.act(() => {
          call(ctx, 'expandAllGroups');
        });
        const groups = call(ctx, 'getGroupRows') as { groupKey: string }[];
        await ctx.act(() => {
          call(ctx, 'setGroupCollapsed', groups[2]?.groupKey, true);
        });
        ctx.snapshot('3 つ目のグループだけ閉じた');
        ctx.log('getState', call(ctx, 'getState'));
        // 上へ行を足す・値を変えると集計が変わる(行は同じ要素のまま)。
        await ctx.setProps({ rows: [{ id: 99, region: '関東', category: '果物', name: '新', qty: 1000, price: 1, note: 'x' }, ...makeRows(16)] });
        ctx.snapshot('行を足した');
      },
    });
  });

  it('行の選択のチェックボックスの表・空のグループ・aggFunc の関数と書式・文言(localeText)', async () => {
    await expectParity({
      features: ['grouping'],
      props: () => ({
        rows: makeRows(10),
        columns: groupedColumns.map((column) =>
          column.key === 'qty'
            ? { ...column, aggFunc: (values: unknown[]) => values.length * 2, valueFormatter: ({ value }: { value: unknown }) => `${String(value)} 個` }
            : column,
        ),
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        enableRowSelection: true,
        // 行が現れたときのフェードイン(animateRows)の印は、React 版は行の className が変わると描き直しで外れ、Solid 版は
        //   animationend まで残る(どちらも見た目は同じ。jsdom には animationend が無いので、ここでは比べない)。
        animateRows: false,
        localeText: { blank: '(なし)', groupRowCount: '{count} 行', expandGroup: '開く {group}', collapseGroup: '閉じる {group}' },
      }),
      steps: async (ctx) => {
        ctx.snapshot('最初');
        // 見出しの全選択はデータ行だけを数える。
        await ctx.act(() => {
          const corner = ctx.container.querySelector<HTMLElement>('.ssg-corner-cell');
          if (!corner) {
            throw new Error(`[${ctx.framework}] 角がありません`);
          }
          fireEvent.pointerDown(corner, pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.log('getSelectedRowCount', call(ctx, 'getSelectedRowCount'));
        ctx.snapshot('全選択');
      },
    });
  });

  it('グループ化中のソート・フィルター・ツールパネル・列メニュー(グループ化 / 外す)・includeGroupingInState', async () => {
    const latestColumns: Record<string, unknown[]> = {};
    await expectParity({
      features: ['grouping', 'filtering', 'columnMenu', 'toolPanel'],
      watch: ['onColumnsChange', 'onStateChange', 'onFiltersChange'],
      props: (framework) => ({
        rows: makeRows(16),
        columns: groupedColumns.map((column) => (column.key === 'category' ? { ...column, rowGroup: false } : column)),
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        includeGroupingInState: true,
        onColumnsChange: (next: unknown[]) => {
          latestColumns[framework] = next;
        },
      }),
      steps: async (ctx) => {
        ctx.snapshot('最初(地域でグループ化)');
        // 見出しの Shift + 押すで数量の並び(グループは集計の順)。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.header('qty'), { ...pointer, shiftKey: true });
          fireEvent.pointerUp(window, { ...pointer, shiftKey: true });
        });
        ctx.snapshot('数量で並べた');
        // 上部バーの検索でグループ元の列の値に当たる。
        await ctx.act(() => {
          const input = ctx.container.querySelector<HTMLInputElement>('.ssg-bar-input');
          fireEvent.input(input as HTMLInputElement, { target: { value: '関西' } });
        });
        ctx.snapshot('関西で検索');
        await ctx.act(() => {
          const input = ctx.container.querySelector<HTMLInputElement>('.ssg-bar-input');
          fireEvent.input(input as HTMLInputElement, { target: { value: '' } });
        });
        // ツールパネルの列のタブ(グループ元の列は印)と並び替えのタブ(グループ元の列を選べる)。
        const tab = (label: string) =>
          Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-toolpanel [role="tab"]')).find((el) =>
            el.textContent?.startsWith(label),
          );
        await ctx.act(() => {
          call(ctx, 'openFilterManager');
        });
        await ctx.act(() => {
          fireEvent.click(tab('列') as HTMLElement, { detail: 1 });
        });
        ctx.snapshot('列のタブ');
        await ctx.act(() => {
          fireEvent.click(tab('並び替え') as HTMLElement, { detail: 1 });
        });
        ctx.snapshot('並び替えのタブ');
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'Escape' });
        });
        // 列メニューの「この列でグループ化」(onColumnsChange で受けた列へ差し替える)。
        const openMenu = async (columnKey: string) => {
          await ctx.act(() => {
            const button = ctx.header(columnKey).querySelector<HTMLButtonElement>('.ssg-icon-btn');
            if (!button) {
              throw new Error(`[${ctx.framework}] ⋮ がありません: ${columnKey}`);
            }
            fireEvent.pointerDown(button, { ...pointer, pointerType: 'mouse' });
            fireEvent.pointerUp(button, { ...pointer, pointerType: 'mouse' });
            fireEvent.click(button, { detail: 1 });
          });
        };
        const clickItem = async (label: string) => {
          await ctx.act(() => {
            const item = Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((el) =>
              el.textContent?.includes(label),
            );
            if (!item) {
              throw new Error(`[${ctx.framework}] 項目がありません: ${label}`);
            }
            fireEvent.click(item, { detail: 1 });
          });
        };
        await openMenu('category');
        ctx.snapshot('分類の列メニュー');
        await clickItem('この列でグループ化');
        await ctx.setProps({ columns: latestColumns[ctx.framework] });
        ctx.snapshot('分類でもグループ化した');
        ctx.log('getState', call(ctx, 'getState'));
        await openMenu('name');
        await clickItem('グループ化を外す');
        await ctx.setProps({ columns: latestColumns[ctx.framework] });
        ctx.snapshot('グループ化を外した');
      },
    });
  });
});