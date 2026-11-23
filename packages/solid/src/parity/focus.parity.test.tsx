// React 版の結合テストのうち、Solid 版でまだ同じ場面を見ていなかったフォーカス・キー・ポインタの場面を、React 版と比べる
//   テストへ移した(段階 4-1。docs/audits/2026-11-22-solid-quality/test-inventory.md)。React 版の元のテストは packages/react/src の
//   SpreadsheetGrid.escapeInDialog / filterEscape / renderHeaderControls / rowHover / menuKeyboard / editFocus の各
//   integration.test.tsx。ダイアログの部品の聞き方(window / document の capture、外側の要素のフレームワークのハンドラ)も
//   React 版のテストと同じ形で置く。
import { afterAll, beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { createElement } from 'react';
import { onSettled } from 'solid-js';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type Framework, type ParityContext } from './harness';

type Row = { id: number; name: string; qty: number; memo: string; day: string };

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `品目 ${i + 1}`,
    qty: (i + 1) * 10,
    memo: `メモ ${i + 1}`,
    day: `2026-0${(i % 9) + 1}-1${i % 10}`,
  }));

const pointer = { button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse' };

beforeAll(async () => {
  installJsdomLayoutStubs({ width: 900, height: 400 });
  // React 版はポップオーバーの部品を遅れて読み込むので、先に読んでおく(開いた直後に同じ DOM を比べるため)。
  const reactLite = (await import(/* @vite-ignore */ new URL('../../../react/src/lite.ts', import.meta.url).pathname)) as {
    preloadGridPopups: () => Promise<void>;
  };
  await reactLite.preloadGridPopups();
});

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);
const focused = (): Element => document.activeElement ?? document.body;
const clickCell = async (ctx: ParityContext, row: number, key: string) => {
  await ctx.act(() => {
    fireEvent.pointerDown(ctx.cell(row, key), pointer);
    fireEvent.pointerUp(window, pointer);
  });
};
const keyOn = async (ctx: ParityContext, target: Element | null | undefined, init: KeyboardEventInit & { key: string }) => {
  await ctx.act(() => {
    fireEvent.keyDown(target ?? focused(), init);
  });
};
const editorInput = (ctx: ParityContext): HTMLInputElement => {
  const element = ctx.container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
  if (!element) {
    throw new Error(`[${ctx.framework}] エディタがありません`);
  }
  return element;
};
const menuItem = (label: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((el) => el.textContent?.includes(label));
// ⋮(列メニュー)をマウスで押す。
const pressColumnMenu = async (ctx: ParityContext, key: string) => {
  await ctx.act(() => {
    const button = ctx.header(key).querySelector<HTMLButtonElement>('[data-ssg-tooltip="列メニュー"]');
    if (!button) {
      throw new Error(`[${ctx.framework}] ⋮ がありません: ${key}`);
    }
    fireEvent.pointerDown(button, pointer);
    fireEvent.pointerUp(button, pointer);
    fireEvent.click(button, { detail: 1 });
  });
};
const openFilter = async (ctx: ParityContext, key: string) => {
  await pressColumnMenu(ctx, key);
  await ctx.act(() => {
    const item = menuItem('フィルター…');
    if (!item) {
      throw new Error(`[${ctx.framework}] 「フィルター…」がありません`);
    }
    fireEvent.click(item, { detail: 1 });
  });
};

describe('ダイアログの中の Escape(AP-17)', () => {
  // jsdom には navigator.clipboard が無いので、書き込みは成功したことにする(コピー範囲の点線はコピーに成功したときだけ)。
  beforeAll(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });
  });
  afterAll(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('編集・範囲の選択・列フィルター・コピーの点線・右クリックメニュー・マウスで開いた列メニューの Escape', async () => {
    await expectParity({
      // コピー範囲の点線は motionExtras の機能(React 版の元のテストは全部入り)。
      features: ['filtering', 'columnMenu', 'contextMenu', 'motionExtras'],
      // React Aria(HeroUI)のモーダルのように、外側の要素がフレームワークのイベントで Escape を聞く形。
      wrapperEvents: ['onKeyDown'],
      props: () => ({
        rows: makeRows(3),
        columns: [
          { key: 'name', title: '名前', width: 160, filterType: 'set' },
          { key: 'id', title: 'ID', width: 80 },
        ],
        rowKeyGetter: (row: Row) => row.id,
        enableColumnFilter: true,
        enableContextMenu: true,
        getContextMenuItems: () => [{ kind: 'action', id: 'a', label: 'A', onSelect: () => {} }],
      }),
      steps: async (ctx) => {
        // Radix / Headless UI(document の capture、preventDefault 済みなら閉じない)と Mantine(window の capture、
        //   対象の要素の data-mantine-stop-propagation を見る)のダイアログの聞き方。
        const closed = { radix: 0, mantine: 0 };
        const onDocument = (event: KeyboardEvent) => {
          if (event.key === 'Escape' && !event.defaultPrevented) {
            closed.radix += 1;
          }
        };
        const onWindow = (event: KeyboardEvent) => {
          const target = event.target as Element | null;
          if (event.key === 'Escape' && target?.getAttribute?.('data-mantine-stop-propagation') !== 'true') {
            closed.mantine += 1;
          }
        };
        document.addEventListener('keydown', onDocument, true);
        window.addEventListener('keydown', onWindow, true);
        const logClosed = (label: string) => ctx.log(`${label}: 閉じたダイアログ`, { ...closed });
        try {
          // 編集中の Escape は編集だけを取り消す。
          await clickCell(ctx, 0, 'name');
          await keyOn(ctx, null, { key: 'F2' });
          ctx.snapshot('編集を開いた');
          await keyOn(ctx, editorInput(ctx), { key: 'Escape' });
          ctx.snapshot('編集の Escape');
          logClosed('編集の Escape');

          // 範囲を選んでいるときは選択を外すだけ。印(data-mantine-stop-propagation)は次のタスクで外れる。
          await ctx.act(() => {
            call(ctx, 'selectRange', { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
          });
          await keyOn(ctx, ctx.shell(), { key: 'Escape' });
          ctx.log('範囲の Escape の後の選択', call(ctx, 'getSelection'));
          ctx.snapshot('範囲の Escape(印が外れた後)');
          logClosed('範囲の Escape');
          // 1 セルを選んでいるだけならダイアログが閉じる。
          await clickCell(ctx, 1, 'name');
          await keyOn(ctx, ctx.shell(), { key: 'Escape' });
          logClosed('1 セルの Escape');

          // 列フィルターのポップオーバーの中の Escape はポップオーバーだけを閉じる。
          await openFilter(ctx, 'name');
          ctx.snapshot('列フィルターを開いた');
          await ctx.act(() => {
            document.querySelector<HTMLElement>('.ssg-filter-popover input[type="checkbox"]')?.focus();
          });
          await keyOn(ctx, null, { key: 'Escape' });
          ctx.snapshot('列フィルターの Escape');
          logClosed('列フィルターの Escape');

          // コピー範囲の点線を出しているときは点線を消すだけ(1 セルのコピーでも)。
          await clickCell(ctx, 0, 'name');
          await keyOn(ctx, ctx.shell(), { key: 'c', ctrlKey: true });
          ctx.snapshot('1 セルをコピー');
          await keyOn(ctx, ctx.shell(), { key: 'Escape' });
          ctx.snapshot('点線の Escape');
          logClosed('点線の Escape');
          await keyOn(ctx, ctx.shell(), { key: 'Escape' });
          logClosed('点線を消した後の Escape');

          // 右クリックメニュー(フォーカスは body)の Escape はメニューだけを閉じる。
          await ctx.act(() => {
            fireEvent.contextMenu(ctx.cell(1, 'name'), { clientX: 10, clientY: 10 });
          });
          ctx.snapshot('右クリックメニュー');
          await keyOn(ctx, document.body, { key: 'Escape' });
          ctx.snapshot('右クリックメニューの Escape');
          logClosed('右クリックメニューの Escape');
          // マウスで開いた列メニュー(フォーカスを外してから)も。
          await pressColumnMenu(ctx, 'name');
          await ctx.act(() => {
            (document.activeElement as HTMLElement | null)?.blur();
          });
          ctx.snapshot('列メニュー(フォーカスを外した)');
          await keyOn(ctx, document.body, { key: 'Escape' });
          ctx.snapshot('列メニューの Escape');
          logClosed('列メニューの Escape');
          await keyOn(ctx, document.body, { key: 'Escape' });
          logClosed('メニューを閉じた後の Escape');
        } finally {
          document.removeEventListener('keydown', onDocument, true);
          window.removeEventListener('keydown', onWindow, true);
        }
      },
    });
  });

  it('列フィルター(dateSet)の日付欄で Escape: 打ちかけの日付を確定せずに閉じ、フォーカスはその場でグリッドへ', async () => {
    await expectParity({
      features: ['filtering', 'columnMenu'],
      watch: ['onFiltersChange'],
      props: () => ({
        rows: makeRows(4),
        columns: [
          { key: 'id', title: 'ID', width: 80 },
          { key: 'day', title: '日付', width: 160, filterType: 'dateSet' },
        ],
        rowKeyGetter: (row: Row) => row.id,
      }),
      steps: async (ctx) => {
        await openFilter(ctx, 'day');
        await ctx.act(() => {
          const select = document.querySelector<HTMLSelectElement>('.ssg-filter-popover select');
          if (!select) {
            throw new Error(`[${ctx.framework}] 演算子の欄がありません`);
          }
          fireEvent.change(select, { target: { value: 'onOrAfter' } });
        });
        await ctx.act(() => {
          const input = document.querySelector<HTMLInputElement>('.ssg-filter-popover .ssg-dp-input');
          if (!input) {
            throw new Error(`[${ctx.framework}] 日付の欄がありません`);
          }
          input.focus();
          fireEvent.input(input, { target: { value: '2026/7/1' } });
        });
        ctx.snapshot('打ちかけの日付');
        // フレームを待たずに見る(React 版の元のテストと同じく、フォーカスはその場で戻る)。
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'Escape' });
        }, 0);
        ctx.snapshot('Escape の直後');
        await ctx.act(() => {});
        ctx.snapshot('Escape のフレームの後');
      },
    });
  });
});

