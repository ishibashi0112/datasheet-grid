// React 版(`/lite` に同じ機能を差し込んだもの)と Solid 版のフィルター / 列メニュー / ツールパネルを同じ操作で動かして、
//   DOM と通知と命令的 API の結果が同じかを見る(段階 2-3)。
import { beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { numberFormatter } from '@ishibashi0112/spreadsheet-grid-core';
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
      allowMissingFeatures: ['filtering'],
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
  }, 20_000); // 検索欄の入力の待ちが React 版と Solid 版で 6 回ずつあり、既定の 5 秒に近い(段階 3-3)

  it.each([
    ['あり', ['filtering']],
    ['なし', []],
  ])('相対日付プリセットと text / dateSet の列フィルター(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      allowMissingFeatures: ['filtering'],
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
      allowMissingFeatures: ['filtering'],
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
        // WebKitGTK の Shift+Tab(key='Unidentified'・keyCode 9)も同じ(段階 3-2)。
        await keyOn(ctx, focused(), { key: 'Tab' });
        await keyOn(ctx, focused(), { key: 'Unidentified', keyCode: 9, shiftKey: true });
        ctx.log('WebKitGTK の Shift+Tab の後のフォーカス', `${focused().tagName.toLowerCase()} ${focused().textContent?.slice(0, 16) ?? ''}`);
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

  // 別視点のレビュー: 種別を推定した列('auto' → dateSet)で、下書きを変えるたびにチップと差し替えた日付欄が作り直されて
  //   フォーカスが外れていた(種別を明示した列では起きない)。
  it("'auto' の日付の列のチップと差し替えた日付欄は、下書きを変えても同じ要素のまま", async () => {
    const { createElement } = await import('react');
    await expectParity({
      features: ['filtering', 'columnMenu'],
      watch: ['onFiltersChange'],
      props: (framework) => ({
        rows: makeRows(20),
        columns: [
          { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
          { key: 'day', title: '日付', width: 110, filterType: 'auto', editor: { type: 'date' } },
        ],
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        animateRows: false,
        renderFilterDateInput: (ctx: { value: string; onChange: (value: string) => void; ariaLabel: string; slot: string }) =>
          framework === 'react'
            ? createElement('input', {
                className: 'custom-date',
                'data-slot': ctx.slot,
                'aria-label': ctx.ariaLabel,
                defaultValue: ctx.value,
                onChange: (event: { target: HTMLInputElement }) => ctx.onChange(event.target.value),
              })
            : (
                <input
                  class="custom-date"
                  data-slot={ctx.slot}
                  aria-label={ctx.ariaLabel}
                  value={ctx.value}
                  onInput={(event) => ctx.onChange(event.currentTarget.value)}
                />
              ),
      }),
      steps: async (ctx) => {
        await openFilter(ctx, 'day');
        ctx.snapshot('日付(auto → dateSet)を開いた');
        // チップをキーボードで押す(フォーカスを置いて Enter = click の detail 0)。
        const chip = inPopover<HTMLButtonElement>('.ssg-filter-preset-chip');
        await ctx.act(() => {
          chip?.focus();
          if (chip) {
            fireEvent.click(chip, { detail: 0 });
          }
        });
        ctx.log('チップを押した後も同じ要素でフォーカスもそのまま', chip?.isConnected === true && document.activeElement === chip);
        ctx.snapshot('今日のチップ');
        // 範囲にして、終わりの欄にフォーカスを置いたまま開始の欄を変える。
        await change(ctx, inPopover('.ssg-filter-select'), 'range');
        const to = inPopover<HTMLInputElement>('.custom-date[data-slot="to"]');
        await ctx.act(() => {
          to?.focus();
          const from = inPopover<HTMLInputElement>('.custom-date[data-slot="from"]');
          if (from) {
            fireEvent.input(from, { target: { value: '2026-01-01' } });
          }
        });
        ctx.log('開始の欄を変えても終わりの欄は同じ要素でフォーカスもそのまま', to?.isConnected === true && document.activeElement === to);
        await ctx.act(() => {
          if (to) {
            fireEvent.input(to, { target: { value: '2026-02-01' } });
          }
        });
        ctx.log('終わりの欄を変えても同じ要素', to?.isConnected === true && document.activeElement === to);
        ctx.snapshot('範囲を入れた');
        await press(ctx, inPopover('.ssg-filter-btn-primary'), '閉じる');
      },
    });
  }, 30_000);

  // L-06: Date の値の dateSet の列は、候補が年月日の木に日付で集まり(時刻は見ない)、選んだ日の行に絞り込める。
  it('Date の値の dateSet の列(L-06)', async () => {
    const dated = [
      { id: 1, d: new Date(2026, 6, 1) },
      { id: 2, d: new Date(2026, 6, 2) },
      { id: 3, d: new Date(2026, 6, 1, 15, 30) },
    ];
    await expectParity({
      features: ['filtering', 'columnMenu', 'export'],
      watch: ['onFiltersChange'],
      props: () => ({
        rows: dated,
        columns: [
          { key: 'id', title: 'ID', width: 80 },
          { key: 'd', title: '日付', width: 160, filterType: 'dateSet' },
        ],
        rowKeyGetter: (row: { id: number }) => row.id,
        height: 300,
        animateRows: false,
      }),
      steps: async (ctx) => {
        await openFilter(ctx, 'd');
        ctx.snapshot('開いた');
        // 年 → 月を開く。
        for (let depth = 0; depth < 2; depth += 1) {
          const toggles = allInPopover('.ssg-filter-tree-toggle:not(.ssg-filter-tree-toggle--placeholder)');
          await press(ctx, toggles[depth], `木の開閉 ${depth}`);
        }
        ctx.snapshot('年と月を開いた');
        ctx.log('候補', allInPopover('.ssg-filter-option').map((element) => element.textContent));
        // 7/1 の日だけ(時刻のある行も入る)。
        await press(ctx, inPopover('.ssg-filter-btn-primary'), '閉じる');
        await ctx.act(() => {
          call(ctx, 'applyState', {
            filters: { globalText: '', columnFilters: { d: { kind: 'dateSet', condition: null, set: { values: ['2026-07-01'] } } } },
          });
        });
        ctx.snapshot('7/1 だけ');
        ctx.log('残った行', (call(ctx, 'getExportData', { scope: 'view' }) as { rows: { value: unknown }[][] }).rows.map((row) => row[0]?.value));
      },
    });
  });

  // DU-07: チップのバーとフィルターの管理は、select の値をラベルで、数値の条件を列の valueFormatter で出す。
  it('チップのバーの要約は select のラベルと書式を当てた数値(DU-07)', async () => {
    await expectParity({
      features: ['filtering', 'columnMenu', 'toolPanel'],
      props: () => ({
        rows: [
          { id: 1, kind: 'mansion', rent: 80000 },
          { id: 2, kind: 'house', rent: 120000 },
        ],
        columns: [
          {
            key: 'kind',
            title: '種別',
            width: 100,
            filterType: 'select',
            filterOptions: [
              { value: 'mansion', label: 'マンション' },
              { value: 'house', label: '一戸建て' },
            ],
          },
          { key: 'rent', title: '家賃', width: 100, filterType: 'number', valueFormatter: numberFormatter() },
        ],
        rowKeyGetter: (row: { id: number }) => row.id,
        height: 300,
        showFilterChipBar: true,
        animateRows: false,
      }),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'applyState', {
            filters: {
              globalText: '',
              columnFilters: {
                kind: { kind: 'select', value: 'mansion' },
                rent: { kind: 'number', raw: '<= 100000', parsed: { mode: 'comparison', operator: '<=', value: 100000 } },
              },
            },
          });
        });
        ctx.log('チップのバー', ctx.container.querySelector('.ssg-filter-chip-bar')?.textContent ?? null);
        ctx.snapshot('チップのバー');
        await ctx.act(() => {
          call(ctx, 'openFilterManager');
        });
        ctx.snapshot('フィルターの管理');
      },
    });
  });
});

