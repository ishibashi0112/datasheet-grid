// ポップアップを開いたまま列・props・行・テーマ・置き場所を変えたときを React 版と Solid 版で比べる(段階 4 の全体レビュー R3 で
//   書いたもの。R3-1 = 列メニューの小メニューを開いたまま別の列へ切り替えて戻る。docs/audits/2026-11-22-solid-quality/)。
import { beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type ParityContext } from './harness';

type Row = { id: number; name: string; qty: number; city: string };

const columns = [
  { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 120, filterType: 'text' },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' }, filterType: 'number' },
  { key: 'city', title: '都市', width: 100, filterType: 'set' },
];
const CITIES = ['東京', '大阪', '名古屋', '福岡'];
const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}`, qty: i * 10, city: CITIES[i % 4] as string }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

const pointer = { button: 0, pointerId: 1, isPrimary: true };
const menuItem = (label: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((el) => el.textContent?.includes(label));
const menuButton = (ctx: ParityContext, key: string) => ctx.header(key).querySelector<HTMLButtonElement>('.ssg-icon-btn');
const submenuCount = () => document.querySelectorAll('.ssg-menu-submenu-anchor [role="menu"]').length;
const clickItem = async (ctx: ParityContext, label: string) => {
  await ctx.act(() => {
    const item = menuItem(label);
    if (!item) {
      throw new Error(`[${ctx.framework}] 項目がありません: ${label}`);
    }
    fireEvent.click(item, { detail: 1 });
  });
};
const openByButton = async (ctx: ParityContext, key: string) => {
  await ctx.act(() => {
    const button = menuButton(ctx, key);
    if (!button) {
      throw new Error(`[${ctx.framework}] ⋮ がありません: ${key}`);
    }
    fireEvent.pointerDown(button, { ...pointer, pointerType: 'mouse' });
    fireEvent.pointerUp(button, { ...pointer, pointerType: 'mouse' });
    fireEvent.click(button, { detail: 1 });
  });
};

describe('R3-1 列メニューの列の固定の小メニュー', () => {
  it('開いたまま別の列へ切り替えて元の列へ戻る', async () => {
    await expectParity({
      features: ['columnMenu'],
      props: () => ({ rows: makeRows(6), columns, rowKeyGetter: (row: Row) => row.id, height: 300, onColumnsChange: () => {} }),
      steps: async (ctx) => {
        await openByButton(ctx, 'qty');
        await clickItem(ctx, '列の固定');
        ctx.log('qty: 小メニュー', submenuCount());
        await openByButton(ctx, 'name');
        ctx.log('name: 小メニュー', submenuCount());
        ctx.snapshot('name へ切り替えた');
        await openByButton(ctx, 'qty');
        ctx.log('qty へ戻った: 小メニュー', submenuCount());
        ctx.snapshot('qty へ戻った');
      },
    });
  });

  it('右クリックで開いた列で小メニューを開き、同じ列を右クリックし直す', async () => {
    await expectParity({
      features: ['columnMenu'],
      props: () => ({ rows: makeRows(6), columns, rowKeyGetter: (row: Row) => row.id, height: 300, onColumnsChange: () => {} }),
      steps: async (ctx) => {
        await ctx.act(() => {
          fireEvent.contextMenu(ctx.header('city'), { clientX: 300, clientY: 40 });
        });
        await clickItem(ctx, '列の固定');
        ctx.log('小メニュー', submenuCount());
        ctx.snapshot('小メニューを開いた');
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.header('city'), { ...pointer, button: 2 });
          fireEvent.contextMenu(ctx.header('city'), { clientX: 320, clientY: 40 });
        });
        ctx.log('右クリックし直した: 小メニュー', submenuCount());
        ctx.snapshot('同じ列を右クリックし直した');
      },
    });
  });
});

// ---- 開いたまま prop を変える ----
const focused = () => document.activeElement ?? document.body;
const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);
const baseProps = () => ({
  rows: makeRows(10),
  columns,
  rowKeyGetter: (row: Row) => row.id,
  height: 320,
  animateRows: false,
  onColumnsChange: () => {},
});
const openFilterFromMenu = async (ctx: ParityContext, key: string) => {
  await openByButton(ctx, key);
  await clickItem(ctx, 'フィルター…');
  await ctx.act(() => {}, 60);
};

describe('R3 開いたまま prop を変える', () => {
  beforeAll(async () => {
    const reactLite = (await import(/* @vite-ignore */ new URL('../../../react/src/lite.ts', import.meta.url).pathname)) as {
      preloadGridPopups: () => Promise<void>;
    };
    await reactLite.preloadGridPopups();
  });

  it('列メニュー: enableColumnMenu: false / 列を消す / enableSorting: false', async () => {
    await expectParity({
      features: ['columnMenu', 'filtering'],
      props: baseProps,
      steps: async (ctx) => {
        await openByButton(ctx, 'qty');
        ctx.snapshot('開いた');
        await ctx.setProps({ enableSorting: false });
        ctx.snapshot('enableSorting: false');
        await ctx.setProps({ enableColumnFilter: false });
        ctx.snapshot('enableColumnFilter: false');
        await ctx.setProps({ enableColumnMenu: false });
        ctx.snapshot('enableColumnMenu: false');
        ctx.log('フォーカス', focused().className);
        await ctx.setProps({ enableColumnMenu: true, enableSorting: true, enableColumnFilter: true });
        await openByButton(ctx, 'city');
        await ctx.setProps({ columns: columns.filter((c) => c.key !== 'city') });
        ctx.snapshot('開いている列を消した');
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'Escape' });
        });
        ctx.snapshot('Escape');
      },
    });
  }, 20_000);

  it('列フィルター: enableColumnFilter: false / 列を消す / filterType を外す', async () => {
    await expectParity({
      features: ['columnMenu', 'filtering'],
      watch: ['onFiltersChange'],
      props: baseProps,
      steps: async (ctx) => {
        await openFilterFromMenu(ctx, 'name');
        ctx.snapshot('開いた');
        await ctx.setProps({ enableColumnFilter: false });
        ctx.snapshot('enableColumnFilter: false');
        await ctx.setProps({ enableColumnFilter: true });
        ctx.snapshot('enableColumnFilter: true に戻した');
        await openFilterFromMenu(ctx, 'city');
        ctx.snapshot('都市を開いた');
        await ctx.setProps({ columns: columns.filter((c) => c.key !== 'city') });
        ctx.snapshot('開いている列を消した');
        await ctx.setProps({ columns });
        await openFilterFromMenu(ctx, 'qty');
        await ctx.setProps({ columns: columns.map((c) => (c.key === 'qty' ? { ...c, filterType: undefined } : c)) });
        ctx.snapshot('filterType を外した');
        await ctx.setProps({ columns: columns.map((c) => (c.key === 'qty' ? { ...c, filterType: 'text' } : c)) });
        ctx.snapshot('filterType を text にした');
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'Escape' });
        });
        ctx.snapshot('Escape');
      },
    });
  }, 20_000);

  it('ツールパネル: enableColumnFilter / enableSorting / enableColumnMenu を開いたまま切り替える', async () => {
    await expectParity({
      features: ['columnMenu', 'filtering', 'toolPanel'],
      props: baseProps,
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'openFilterManager');
        });
        ctx.snapshot('フィルターのタブ');
        await ctx.setProps({ enableColumnFilter: false });
        ctx.snapshot('enableColumnFilter: false');
        await ctx.setProps({ enableColumnFilter: true });
        ctx.snapshot('enableColumnFilter: true');
        await ctx.setProps({ enableGlobalFilter: false });
        ctx.snapshot('enableGlobalFilter: false');
        await ctx.setProps({ enableGlobalFilter: true, enableSorting: false });
        ctx.snapshot('enableSorting: false');
        await ctx.setProps({ enableColumnMenu: false });
        ctx.snapshot('enableColumnMenu: false');
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'Escape' });
        });
        ctx.snapshot('Escape');
      },
    });
  }, 20_000);

  it('右クリックメニュー: 開いたまま enableContextMenu: false / rows を空に', async () => {
    const items = () => [
      { label: 'コピー', onSelect: () => {} },
      { label: '消す', onSelect: () => {} },
    ];
    await expectParity({
      features: ['contextMenu'],
      props: () => ({ ...baseProps(), enableContextMenu: true, getContextMenuItems: items }),
      steps: async (ctx) => {
        await ctx.act(() => {
          fireEvent.contextMenu(ctx.cell(2, 'qty'), { button: 2, clientX: 210, clientY: 130 });
        });
        ctx.snapshot('開いた');
        await ctx.setProps({ enableContextMenu: false });
        ctx.snapshot('enableContextMenu: false');
        await ctx.setProps({ enableContextMenu: true });
        await ctx.act(() => {
          fireEvent.contextMenu(ctx.cell(3, 'qty'), { button: 2, clientX: 210, clientY: 150 });
        });
        await ctx.setProps({ rows: [] });
        ctx.snapshot('rows を空に');
      },
    });
  }, 20_000);

  it('テーマを開いたまま変える(列メニュー・ツールパネル)', async () => {
    await expectParity({
      features: ['columnMenu', 'filtering', 'toolPanel'],
      props: baseProps,
      steps: async (ctx) => {
        await openByButton(ctx, 'qty');
        await ctx.setProps({ theme: 'dark' });
        ctx.snapshot('列メニュー: dark');
        await ctx.setProps({ motion: 'off' });
        ctx.snapshot('列メニュー: motion off');
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'Escape' });
        });
        await ctx.act(() => {
          call(ctx, 'openFilterManager');
        });
        await ctx.setProps({ theme: 'light', motion: 'auto' });
        ctx.snapshot('ツールパネル: light');
      },
    });
  }, 20_000);

  it('set フィルターを開いたまま行が変わる・検索中に行が変わる・選んだ値の行が消える', async () => {
    const popover = () => document.querySelector<HTMLElement>('.ssg-filter-popover');
    const option = (label: string) =>
      Array.from(popover()?.querySelectorAll<HTMLLabelElement>('.ssg-filter-option') ?? [])
        .find((el) => el.textContent === label)
        ?.querySelector('input');
    await expectParity({
      features: ['columnMenu', 'filtering'],
      watch: ['onFiltersChange'],
      props: baseProps,
      steps: async (ctx) => {
        await openFilterFromMenu(ctx, 'city');
        ctx.snapshot('開いた');
        await ctx.act(() => {
          const input = option('大阪');
          if (input) {
            fireEvent.click(input);
          }
        });
        ctx.snapshot('大阪を外した');
        await ctx.setProps({ rows: [...makeRows(10), { id: 50, name: '品目 50', qty: 1, city: '札幌' }] });
        ctx.snapshot('札幌の行が増えた');
        await ctx.act(() => {
          const search = popover()?.querySelector<HTMLInputElement>('input[type="text"], input[type="search"]');
          if (search) {
            fireEvent.input(search, { target: { value: '東' } });
          }
        }, 80);
        ctx.snapshot('東で検索');
        await ctx.setProps({ rows: makeRows(10).filter((row) => row.city !== '東京') });
        ctx.snapshot('検索中に東京の行が消えた');
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'Enter' });
        });
        ctx.snapshot('Enter');
      },
    });
  }, 20_000);

  it('select フィルターで選んだまま(適用前)行が変わる', async () => {
    const selectColumns = columns.map((c) => (c.key === 'city' ? { ...c, filterType: 'select' } : c));
    const select = () => document.querySelector<HTMLSelectElement>('.ssg-filter-popover select.ssg-filter-select');
    await expectParity({
      features: ['columnMenu', 'filtering'],
      watch: ['onFiltersChange'],
      props: () => ({ ...baseProps(), columns: selectColumns }),
      steps: async (ctx) => {
        await openFilterFromMenu(ctx, 'city');
        ctx.log('select', select()?.value ?? null);
        await ctx.act(() => {
          const element = select();
          if (element) {
            fireEvent.change(element, { target: { value: '大阪' } });
          }
        });
        ctx.log('選んだ', select()?.value ?? null);
        await ctx.setProps({ rows: [...makeRows(10), { id: 50, name: '品目 50', qty: 1, city: '札幌' }] });
        ctx.log('行が増えた後の select の値', select()?.value ?? null);
        ctx.log('行が増えた後の選ばれた候補', select()?.selectedOptions[0]?.textContent ?? null);
        ctx.snapshot('行が増えた');
        await ctx.setProps({ rows: makeRows(10).map((row) => (row.id === 1 ? { ...row, name: '書き換え' } : row)) });
        ctx.log('ほかの列を書き換えた後の select の値', select()?.value ?? null);
        await ctx.act(() => {
          const element = select();
          if (element) {
            fireEvent.keyDown(element, { key: 'Enter' });
          }
        });
        ctx.snapshot('Enter で適用');
      },
    });
  }, 20_000);
});

describe('R3 ダイアログの中 / popupContainer', () => {
  beforeAll(async () => {
    const reactLite = (await import(/* @vite-ignore */ new URL('../../../react/src/lite.ts', import.meta.url).pathname)) as {
      preloadGridPopups: () => Promise<void>;
    };
    await reactLite.preloadGridPopups();
  });
  const where = (selector: string) => {
    const element = document.querySelector(selector);
    if (!element) {
      return 'なし';
    }
    if (element.closest('dialog')) {
      return 'dialog';
    }
    if (element.closest('[data-holder]')) {
      return 'holder';
    }
    return element.parentElement === document.body ? 'body' : (element.parentElement?.tagName ?? '?');
  };
  const openAll = async (ctx: ParityContext, label: string) => {
    await openByButton(ctx, 'qty');
    ctx.log(`${label}: 列メニュー`, where('.ssg-menu-panel'));
    await clickItem(ctx, 'フィルター…');
    await ctx.act(() => {}, 60);
    ctx.log(`${label}: 列フィルター`, where('.ssg-filter-popover'));
    await ctx.act(() => {
      fireEvent.keyDown(focused(), { key: 'Escape' });
    });
    await ctx.act(() => {
      call(ctx, 'openFilterManager');
    });
    ctx.log(`${label}: ツールパネル`, where('.ssg-tool-panel, [role="dialog"].ssg-menu-panel, .ssg-toolpanel'));
    await ctx.act(() => {
      fireEvent.keyDown(focused(), { key: 'Escape' });
    });
    await ctx.act(() => {
      fireEvent.contextMenu(ctx.cell(2, 'qty'), { button: 2, clientX: 210, clientY: 130 });
    });
    ctx.log(`${label}: 右クリックメニュー`, where('.ssg-menu-panel'));
    await ctx.act(() => {
      fireEvent.keyDown(focused(), { key: 'Escape' });
    });
  };
  it('ダイアログの中(auto)・要素を渡す・あとから body へ', async () => {
    await expectParity({
      features: ['columnMenu', 'filtering', 'toolPanel', 'contextMenu'],
      props: () => ({
        ...baseProps(),
        enableContextMenu: true,
        getContextMenuItems: () => [{ label: 'コピー', onSelect: () => {} }],
      }),
      steps: async (ctx) => {
        const dialog = document.createElement('dialog');
        dialog.setAttribute('open', '');
        document.body.append(dialog);
        const parent = ctx.container.parentElement;
        dialog.append(ctx.container);
        try {
          await openAll(ctx, 'ダイアログの中');
        } finally {
          parent?.append(ctx.container);
          dialog.remove();
        }
        const holder = document.createElement('div');
        holder.setAttribute('data-holder', '');
        document.body.append(holder);
        try {
          await ctx.setProps({ popupContainer: holder });
          await openAll(ctx, '要素を渡す');
          await ctx.setProps({ popupContainer: 'body' });
          await openAll(ctx, 'body');
        } finally {
          holder.remove();
        }
      },
    });
  }, 30_000);
});

describe('R3 列フィルターを開いたまま別の列へ(ツールパネルの ✎)', () => {
  beforeAll(async () => {
    const reactLite = (await import(/* @vite-ignore */ new URL('../../../react/src/lite.ts', import.meta.url).pathname)) as {
      preloadGridPopups: () => Promise<void>;
    };
    await reactLite.preloadGridPopups();
  });
  const logFocus = (ctx: ParityContext, label: string) => {
    const active = document.activeElement;
    ctx.log(
      `フォーカス(${label})`,
      active && active !== document.body
        ? `${active.tagName.toLowerCase()}.${Array.from(active.classList).sort().join('.')}`
        : 'なし',
    );
  };
  const edit = async (ctx: ParityContext, index: number) => {
    await ctx.act(() => {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.ssg-filter-manage-icon-btn:not(.ssg-filter-manage-icon-btn--danger)'),
      );
      const button = buttons[index];
      if (button) {
        fireEvent.pointerDown(button, pointer);
        fireEvent.click(button, { detail: 1 });
      }
    }, 150);
  };
  const searchInput = () => document.querySelector<HTMLInputElement>('.ssg-filter-popover input.ssg-filter-search, .ssg-filter-popover input[type="text"]');
  it.each([
    ['set → set', 'set', 'set'],
    ['set → text', 'set', 'text'],
    ['number → number', 'number', 'number'],
  ])('%s', async (_label, typeA, typeB) => {
    const twoColumns = [
      { key: 'id', title: 'ID', width: 60, editable: false },
      { key: 'city', title: '都市', width: 100, filterType: typeA },
      { key: 'name', title: '品名', width: 120, filterType: typeB },
      { key: 'qty', title: '数量', width: 80, filterType: 'number' },
    ];
    const value = (type: string) =>
      type === 'set'
        ? { kind: 'set', values: ['東京', '品目 1'] }
        : type === 'number'
          ? { kind: 'number', raw: '>1', parsed: { mode: 'comparison', operator: '>', value: 1 } }
          : { kind: 'text', value: '1' };
    await expectParity({
      features: ['columnMenu', 'filtering', 'toolPanel'],
      watch: ['onFiltersChange'],
      props: () => ({ ...baseProps(), columns: twoColumns }),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'applyState', { filters: { globalText: '', columnFilters: { city: value(typeA), name: value(typeB) } } });
        });
        await ctx.act(() => {
          call(ctx, 'openFilterManager');
        });
        await edit(ctx, 0);
        ctx.snapshot('1 つ目を開いた');
        logFocus(ctx, '1 つ目');
        await ctx.act(() => {
          const input = searchInput();
          if (input) {
            fireEvent.input(input, { target: { value: '東' } });
          }
        }, 80);
        ctx.log('1 つ目の入力欄', searchInput()?.value ?? null);
        ctx.snapshot('1 つ目に入力した');
        await edit(ctx, 1);
        ctx.log('2 つ目の入力欄', searchInput()?.value ?? null);
        logFocus(ctx, '2 つ目');
        ctx.snapshot('開いたまま 2 つ目を開いた');
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'Enter' });
        });
        ctx.snapshot('Enter');
      },
    });
  }, 20_000);
});