describe('renderHeader の中の操作要素と列の範囲選択(V-16)', () => {
  it('ボタン / 入力欄の pointerdown では列を選ばず既定の動作も止めない。ラベルでは列を選ぶ', async () => {
    const header = (framework: Framework) =>
      framework === 'react'
        ? () =>
            createElement(
              'span',
              null,
              createElement('span', { 'data-part': 'label' }, '名前'),
              createElement('button', { type: 'button', 'data-part': 'button' }, '★'),
              createElement('input', { 'data-part': 'input', 'aria-label': '絞り込み' }),
            )
        : () => (
            <span>
              <span data-part="label">名前</span>
              <button type="button" data-part="button">
                ★
              </button>
              <input data-part="input" aria-label="絞り込み" />
            </span>
          );
    await expectParity({
      watch: ['onActiveCellChange'],
      props: (framework) => ({
        rows: makeRows(3),
        columns: [
          { key: 'name', title: '名前', width: 160, renderHeader: header(framework) },
          { key: 'qty', title: '数量', width: 100 },
        ],
        rowKeyGetter: (row: Row) => row.id,
      }),
      steps: async (ctx) => {
        for (const part of ['button', 'input', 'label']) {
          await ctx.act(() => {
            const target = ctx.header('name').querySelector(`[data-part="${part}"]`);
            if (!target) {
              throw new Error(`[${ctx.framework}] 見出しの部品がありません: ${part}`);
            }
            ctx.log(`${part} の既定の動作を止めなかったか`, fireEvent.pointerDown(target, pointer));
            fireEvent.pointerUp(window, pointer);
          });
          ctx.log(`${part} の後の選択`, call(ctx, 'getSelection'));
          ctx.snapshot(`${part} を押した`);
        }
      },
    });
  });
});

