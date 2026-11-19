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

describe('列メニュー(columnMenu)', () => {
  const focused = () => document.activeElement ?? document.body;
  const menuItem = (label: string) =>
    Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((el) => el.textContent?.includes(label));
  const menuButton = (ctx: ParityContext, key: string) =>
    ctx.header(key).querySelector<HTMLButtonElement>('.ssg-icon-btn');
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
  const key = async (ctx: ParityContext, init: KeyboardEventInit & { key: string }) => {
    await ctx.act(() => {
      fireEvent.keyDown(focused(), init);
    });
  };

  it.each([
    ['あり', ['columnMenu']],
    ['あり + 幅の自動調整', ['columnMenu', 'columnAutosize']],
    ['なし', []],
  ])('⋮ / 右クリック / Alt+↓ で開き、並び替え・固定・リセット・閉じ方(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      watch: ['onSortChange', 'onColumnsChange'],
      props: () => ({ rows: makeRows(12), columns, rowKeyGetter: (row: Row) => row.id, height: 360 }),
      steps: async (ctx) => {
        ctx.snapshot('最初(見出しの ⋮)');
        if (!menuButton(ctx, 'qty')) {
          // 機能なし: 右クリックはブラウザの標準のメニューのまま。
          await ctx.act(() => {
            ctx.log('見出しの右クリックの標準のメニューを止めたか', !fireEvent.contextMenu(ctx.header('qty'), { clientX: 200, clientY: 40 }));
          });
          ctx.snapshot('機能なしの右クリック');
          return;
        }
        // ⋮(マウスは pointerdown で開く)。開いた後はパネルにフォーカス。
        await openByButton(ctx, 'qty');
        ctx.snapshot('⋮ で開いた');
        await key(ctx, { key: 'ArrowDown' });
        ctx.snapshot('↓ で先頭の項目へ');
        await key(ctx, { key: 'End' });
        ctx.snapshot('End で最後の項目へ');
        // 昇順(閉じてグリッドへフォーカス)。
        await clickItem(ctx, '昇順で並び替え');
        ctx.snapshot('昇順を選んだ');
        // もう一度開いて同じ向き = 解除。
        await openByButton(ctx, 'qty');
        ctx.snapshot('昇順の ✓');
        await clickItem(ctx, '昇順で並び替え');
        ctx.snapshot('昇順を外した');
        // 同じ ⋮ をもう一度押すと閉じる。
        await openByButton(ctx, 'name');
        await openByButton(ctx, 'name');
        ctx.snapshot('同じ ⋮ で閉じた');
        // 見出しの右クリック(押した位置に開く)。
        await ctx.act(() => {
          ctx.log('見出しの右クリックの標準のメニューを止めたか', !fireEvent.contextMenu(ctx.header('city'), { clientX: 300, clientY: 40 }));
        });
        ctx.snapshot('右クリックで開いた');
        // 列の固定の小メニュー(マウスのホバーで開く)。
        await ctx.act(() => {
          const pin = menuItem('列の固定');
          if (pin) {
            fireEvent.pointerOver(pin, { pointerType: 'mouse' });
            fireEvent.pointerEnter(pin, { pointerType: 'mouse' });
          }
        });
        ctx.snapshot('列の固定の小メニュー');
        // 別の項目へホバーすると閉じる。
        await ctx.act(() => {
          const other = menuItem('列のリセット');
          if (other) {
            fireEvent.pointerOver(other, { pointerType: 'mouse' });
            fireEvent.pointerEnter(other, { pointerType: 'mouse' });
          }
        });
        ctx.snapshot('別の項目へホバー');
        // 押して開き、左に固定。
        await clickItem(ctx, '列の固定');
        await clickItem(ctx, '左に固定');
        ctx.snapshot('左に固定を選んだ');
        // キーボード: アクティブセルで Alt+↓(先頭の項目へ)→ 列の固定で → → 小メニューの先頭 → ← で戻る → Escape。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(2, 'name'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'ArrowDown', altKey: true });
        });
        ctx.snapshot('Alt+↓ で開いた');
        await ctx.act(() => {
          menuItem('列の固定')?.focus();
        });
        await key(ctx, { key: 'ArrowRight' });
        ctx.snapshot('→ で小メニュー');
        await key(ctx, { key: 'ArrowLeft' });
        ctx.snapshot('← で戻った');
        await key(ctx, { key: 'Escape' });
        ctx.snapshot('Escape で閉じた');
        // Tab で閉じる / 外を押して閉じる。
        await openByButton(ctx, 'qty');
        await key(ctx, { key: 'Tab' });
        ctx.snapshot('Tab で閉じた');
        await openByButton(ctx, 'qty');
        await ctx.act(() => {
          fireEvent.pointerDown(document.body, pointer);
        });
        ctx.snapshot('外を押して閉じた');
        // 列のリセットと幅の自動調整(機能があるときだけ項目が出る)。
        await openByButton(ctx, 'qty');
        ctx.log('幅の自動調整の項目', menuItem('この列の幅を自動調整') !== undefined);
        await clickItem(ctx, '列のリセット');
        ctx.snapshot('列のリセット');
        // ⋮ を出さない(enableColumnMenu: false)。
        await ctx.setProps({ enableColumnMenu: false });
        ctx.snapshot('enableColumnMenu: false');
        await ctx.act(() => {
          ctx.log('無効の右クリックの標準のメニューを止めたか', !fireEvent.contextMenu(ctx.header('qty'), { clientX: 200, clientY: 40 }));
        });
      },
    });
  }, 20_000);

  it('onColumnsChange が無いときの固定の小メニューとリセット、並び替えなし(enableSorting: false)', async () => {
    await expectParity({
      features: ['columnMenu'],
      props: () => ({ rows: makeRows(6), columns, rowKeyGetter: (row: Row) => row.id, height: 300, enableSorting: false }),
      steps: async (ctx) => {
        await openByButton(ctx, 'qty');
        await clickItem(ctx, '列の固定');
        ctx.snapshot('固定できない小メニュー(注記)');
        await key(ctx, { key: 'Escape' });
        ctx.snapshot('閉じた');
      },
    });
  });
});
describe('列フィルターのポップオーバー(filtering + columnMenu)', () => {
  beforeAll(async () => {
    // React 版はポップオーバーの部品を遅れて読み込むので、先に読んでおく(開いた直後に同じ DOM を比べるため)。
    const reactLite = (await import(/* @vite-ignore */ new URL('../../../react/src/lite.ts', import.meta.url).pathname)) as {
      preloadGridPopups: () => Promise<void>;
    };
    await reactLite.preloadGridPopups();
  });

  const focused = () => document.activeElement ?? document.body;
  const popover = () => document.querySelector<HTMLElement>('.ssg-filter-popover');
  const inPopover = <E extends Element = HTMLElement>(selector: string): E | null =>
    popover()?.querySelector<E>(selector) ?? null;
  const allInPopover = <E extends Element = HTMLElement>(selector: string): E[] =>
    Array.from(popover()?.querySelectorAll<E>(selector) ?? []);
  const menuItem = (label: string) =>
    Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((el) => el.textContent?.includes(label));
  const menuButton = (ctx: ParityContext, key: string) =>
    ctx.header(key).querySelector<HTMLButtonElement>('.ssg-icon-btn');
  const pressMenuButton = async (ctx: ParityContext, key: string) => {
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
  // 列メニューの「フィルター…」から開く(項目が無ければ false)。
  const openFilter = async (ctx: ParityContext, key: string): Promise<boolean> => {
    await pressMenuButton(ctx, key);
    const item = menuItem('フィルター…');
    if (!item) {
      await ctx.act(() => {
        fireEvent.keyDown(focused(), { key: 'Escape' });
      });
      return false;
    }
    await ctx.act(() => {
      fireEvent.click(item, { detail: 1 });
    });
    return true;
  };
  const press = async (ctx: ParityContext, element: Element | null | undefined, label: string) => {
    await ctx.act(() => {
      if (!element) {
        throw new Error(`[${ctx.framework}] 押す要素がありません: ${label}`);
      }
      fireEvent.pointerDown(element, pointer);
    });
  };
  const type = async (ctx: ParityContext, element: Element | null | undefined, value: string) => {
    await ctx.act(() => {
      if (!element) {
        throw new Error(`[${ctx.framework}] 入力欄がありません`);
      }
      fireEvent.input(element, { target: { value } });
    });
  };
  const keyOn = async (ctx: ParityContext, element: Element | null | undefined, init: KeyboardEventInit & { key: string }) => {
    await ctx.act(() => {
      fireEvent.keyDown(element ?? focused(), init);
    });
  };
  const change = async (ctx: ParityContext, element: Element | null | undefined, value: string) => {
    await ctx.act(() => {
      if (!element) {
        throw new Error(`[${ctx.framework}] select がありません`);
      }
      fireEvent.change(element, { target: { value } });
    });
  };
  const optionCheckbox = (label: string) =>
    allInPopover<HTMLLabelElement>('.ssg-filter-option').find((el) => el.textContent === label)?.querySelector('input');
  const click = async (ctx: ParityContext, element: Element | null | undefined, label: string) => {
    await ctx.act(() => {
      if (!element) {
        throw new Error(`[${ctx.framework}] クリックする要素がありません: ${label}`);
      }
      fireEvent.click(element);
    });
  };

  it.each([
    ['あり', ['filtering', 'columnMenu']],
    ['なし', ['columnMenu']],
  ])('text / number / set / date の列と、閉じ方・Tab の巡回・⋮ で閉じる(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      watch: ['onFiltersChange'],
      // 行のフェードイン(前に行が現れてから 1 秒の間は付けない)は時間で変わるので止める。
      props: () => ({ rows: makeRows(16), columns, rowKeyGetter: (row: Row) => row.id, height: 360, animateRows: false }),
      steps: async (ctx) => {
        if (!(await openFilter(ctx, 'name'))) {
          ctx.snapshot('機能なし(フィルター… が無い)');
          return;
        }
        ctx.snapshot('品名(text)を開いた');
        await type(ctx, inPopover('.ssg-filter-input'), '品目 1');
        ctx.snapshot('打った(まだ適用しない)');
        await keyOn(ctx, inPopover('.ssg-filter-input'), { key: 'Enter' });
        ctx.snapshot('Enter で適用して閉じた');
        await openFilter(ctx, 'name');
        ctx.snapshot('開き直した(今の値)');
        await press(ctx, inPopover('.ssg-filter-btn-secondary'), 'クリア');
        ctx.snapshot('クリアで外して閉じた');

        // number: 演算子を範囲に、値を 2 つ、適用。
        await openFilter(ctx, 'qty');
        ctx.snapshot('数量(number)を開いた');
        await change(ctx, inPopover('.ssg-filter-select'), 'between');
        ctx.snapshot('範囲に変えた');
        const [min, max] = allInPopover<HTMLInputElement>('.ssg-filter-input');
        await type(ctx, min, '50');
        await type(ctx, max, '100');
        await press(ctx, inPopover('.ssg-filter-btn-primary'), '適用');
        ctx.snapshot('範囲を適用した');
        await openFilter(ctx, 'qty');
        ctx.snapshot('開き直した(範囲の下書き)');
        await keyOn(ctx, inPopover('.ssg-filter-select'), { key: 'Escape' });
        ctx.snapshot('Escape で閉じた');
        await ctx.act(() => {
          call(ctx, 'applyState', { filters: { globalText: '', columnFilters: {} } });
        });

        // set: チェックはすぐ反映、検索の Enter で当たった値だけ、すべて選択、クリア。
        await openFilter(ctx, 'city');
        ctx.snapshot('都市(set)を開いた');
        await click(ctx, optionCheckbox('東京'), '東京');
        ctx.snapshot('東京を外した(すぐ反映)');
        await type(ctx, inPopover('.ssg-filter-input'), '大');
        ctx.snapshot('「大」で検索');
        await keyOn(ctx, inPopover('.ssg-filter-input'), { key: 'Enter' });
        ctx.snapshot('Enter で大阪だけにして閉じた');
        await openFilter(ctx, 'city');
        await click(ctx, inPopover('.ssg-filter-selectall input'), 'すべて選択');
        ctx.snapshot('すべて選択を押した');
        await click(ctx, inPopover('.ssg-filter-selectall input'), 'すべて選択');
        ctx.snapshot('すべて選択をもう一度');
        await press(ctx, inPopover('.ssg-filter-btn-secondary'), 'クリア');
        ctx.snapshot('クリア(閉じない)');
        await press(ctx, inPopover('.ssg-filter-btn-primary'), '閉じる');
        ctx.snapshot('閉じるで閉じた');

        // Tab はパネルの中で回る / ボタンの Escape で閉じる。
        await openFilter(ctx, 'day');
        ctx.snapshot('日付(date = 文字)を開いた');
        await ctx.act(() => {
          inPopover<HTMLButtonElement>('.ssg-filter-btn-primary')?.focus();
        });
        await keyOn(ctx, focused(), { key: 'Tab' });
        ctx.snapshot('最後のボタンの Tab で先頭へ');
        await keyOn(ctx, focused(), { key: 'Tab', shiftKey: true });
        ctx.snapshot('先頭の Shift+Tab で最後へ');
        await keyOn(ctx, focused(), { key: 'Escape' });
        ctx.snapshot('ボタンの Escape で閉じた');

        // 外を押して閉じる / 開いたまま ⋮ を押すとフィルターを閉じてメニューを開く。
        await openFilter(ctx, 'name');
        await ctx.act(() => {
          fireEvent.pointerDown(document.body, pointer);
        });
        ctx.snapshot('外を押して閉じた');
        await openFilter(ctx, 'city');
        await pressMenuButton(ctx, 'qty');
        ctx.snapshot('開いたまま ⋮ を押した');
        await keyOn(ctx, focused(), { key: 'Escape' });
        ctx.snapshot('メニューを Escape で閉じた');
        // enableColumnFilter: false では「フィルター…」を出さない。
        await ctx.setProps({ enableColumnFilter: false });
        await pressMenuButton(ctx, 'name');
        ctx.log('enableColumnFilter: false のフィルター… の項目', menuItem('フィルター…') !== undefined);
        await keyOn(ctx, focused(), { key: 'Escape' });
      },
    });
  }, 30_000);

  const comboColumns = [
    { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
    { key: 'name', title: '品名', width: 120, filterType: 'textSet' },
    { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' }, filterType: 'numberSet' },
    { key: 'city', title: '都市', width: 100, filterType: 'select' },
    { key: 'day', title: '日付', width: 110, filterType: 'dateSet', editor: { type: 'date' } },
    { key: 'code', title: 'コード', width: 80, filterType: 'auto' },
  ];

  it('textSet / numberSet / select / dateSet / auto の列', async () => {
    await expectParity({
      features: ['filtering', 'columnMenu'],
      watch: ['onFiltersChange'],
      props: () => ({
        rows: makeRows(40),
        columns: comboColumns,
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        animateRows: false,
      }),
      steps: async (ctx) => {
        // textSet: 条件で値の候補が絞られ、条件も値もすぐ反映。
        await openFilter(ctx, 'name');
        ctx.snapshot('品名(textSet)を開いた');
        await type(ctx, inPopover('.ssg-filter-cond-values .ssg-filter-input'), '品目 1');
        ctx.snapshot('条件「品目 1 を含む」');
        await click(ctx, optionCheckbox('品目 10'), '品目 10');
        ctx.snapshot('品目 10 を外した');
        await press(ctx, allInPopover('.ssg-filter-sec-clear')[0], '条件のクリア');
        ctx.snapshot('条件だけクリア');
        await press(ctx, allInPopover('.ssg-filter-sec-clear')[1], '値のクリア');
        ctx.snapshot('値もクリア');
        await press(ctx, inPopover('.ssg-filter-btn-primary'), '閉じる');

        // numberSet: 演算子を以上にして 200。
        await openFilter(ctx, 'qty');
        ctx.snapshot('数量(numberSet)を開いた');
        await change(ctx, inPopover('.ssg-filter-select'), 'gte');
        await type(ctx, inPopover('.ssg-filter-cond-values .ssg-filter-input'), '200');
        ctx.snapshot('200 以上');
        await keyOn(ctx, inPopover('.ssg-filter-cond-values .ssg-filter-input'), { key: 'Escape' });
        ctx.snapshot('Escape で閉じた(条件は掛かったまま)');

        // select: 候補から選んで Enter。
        await openFilter(ctx, 'city');
        ctx.snapshot('都市(select)を開いた');
        await change(ctx, inPopover('select'), '大阪');
        await keyOn(ctx, inPopover('select'), { key: 'Enter' });
        ctx.snapshot('大阪を Enter で適用');

        // dateSet: 年の木、開閉、行の文字のクリック、チップ、演算子と日付の欄、カレンダー。
        await openFilter(ctx, 'day');
        ctx.snapshot('日付(dateSet)を開いた');
        await press(ctx, inPopover('.ssg-filter-tree-toggle:not(.ssg-filter-tree-toggle--placeholder)'), '年の開閉');
        ctx.snapshot('年を開いた');
        await click(ctx, allInPopover('.ssg-filter-option')[1], '月の行');
        ctx.snapshot('月の行の文字を押した');
        await press(ctx, inPopover('.ssg-filter-preset-chip'), '今日のチップ');
        ctx.snapshot('今日のチップ');
        await change(ctx, inPopover('.ssg-filter-select'), 'onOrAfter');
        ctx.snapshot('以降に変えた(チップは外れる)');
        await type(ctx, inPopover('.ssg-dp-input'), '2020/1/1');
        await keyOn(ctx, inPopover('.ssg-dp-input'), { key: 'Enter' });
        ctx.snapshot('2020/1/1 以降');
        await type(ctx, inPopover('.ssg-dp-input'), 'あいう');
        await keyOn(ctx, inPopover('.ssg-dp-input'), { key: 'Enter' });
        ctx.snapshot('読めない日付(赤い枠)');
        await press(ctx, inPopover('.ssg-dp-cal-btn'), 'カレンダー');
        ctx.snapshot('カレンダーを開いた');
        await press(ctx, inPopover('.ssg-dp-nav-title'), '上の段');
        ctx.snapshot('月の段');
        await press(ctx, inPopover('.ssg-dp-nav-title'), '上の段');
        ctx.snapshot('年の段');
        await press(ctx, allInPopover('.ssg-dp-foot-btn')[0], '戻る');
        ctx.snapshot('戻るで月の段');
        await keyOn(ctx, inPopover('.ssg-dp-cal-btn'), { key: 'Escape' });
        ctx.snapshot('ボタンの Escape でカレンダーだけ閉じた');
        await keyOn(ctx, focused(), { key: 'Escape' });
        ctx.snapshot('入力欄の Escape で閉じた');

        // auto: 開いたときに種別を推定する(数の列 → numberSet)。
        await openFilter(ctx, 'code');
        ctx.snapshot('コード(auto)を開いた');
        await press(ctx, inPopover('.ssg-filter-btn-primary'), '閉じる');
        ctx.log('getState', call(ctx, 'getState'));
      },
    });
  }, 30_000);

  it('getFilterOptions(取っている間 / 打ち切り / 失敗と再試行)と renderFilterDateInput', async () => {
    const { createElement } = await import('react');
    const pending = new Map<string, Array<{ resolve: (value: unknown) => void; reject: (reason: unknown) => void }>>();
    await expectParity({
      features: ['filtering', 'columnMenu'],
      watch: ['onFiltersChange'],
      props: (framework) => ({
        rows: makeRows(20),
        columns: [
          ...comboColumns.slice(0, 3),
          { key: 'city', title: '都市', width: 100, filterType: 'set' },
          { key: 'day', title: '日付', width: 110, filterType: 'dateSet' },
        ],
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        animateRows: false,
        getFilterOptions: () => {
          const list = pending.get(framework) ?? [];
          pending.set(framework, list);
          return new Promise((resolve, reject) => list.push({ resolve, reject }));
        },
        renderFilterDateInput: (ctx: { value: string; onChange: (value: string) => void; ariaLabel: string; slot: string; columnKey: string }) =>
          framework === 'react'
            ? createElement('input', {
                className: 'custom-date',
                'data-slot': ctx.slot,
                'data-column': ctx.columnKey,
                'aria-label': ctx.ariaLabel,
                defaultValue: ctx.value,
                onChange: (event: { target: HTMLInputElement }) => ctx.onChange(event.target.value),
              })
            : (
                <input
                  class="custom-date"
                  data-slot={ctx.slot}
                  data-column={ctx.columnKey}
                  aria-label={ctx.ariaLabel}
                  value={ctx.value}
                  onInput={(event) => ctx.onChange(event.currentTarget.value)}
                />
              ),
      }),
      steps: async (ctx) => {
        const settle = async (mode: 'resolve' | 'reject', value: unknown) => {
          await ctx.act(() => {
            const next = pending.get(ctx.framework)?.shift();
            if (mode === 'resolve') {
              next?.resolve(value);
            } else {
              next?.reject(value);
            }
          });
        };
        await openFilter(ctx, 'city');
        ctx.snapshot('set: 取っている間');
        await settle('resolve', {
          options: [
            { label: '東京', value: '東京' },
            { label: '大阪', value: '大阪' },
          ],
          truncated: true,
        });
        ctx.snapshot('set: 届いた(打ち切りの注記)');
        await press(ctx, inPopover('.ssg-filter-btn-primary'), '閉じる');
        await openFilter(ctx, 'name');
        ctx.snapshot('textSet: 取っている間(条件の欄はそのまま)');
        await settle('reject', new Error('サーバーが落ちています'));
        ctx.snapshot('textSet: 失敗(再試行)');
        await press(ctx, inPopover('.ssg-filter-error button'), '再試行');
        ctx.snapshot('再試行で取り直し中');
        await settle('resolve', { options: [{ label: '品目 1', value: '品目 1' }] });
        ctx.snapshot('再試行で届いた');
        await press(ctx, inPopover('.ssg-filter-btn-primary'), '閉じる');
        // renderFilterDateInput(範囲で 2 つ)。
        await openFilter(ctx, 'day');
        await settle('resolve', { options: [] });
        await change(ctx, inPopover('.ssg-filter-select'), 'range');
        ctx.snapshot('日付の入力欄の差し替え(範囲)');
        await ctx.act(() => {
          const input = inPopover<HTMLInputElement>('.custom-date[data-slot="from"]');
          if (input) {
            fireEvent.input(input, { target: { value: '2026-01-01' } });
          }
        });
        ctx.snapshot('差し替えの欄で開始日');
        await press(ctx, inPopover('.ssg-filter-btn-primary'), '閉じる');
      },
    });
  }, 30_000);
});