describe('ツールパネル(toolPanel)とフィルターのチップのバー', () => {
  beforeAll(async () => {
    // React 版はツールパネルと列フィルターの部品を遅れて読み込むので、先に読んでおく(開いた直後に同じ DOM を比べるため)。
    const reactLite = (await import(/* @vite-ignore */ new URL('../../../react/src/lite.ts', import.meta.url).pathname)) as {
      preloadGridPopups: () => Promise<void>;
    };
    await reactLite.preloadGridPopups();
  });

  type ColumnLike = { key: string; visible?: boolean; pinned?: string };
  const focused = () => document.activeElement ?? document.body;
  const panel = () => document.querySelector<HTMLElement>('.ssg-toolpanel');
  const inPanel = <E extends Element = HTMLElement>(selector: string): E | null =>
    panel()?.querySelector<E>(selector) ?? null;
  const allInPanel = <E extends Element = HTMLElement>(selector: string): E[] =>
    Array.from(panel()?.querySelectorAll<E>(selector) ?? []);
  const tab = (label: string) =>
    allInPanel<HTMLButtonElement>('[role="tab"]').find((el) => el.textContent?.startsWith(label)) ?? null;
  const menuItem = (label: string) =>
    Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((el) => el.textContent?.includes(label));
  // パネルの中のどこにフォーカスがあるか(控えの「フォーカス」はグリッドの外の要素をタグだけで書くので、ここで詳しく控える)。
  const logFocus = (ctx: ParityContext, label: string) => {
    const active = document.activeElement;
    ctx.log(
      `フォーカス(${label})`,
      active && active !== document.body
        ? `${active.tagName.toLowerCase()}.${Array.from(active.classList).sort().join('.')} ${JSON.stringify(active.textContent?.slice(0, 16) ?? '')}`
        : 'なし',
    );
  };
  const describeColumns = (next: readonly ColumnLike[] | null) =>
    next === null
      ? 'なし'
      : next.map((column) => `${column.key}${column.visible === false ? ':hidden' : ''}${column.pinned ? `:${column.pinned}` : ''}`).join(' ');
  const click = async (ctx: ParityContext, element: Element | null | undefined, label: string) => {
    await ctx.act(() => {
      if (!element) {
        throw new Error(`[${ctx.framework}] クリックする要素がありません: ${label}`);
      }
      fireEvent.click(element, { detail: 1 });
    });
  };
  const keyOn = async (ctx: ParityContext, element: Element | null | undefined, init: KeyboardEventInit & { key: string }) => {
    await ctx.act(() => {
      fireEvent.keyDown(element ?? focused(), init);
    });
  };
  // ✎ / フィルターを追加 / チップは列へ移ってから数フレーム後に開く。
  const waitFrames = (ctx: ParityContext) => ctx.act(() => {}, 120);
  const openColumnMenu = async (ctx: ParityContext, key: string): Promise<boolean> => {
    const button = ctx.header(key).querySelector<HTMLButtonElement>('.ssg-icon-btn');
    if (!button) {
      return false;
    }
    await ctx.act(() => {
      fireEvent.pointerDown(button, { ...pointer, pointerType: 'mouse' });
      fireEvent.pointerUp(button, { ...pointer, pointerType: 'mouse' });
      fireEvent.click(button, { detail: 1 });
    });
    return true;
  };
  // ⠿ を引いて落とす(jsdom の行の矩形は top 0 / 高さ 400 なので、y = 100 は先頭の前、y = 300 は末尾)。
  const dragHandle = async (ctx: ParityContext, handle: HTMLElement | null | undefined, fromY: number, toY: number) => {
    await ctx.act(() => {
      if (!handle) {
        throw new Error(`[${ctx.framework}] ⠿ がありません`);
      }
      (handle as HTMLElement & { setPointerCapture: () => void }).setPointerCapture = () => {};
      fireEvent.pointerDown(handle, { ...pointer, clientY: fromY });
      fireEvent.pointerMove(handle, { ...pointer, clientY: toY });
    });
    ctx.snapshot('⠿ を引いている');
    await ctx.act(() => {
      fireEvent.pointerUp(handle!, { ...pointer, clientY: toY });
    });
  };

  const featureSets = [
    ['全部', ['filtering', 'columnMenu', 'toolPanel']],
    ['フィルターなし', ['columnMenu', 'toolPanel']],
    ['列メニューなし', ['filtering', 'toolPanel']],
    ['ツールパネルなし', ['filtering', 'columnMenu']],
    ['ツールパネルだけ', ['toolPanel']],
  ] as const;

  it.each(featureSets)(
    'フィルターのタブ・チップのバー・上部バーの絞り込みのチップ・✎ と列フィルター・Escape の順(%s)',
    async (_label, features) => {
      await expectParity({
        features,
        allowMissingFeatures: ['filtering', 'columnMenu', 'toolPanel'],
        watch: ['onFiltersChange'],
        props: () => ({
          rows: makeRows(16),
          columns,
          rowKeyGetter: (row: Row) => row.id,
          height: 360,
          animateRows: false,
          showFilterChipBar: true,
        }),
        steps: async (ctx) => {
          ctx.snapshot('最初');
          await ctx.act(() => {
            call(ctx, 'applyState', {
              filters: {
                globalText: '品目',
                columnFilters: {
                  qty: { kind: 'number', raw: '>20', parsed: { mode: 'comparison', operator: '>', value: 20 } },
                  city: { kind: 'set', values: ['東京', '大阪'] },
                },
              },
            });
          });
          ctx.snapshot('フィルター 3 つ(チップのバー)');
          await ctx.act(() => {
            call(ctx, 'openFilterManager');
          });
          ctx.snapshot('openFilterManager');
          logFocus(ctx, '開いた');
          if (!panel()) {
            // ツールパネルが無い / フィルターが無い構成では開かない。チップのバーのチップから列フィルターを開く。
            const chip = ctx.container.querySelector<HTMLButtonElement>('.ssg-filter-chip-label');
            if (chip && !chip.disabled) {
              await click(ctx, chip, 'チップ');
              await waitFrames(ctx);
              ctx.snapshot('チップで列フィルターを開いた');
              await keyOn(ctx, null, { key: 'Escape' });
            }
            const clearOne = ctx.container.querySelector<HTMLButtonElement>('.ssg-filter-chip-clear');
            if (clearOne) {
              await click(ctx, clearOne, 'チップの ×');
              ctx.snapshot('チップの × で外した');
              await click(ctx, ctx.container.querySelector('.ssg-filter-chip-bar-clear-all'), 'すべてクリア');
              ctx.snapshot('チップのバーのすべてクリア');
            }
            return;
          }
          // 上部バーの絞り込みのチップで閉じて、もう一度開く。
          const summaryChip = () => ctx.container.querySelector<HTMLElement>('button.ssg-bar-chip');
          await click(ctx, summaryChip(), '絞り込みのチップ');
          ctx.snapshot('絞り込みのチップで閉じた');
          await click(ctx, summaryChip(), '絞り込みのチップ');
          ctx.snapshot('絞り込みのチップで開いた');
          // ✎ で列フィルターを開く(パネルは開いたまま)。Escape は 1 回目 = ポップオーバー、2 回目 = パネル。
          const editButtons = allInPanel<HTMLButtonElement>('.ssg-filter-manage-icon-btn:not(.ssg-filter-manage-icon-btn--danger)');
          await click(ctx, editButtons[1], '✎(都市)');
          await waitFrames(ctx);
          ctx.snapshot('✎ で都市のフィルターを開いた');
          // ポップオーバーの中の押下ではパネルは閉じない。
          await ctx.act(() => {
            const option = document.querySelector('.ssg-filter-popover .ssg-filter-option input');
            if (option) {
              fireEvent.pointerDown(option, pointer);
            }
          });
          ctx.snapshot('ポップオーバーの中を押した');
          await keyOn(ctx, null, { key: 'Escape' });
          ctx.snapshot('Escape 1 回目(ポップオーバーだけ閉じた)');
          await keyOn(ctx, null, { key: 'Escape' });
          ctx.snapshot('Escape 2 回目(パネルを閉じた)');
          logFocus(ctx, 'Escape 2 回目');
          // 開き直して、× で 1 つ外す / グローバルの × / すべてクリア。
          await ctx.act(() => {
            call(ctx, 'openFilterManager');
          });
          await click(ctx, allInPanel('.ssg-filter-manage-row:not(.ssg-filter-manage-row--global) .ssg-filter-manage-icon-btn--danger')[0], '×');
          ctx.snapshot('× で数量を外した');
          await click(ctx, inPanel('.ssg-filter-manage-row--global .ssg-filter-manage-icon-btn--danger'), 'グローバルの ×');
          ctx.snapshot('グローバルの × で外した');
          await click(ctx, inPanel('.ssg-filter-manage-clear-all'), 'すべてクリア');
          ctx.snapshot('すべてクリア');
          // フィルターを追加: 品名を選ぶと列へ移って開く(選んだ値は空へ戻る)。
          await ctx.act(() => {
            const select = inPanel<HTMLSelectElement>('.ssg-filter-manage-add');
            if (select) {
              fireEvent.change(select, { target: { value: 'name' } });
            }
          });
          ctx.log('追加の選択の値', inPanel<HTMLSelectElement>('.ssg-filter-manage-add')?.value ?? null);
          await waitFrames(ctx);
          ctx.snapshot('フィルターを追加で品名を開いた');
          await keyOn(ctx, null, { key: 'Escape' });
          // チップのバーのチップから開く(パネルを開いたまま)。
          await ctx.act(() => {
            call(ctx, 'applyState', { filters: { globalText: '', columnFilters: { name: { kind: 'text', value: '1' } } } });
          });
          await click(ctx, ctx.container.querySelector('.ssg-filter-chip-label'), 'チップ');
          await waitFrames(ctx);
          ctx.snapshot('チップで品名を開いた');
          await keyOn(ctx, null, { key: 'Escape' });
          await keyOn(ctx, null, { key: 'Escape' });
          ctx.snapshot('両方閉じた');
          // closeFilterManager は別のタブを出しているときは閉じない。
          await ctx.act(() => {
            call(ctx, 'openFilterManager');
          });
          await ctx.act(() => {
            call(ctx, 'closeFilterManager');
          });
          ctx.snapshot('closeFilterManager');
        },
      });
    },
    30_000,
  );

  it.each(featureSets)(
    '列 / 並び替えのタブ・列メニューの入口・開き直しの光・ヘッダーを掴んで動かす・Tab の巡回・外を押して閉じる(%s)',
    async (_label, features) => {
      let latest: readonly ColumnLike[] | null = null;
      await expectParity({
        features,
        allowMissingFeatures: ['filtering', 'columnMenu', 'toolPanel'],
        watch: ['onSortChange'],
        props: () => ({
          rows: makeRows(16),
          columns,
          rowKeyGetter: (row: Row) => row.id,
          height: 360,
          animateRows: false,
          onColumnsChange: (next: readonly ColumnLike[]) => {
            latest = next;
          },
        }),
        steps: async (ctx) => {
          const commit = async (label: string) => {
            ctx.log(`onColumnsChange(${label})`, describeColumns(latest));
            if (latest !== null) {
              await ctx.setProps({ columns: latest });
            }
            latest = null;
            ctx.snapshot(label);
          };
          // 列メニューの「列の表示」で列のタブを開く(列メニューが無ければ openFilterManager → 列のタブへ)。
          if (await openColumnMenu(ctx, 'qty')) {
            ctx.snapshot('列メニュー(ツールパネルの入口)');
            const item = menuItem('列の表示');
            if (item) {
              await click(ctx, item, '列の表示');
            } else {
              await keyOn(ctx, null, { key: 'Escape' });
            }
          } else {
            await ctx.act(() => {
              call(ctx, 'openFilterManager');
            });
            if (panel()) {
              await click(ctx, tab('列'), '列のタブ');
            }
          }
          await ctx.act(() => {}, 60);
          ctx.snapshot('列のタブ');
          logFocus(ctx, '列のタブ');
          if (!panel()) {
            return;
          }
          // 検索 → 消す。
          await ctx.act(() => {
            const input = inPanel('.ssg-chooser-search-input');
            if (input) {
              fireEvent.input(input, { target: { value: '数' } });
            }
          });
          ctx.snapshot('「数」で検索');
          await ctx.act(() => {
            const input = inPanel('.ssg-chooser-search-input');
            if (input) {
              fireEvent.input(input, { target: { value: '' } });
            }
          });
          // 数量を外す → すべて表示 → 1 列を残して外す → リセット。
          const toggle = (label: string) =>
            allInPanel<HTMLButtonElement>('.ssg-chooser-toggle').find((el) => el.textContent === label) ?? null;
          await click(ctx, toggle('数量'), '数量');
          await commit('数量を外した');
          await click(ctx, inPanel('.ssg-chooser-master-btn'), 'すべて表示');
          await commit('すべて表示');
          await click(ctx, inPanel('.ssg-chooser-master-btn'), '1 列を残して外す');
          await commit('1 列を残して外した');
          await click(ctx, inPanel('.ssg-chooser-reset-btn'), '列のリセット');
          await commit('列のリセット');
          // ⠿ で品名を中央の区分の末尾へ。
          const chooserHandles = allInPanel<HTMLElement>('[data-chooser-pane="center"] .ssg-chooser-handle');
          await dragHandle(ctx, chooserHandles[0], 100, 300);
          await commit('品名を末尾へ');

          // 並び替えのタブ: 基準を 2 つ、向き・列を変え、⠿ で入れ替え、削除、すべてクリア。
          await click(ctx, tab('並び替え'), '並び替えのタブ');
          await ctx.act(() => {}, 60);
          ctx.snapshot('並び替えのタブ');
          logFocus(ctx, '並び替えのタブ');
          await click(ctx, inPanel('.ssg-sort-footer-btn--add'), '基準を追加');
          await click(ctx, inPanel('.ssg-sort-footer-btn--add'), '基準を追加');
          ctx.snapshot('基準を 2 つ');
          await click(ctx, allInPanel('.ssg-sort-level')[1]?.querySelectorAll('.ssg-sort-dir-btn')[1], '降順');
          ctx.snapshot('2 つ目を降順');
          await ctx.act(() => {
            const select = allInPanel<HTMLSelectElement>('.ssg-sort-select')[0];
            if (select) {
              fireEvent.change(select, { target: { value: 'city' } });
            }
          });
          ctx.snapshot('1 つ目の列を都市へ');
          await dragHandle(ctx, allInPanel<HTMLElement>('.ssg-sort-handle')[1], 300, 100);
          ctx.snapshot('2 つ目を先頭へ');
          await click(ctx, allInPanel('.ssg-sort-delete')[0], '削除');
          ctx.snapshot('先頭を削除');
          await click(ctx, inPanel('.ssg-sort-footer-btn--clear'), 'すべてクリア');
          ctx.snapshot('並び替えのすべてクリア');
          // 開いている間に列のタブへ切り替えると検索欄へフォーカスが移る。
          await click(ctx, tab('列'), '列のタブ');
          await ctx.act(() => {}, 60);
          logFocus(ctx, '開いている間に列のタブへ');
          await click(ctx, tab('並び替え'), '並び替えのタブ');

          // 開いたまま列メニューの「並び替えを管理…」→ 枠が光る(同じタブでも)。
          if (await openColumnMenu(ctx, 'name')) {
            const item = menuItem('並び替えを管理…');
            if (item) {
              await click(ctx, item, '並び替えを管理…');
              ctx.snapshot('開いたまま並び替えを管理…(光る)');
            } else {
              await keyOn(ctx, null, { key: 'Escape' });
            }
          }
          // ヘッダーを掴んで動かす。
          await ctx.act(() => {
            const header = inPanel('.ssg-toolpanel-header');
            if (header) {
              fireEvent.pointerDown(header, { ...pointer, clientX: 300, clientY: 40 });
              fireEvent.pointerMove(window, { ...pointer, clientX: 200, clientY: 120 });
              fireEvent.pointerUp(window, { ...pointer, clientX: 200, clientY: 120 });
            }
          });
          ctx.snapshot('ヘッダーを掴んで動かした');
          // Tab はパネルの中で回る。
          await ctx.act(() => {
            const buttons = allInPanel<HTMLButtonElement>('button:not(:disabled)');
            buttons[buttons.length - 1]?.focus();
          });
          await keyOn(ctx, null, { key: 'Tab' });
          ctx.snapshot('最後のボタンの Tab で先頭へ');
          logFocus(ctx, 'Tab');
          await keyOn(ctx, null, { key: 'Tab', shiftKey: true });
          ctx.snapshot('先頭の Shift+Tab で最後へ');
          logFocus(ctx, 'Shift+Tab');
          // WebKitGTK の Shift+Tab(key='Unidentified'・keyCode 9)も同じ(段階 3-2)。
          await keyOn(ctx, null, { key: 'Tab' });
          await keyOn(ctx, null, { key: 'Unidentified', keyCode: 9, shiftKey: true });
          logFocus(ctx, 'WebKitGTK の Shift+Tab');
          // 外(グリッドのセル)を押すと閉じる。
          await ctx.act(() => {
            fireEvent.pointerDown(ctx.cell(1, 'name'), pointer);
            fireEvent.pointerUp(window, pointer);
          });
          ctx.snapshot('セルを押して閉じた');
          // ハンドルで開き、Escape で閉じる。
          await ctx.act(() => {
            call(ctx, 'openFilterManager');
          });
          await keyOn(ctx, null, { key: 'Escape' });
          ctx.snapshot('Escape で閉じた');
        },
      });
    },
    30_000,
  );
});