describe('行ホバー(onHoveredRowChange / hoveredRowIndex / enableRowHover)', () => {
  const leaveShell = (ctx: ParityContext) =>
    ctx.act(() => {
      fireEvent.pointerLeave(ctx.shell(), pointer);
      fireEvent.pointerOut(ctx.shell(), pointer);
    });

  it('uncontrolled: 同じ行の中では通知しない・シェルを出ると null', async () => {
    await expectParity({
      watch: ['onHoveredRowChange'],
      props: () => ({ rows: makeRows(4), columns: [{ key: 'name', title: '名前', width: 160 }, { key: 'qty', title: '数量', width: 100 }], rowKeyGetter: (row: Row) => row.id }),
      steps: async (ctx) => {
        await ctx.act(() => ctx.hover(ctx.cell(1, 'name')));
        ctx.snapshot('2 行目');
        await ctx.act(() => ctx.hover(ctx.cell(1, 'qty')));
        await ctx.act(() => ctx.hover(ctx.cell(2, 'name')));
        ctx.snapshot('3 行目');
        await leaveShell(ctx);
        ctx.snapshot('シェルを出た');
      },
    });
  });

  it('controlled: prop の行を強調し、ポインタでは動かない(通知はする)・null・enableRowHover={false}', async () => {
    await expectParity({
      watch: ['onHoveredRowChange'],
      props: () => ({
        rows: makeRows(4),
        columns: [{ key: 'name', title: '名前', width: 160 }, { key: 'qty', title: '数量', width: 100 }],
        rowKeyGetter: (row: Row) => row.id,
        hoveredRowIndex: 1,
      }),
      steps: async (ctx) => {
        ctx.snapshot('prop の 2 行目');
        await ctx.act(() => ctx.hover(ctx.cell(0, 'name')));
        ctx.snapshot('1 行目へポインタ(そのまま)');
        await ctx.setProps({ hoveredRowIndex: 2 });
        ctx.snapshot('prop を 3 行目へ');
        await ctx.setProps({ hoveredRowIndex: null });
        ctx.snapshot('prop を null へ');
        await ctx.setProps({ hoveredRowIndex: undefined, enableRowHover: false });
        await ctx.act(() => ctx.hover(ctx.cell(3, 'name')));
        ctx.snapshot('enableRowHover={false} でポインタ');
      },
    });
  });
});

describe('キーボードで開く右クリックメニュー(AP-33)', () => {
  const menuItems = () => [
    { kind: 'action', id: 'copy', label: 'コピー', onSelect: () => {} },
    { kind: 'separator' },
    { kind: 'action', id: 'remove', label: '削除', onSelect: () => {} },
  ];
  // キーボードの contextmenu(button 0)/ 右クリック(button 2)を送り、既定の動作を止めたかを控える。
  const contextmenu = (ctx: ParityContext, target: Element, button: number, label: string) =>
    ctx.act(() => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button });
      target.dispatchEvent(event);
      ctx.log(`${label}: 止めたか`, event.defaultPrevented);
    });
  const props = (overrides: Record<string, unknown> = {}) => () => ({
    rows: makeRows(3),
    columns: [
      { key: 'name', title: '名前', width: 160 },
      { key: 'qty', title: '数量', width: 100 },
    ],
    rowKeyGetter: (row: Row) => row.id,
    enableContextMenu: true,
    getContextMenuItems: menuItems,
    ...overrides,
  });

  it('メニューキー・キーで開いた直後のキーボードの contextmenu は 1 回だけ止める・割り込みの後は止めない・keydown を経ない contextmenu', async () => {
    await expectParity({
      features: ['contextMenu'],
      watch: ['getContextMenuItems', 'onContextMenuOpen'],
      props: props(),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'setActiveCell', { row: 0, col: 0 });
        });
        await keyOn(ctx, ctx.shell(), { key: 'ContextMenu' });
        ctx.snapshot('メニューキーで開いた');
        // 右クリックと、keyup の後でない遅れたキーボードの contextmenu(表の外)。
        await contextmenu(ctx, document.body, 2, '表の外の右クリック');
        await contextmenu(ctx, document.body, 0, '表の外のキーボードの contextmenu(1 回目)');
        await keyOn(ctx, null, { key: 'Escape' });
        await ctx.act(() => ctx.shell().focus());
        await keyOn(ctx, ctx.shell(), { key: 'ContextMenu' });
        await contextmenu(ctx, document.body, 0, 'キーの直後の contextmenu');
        await contextmenu(ctx, document.body, 0, 'その次の contextmenu');
        await keyOn(ctx, null, { key: 'Escape' });
        ctx.snapshot('閉じた');

        // 開いた後に別のキー操作かポインタの押し下げがあれば、次のキーボードの contextmenu は止めない。
        const outside = document.createElement('input');
        document.body.append(outside);
        try {
          for (const interrupt of ['keydown', 'pointerdown']) {
            await ctx.act(() => ctx.shell().focus());
            await keyOn(ctx, ctx.shell(), { key: 'F10', shiftKey: true });
            await ctx.act(() => {
              if (interrupt === 'keydown') {
                fireEvent.keyDown(outside, { key: 'F10', shiftKey: true });
              } else {
                fireEvent.pointerDown(outside, pointer);
              }
            });
            await contextmenu(ctx, outside, 0, `${interrupt} の後の contextmenu`);
            await keyOn(ctx, null, { key: 'Escape' });
          }
        } finally {
          outside.remove();
        }

        // keydown を経ずに来たキーボードの contextmenu でもアクティブセルのメニューを開く。
        await ctx.act(() => {
          call(ctx, 'setActiveCell', { row: 2, col: 0 });
        });
        await contextmenu(ctx, ctx.shell(), 0, 'シェルのキーボードの contextmenu');
        ctx.snapshot('keydown を経ない contextmenu で開いた');
        await keyOn(ctx, null, { key: 'Escape' });
      },
    });
  });

  it.each([
    ['項目が無い', { getContextMenuItems: () => [] }, true],
    ['アクティブセルが無い', {}, false],
    ['enableContextMenu が無い', { enableContextMenu: false }, true],
  ] as const)('%s ときは開かず標準のメニューのまま', async (_label, overrides, withActiveCell) => {
    await expectParity({
      features: ['contextMenu'],
      watch: ['getContextMenuItems', 'onContextMenuOpen'],
      props: props(overrides),
      steps: async (ctx) => {
        if (withActiveCell) {
          await ctx.act(() => {
            call(ctx, 'setActiveCell', { row: 0, col: 0 });
          });
        }
        await ctx.act(() => {
          const keydown = new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true });
          ctx.shell().dispatchEvent(keydown);
          ctx.log('Shift+F10 を止めたか', keydown.defaultPrevented);
        });
        await contextmenu(ctx, ctx.shell(), 0, '続くキーボードの contextmenu');
        ctx.snapshot('開かない');
      },
    });
  });

  it('シェルの中の検索欄でのキーボードの contextmenu は標準のメニューのまま', async () => {
    await expectParity({
      features: ['contextMenu', 'filtering'],
      watch: ['getContextMenuItems'],
      props: props({ enableGlobalFilter: true }),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'setActiveCell', { row: 0, col: 0 });
        });
        const search = ctx.container.querySelector('.ssg-bar-input');
        if (!search) {
          throw new Error(`[${ctx.framework}] 検索欄がありません`);
        }
        await contextmenu(ctx, search, 0, '検索欄のキーボードの contextmenu');
        ctx.snapshot('開かない');
      },
    });
  });
});

describe('編集を確定した後のフォーカス(editFocus)', () => {
  const columns = [
    { key: 'name', title: '名前', width: 160 },
    { key: 'memo', title: 'メモ', width: 160 },
  ];
  const startEditing = async (ctx: ParityContext, row: number, key: string, value: string) => {
    await clickCell(ctx, row, key);
    await keyOn(ctx, null, { key: 'F2' });
    await ctx.act(() => {
      fireEvent.input(editorInput(ctx), { target: { value } });
    });
  };

  it.each([
    ['imeDirectInput なし', false],
    ['imeDirectInput あり', true],
  ] as const)('外の入力欄・上部バーの検索欄・Enter / Tab(フレームの前)・Escape・別のセル・行番号(%s)', async (_label, imeDirectInput) => {
    await expectParity({
      features: imeDirectInput ? ['filtering', 'imeDirectInput'] : ['filtering'],
      watch: ['onRowsChange', 'onActiveCellChange'],
      props: () => ({
        rows: makeRows(4),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        imeDirectInput,
        enableGlobalFilter: true,
      }),
      steps: async (ctx) => {
        const outside = document.createElement('input');
        document.body.append(outside);
        try {
          // グリッドの外の入力欄へ移ると、値は確定してフォーカスはその入力欄に残る。
          await startEditing(ctx, 0, 'name', 'abc');
          await ctx.act(() => outside.focus());
          ctx.snapshot('外の入力欄へ');
          // 上部バーの検索欄も同じ。
          await startEditing(ctx, 1, 'name', 'xyz');
          await ctx.act(() => ctx.container.querySelector<HTMLInputElement>('.ssg-bar-input')?.focus());
          ctx.snapshot('上部バーの検索欄へ');
        } finally {
          outside.remove();
        }
        // Enter / Tab で確定した直後(次のフレームの前)からグリッドがフォーカスを持ち、移動も済んでいる。
        await startEditing(ctx, 0, 'name', 'fast');
        await ctx.act(() => {
          fireEvent.keyDown(editorInput(ctx), { key: 'Enter' });
        }, 0);
        ctx.log('Enter の直後のアクティブセル', call(ctx, 'getActiveCell'));
        ctx.snapshot('Enter の直後');
        await ctx.act(() => {});
        if (!imeDirectInput) {
          await ctx.act(() => {
            fireEvent.keyDown(focused(), { key: 'x' });
          }, 0);
          await ctx.act(() => {
            fireEvent.input(editorInput(ctx), { target: { value: 'next' } });
          }, 0);
          await ctx.act(() => {
            fireEvent.keyDown(editorInput(ctx), { key: 'Tab' });
          }, 0);
          ctx.log('Tab の直後のアクティブセル', call(ctx, 'getActiveCell'));
          ctx.snapshot('打ち始めて Tab の直後');
          await ctx.act(() => {});
        }
        // Escape で取り消すとグリッドへ戻る。
        await startEditing(ctx, 2, 'name', 'cancelled');
        await keyOn(ctx, editorInput(ctx), { key: 'Escape' });
        ctx.snapshot('Escape');
        // グリッドの中の別のセルを押して確定すると、押したセルがアクティブ。
        await startEditing(ctx, 0, 'name', 'moved');
        await clickCell(ctx, 2, 'memo');
        ctx.log('別のセルの後の選択', call(ctx, 'getSelection'));
        ctx.snapshot('別のセルを押した');
        // 行番号を押して確定したときは、その行の選択を編集していたセルへ戻さない。
        await startEditing(ctx, 0, 'name', 'row');
        await ctx.act(() => {
          const rowHeader = ctx.container.querySelector('.ssg-body-row[data-row-index="1"] .ssg-row-header-cell');
          if (!rowHeader) {
            throw new Error(`[${ctx.framework}] 行番号がありません`);
          }
          fireEvent.pointerDown(rowHeader, pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.log('行番号の後の選択', call(ctx, 'getSelection'));
        ctx.snapshot('行番号を押した');
      },
    });
  });

  it('onBlur で遅れて ctx.commit する custom エディタ(AP-11): 別のセルを押した後に届いた値を、編集していたセルに書く', async () => {
    type EditorContext = { initialText: string; commit: (value: unknown) => unknown };
    const onBlur = (ctx: EditorContext) => (event: { currentTarget: EventTarget }) => {
      const value = (event.currentTarget as HTMLInputElement).value;
      setTimeout(() => ctx.commit(value), 10);
    };
    const render = (framework: Framework) =>
      framework === 'react'
        ? (ctx: EditorContext) =>
            createElement('input', { className: 'custom-editor', autoFocus: true, defaultValue: ctx.initialText, onBlur: onBlur(ctx) })
        : (ctx: EditorContext) => {
            let input: HTMLInputElement | undefined;
            onSettled(() => input?.focus());
            return (
              <input
                ref={(element) => {
                  input = element;
                }}
                class="custom-editor"
                value={ctx.initialText}
                onBlur={onBlur(ctx)}
              />
            );
          };
    await expectParity({
      watch: ['onRowsChange'],
      props: (framework) => ({
        rows: makeRows(4),
        columns: [{ ...columns[0], editor: { type: 'custom', render: render(framework) } }, columns[1]],
        rowKeyGetter: (row: Row) => row.id,
      }),
      steps: async (ctx) => {
        await clickCell(ctx, 0, 'name');
        await keyOn(ctx, null, { key: 'F2' });
        await ctx.act(() => {
          const input = ctx.container.querySelector<HTMLInputElement>('.custom-editor');
          if (!input) {
            throw new Error(`[${ctx.framework}] custom の入力欄がありません`);
          }
          fireEvent.input(input, { target: { value: 'draft' } });
        });
        ctx.snapshot('打った');
        await clickCell(ctx, 2, 'memo');
        await ctx.act(() => {}, 100);
        ctx.snapshot('別のセルを押して値が届いた');
        // 変更(1.4.1 / AP-11): 値が届いた後も、押したセルがアクティブのまま(1.4.0 までは編集していたセルへ戻っていた)。
        ctx.log('値が届いた後のアクティブセル', call(ctx, 'getActiveCell'));
      },
    });
  });

  // 追加(1.4.1 / AP-11): onBlur で確定しない作り(none)と、マイクロタスクで確定する作り。押したらグリッドが編集を終え、
  //   キー操作が効く。マイクロタスクの確定は編集していたセルへ書く。
  it.each(['none', 'microtask'] as const)(
    '開いたままの custom エディタ(AP-11、onBlur: %s): 別のセルを押すとエディタが閉じ、キー操作が効く',
    async (timing) => {
      type EditorContext = { initialText: string; commit: (value: unknown) => unknown };
      const onBlur = (ctx: EditorContext) => (event: { currentTarget: EventTarget }) => {
        const value = (event.currentTarget as HTMLInputElement).value;
        if (timing === 'microtask') {
          queueMicrotask(() => ctx.commit(value));
        }
      };
      const render = (framework: Framework) =>
        framework === 'react'
          ? (ctx: EditorContext) =>
              createElement('input', { className: 'custom-editor', autoFocus: true, defaultValue: ctx.initialText, onBlur: onBlur(ctx) })
          : (ctx: EditorContext) => {
              let input: HTMLInputElement | undefined;
              onSettled(() => input?.focus());
              return (
                <input
                  ref={(element) => {
                    input = element;
                  }}
                  class="custom-editor"
                  value={ctx.initialText}
                  onBlur={onBlur(ctx)}
                />
              );
            };
      await expectParity({
        watch: ['onRowsChange'],
        props: (framework) => ({
          rows: makeRows(4),
          columns: [{ ...columns[0], editor: { type: 'custom', render: render(framework) } }, columns[1]],
          rowKeyGetter: (row: Row) => row.id,
        }),
        steps: async (ctx) => {
          await clickCell(ctx, 0, 'name');
          await keyOn(ctx, null, { key: 'F2' });
          await ctx.act(() => {
            const input = ctx.container.querySelector<HTMLInputElement>('.custom-editor');
            if (!input) {
              throw new Error(`[${ctx.framework}] custom の入力欄がありません`);
            }
            fireEvent.input(input, { target: { value: 'draft' } });
          });
          await clickCell(ctx, 2, 'memo');
          await ctx.act(() => {}, 50);
          ctx.log('エディタ', ctx.container.querySelector('.custom-editor') === null ? 'なし' : 'あり');
          ctx.snapshot('別のセルを押した');
          await keyOn(ctx, null, { key: 'ArrowUp' });
          ctx.log('矢印の後のアクティブセル', call(ctx, 'getActiveCell'));
          await keyOn(ctx, null, { key: 'F2' });
          ctx.log('F2 の後のエディタ', ctx.container.querySelector('.ssg-cell-editor-input') === null ? 'なし' : 'あり');
        },
      });
    },
  );
});
// 追加(React 版 1.3.0 / Solid 版 0.1.2、品質の段 2 S5-02): 日付のプリセットのチップを押すと日付の入力欄が消え、フォーカスが
//   body へ落ちて Escape でポップオーバーが閉じなかった。チップへフォーカスを置く(core controllers/popoverSupport の
//   keepFocusAfterPress)。
describe('日付のプリセットを押した後のフォーカス(S5-02)', () => {
  it('入力欄にフォーカスがあるままチップを押すとチップへ移り、Escape で閉じる', async () => {
    await expectParity({
      features: ['filtering', 'columnMenu'],
      props: () => ({
        rows: makeRows(5),
        columns: [
          { key: 'name', title: '名前', width: 160 },
          { key: 'day', title: '日付', width: 140, filterType: 'dateSet' },
        ],
        rowKeyGetter: (row: Row) => row.id,
        enableColumnFilter: true,
      }),
      steps: async (ctx) => {
        await openFilter(ctx, 'day');
        const input = document.querySelector<HTMLInputElement>('.ssg-filter-popover .ssg-dp-input');
        await ctx.act(() => {
          input?.focus();
        });
        if (document.activeElement !== input) {
          throw new Error(`[${ctx.framework}] 日付の入力欄にフォーカスがありません`);
        }
        ctx.snapshot('日付の入力欄にフォーカス');
        const chip = document.querySelector<HTMLButtonElement>('.ssg-filter-popover .ssg-filter-preset-chip');
        await ctx.act(() => {
          if (chip) {
            fireEvent.pointerDown(chip, pointer);
            fireEvent.pointerUp(chip, pointer);
          }
        });
        if (document.activeElement !== chip) {
          throw new Error(`[${ctx.framework}] チップへフォーカスが移っていません: ${document.activeElement?.tagName}`);
        }
        ctx.snapshot('チップを押した(入力欄は消え、フォーカスはチップ)');
        await keyOn(ctx, focused(), { key: 'Escape' });
        if (document.querySelector('.ssg-filter-popover') !== null) {
          throw new Error(`[${ctx.framework}] Escape で閉じていません`);
        }
        ctx.snapshot('Escape で閉じた');
      },
    });
  }, 30_000);
});
// 追加(React 版 1.3.0 / Solid 版 0.1.2、品質の段 2 の確かめ直し): 右クリックメニューの項目の onSelect でツールパネルを開くと、
//   Solid 版ではパネルのタブへ移ったフォーカスを、続けて閉じたメニューの「グリッドへ戻す」が奪っていた(Solid 版は利用者の
//   onSelect を自分のフレームで呼ぶ = 0.1.1 の S4-21 の修正 = ので、閉じる前にパネルが描かれる。React 版は開いた後の effect で
//   移すので閉じた後になる)。メニューを閉じるときは、項目が開いたツールパネル / 列フィルターにあるフォーカスを動かさない
//   (core controllers/popoverSupport の isFocusInPopupOpenedFromMenu)。
describe('メニューの項目から開いたツールパネルのフォーカス', () => {
  it('右クリックメニューの項目の onSelect で開いたツールパネル・列メニューの「並び替えを管理…」で開いたツールパネルはタブにフォーカス', async () => {
    let current: ParityContext | null = null;
    await expectParity({
      features: ['filtering', 'columnMenu', 'contextMenu', 'toolPanel'],
      props: () => ({
        rows: makeRows(3),
        columns: [
          { key: 'name', title: '名前', width: 160, filterType: 'set' },
          { key: 'qty', title: '数量', width: 100 },
        ],
        rowKeyGetter: (row: Row) => row.id,
        enableColumnFilter: true,
        enableContextMenu: true,
        getContextMenuItems: () => [
          {
            kind: 'action',
            id: 'filters',
            label: 'フィルターを管理',
            onSelect: () => {
              if (current) {
                call(current, 'openFilterManager');
              }
            },
          },
        ],
      }),
      steps: async (ctx) => {
        current = ctx;
        try {
          await clickCell(ctx, 0, 'name');
          await keyOn(ctx, ctx.shell(), { key: 'F10', shiftKey: true });
          ctx.snapshot('右クリックメニューを開いた');
          await ctx.act(() => {
            const item = menuItem('フィルターを管理');
            if (!item) {
              throw new Error(`[${ctx.framework}] 「フィルターを管理」がありません`);
            }
            fireEvent.click(item, { detail: 1 });
          }, 100);
          ctx.snapshot('右クリックメニューの項目でツールパネルを開いた(フォーカスはタブ)');
          await keyOn(ctx, null, { key: 'Escape' });
          ctx.snapshot('ツールパネルの Escape(フォーカスはグリッド)');

          await pressColumnMenu(ctx, 'qty');
          await ctx.act(() => {
            const item = menuItem('並び替えを管理…');
            if (!item) {
              throw new Error(`[${ctx.framework}] 「並び替えを管理…」がありません`);
            }
            fireEvent.click(item, { detail: 1 });
          }, 100);
          ctx.snapshot('列メニューの項目でツールパネルを開いた(フォーカスはタブ)');
          await keyOn(ctx, null, { key: 'Escape' });
          ctx.snapshot('閉じた');
        } finally {
          current = null;
        }
      },
    });
  }, 30_000);
});