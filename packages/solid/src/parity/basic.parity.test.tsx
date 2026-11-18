// React 版(機能なしの /lite)と Solid 版を同じ props・同じ操作で動かして、DOM と通知が同じかを見る(段階 1)。
import { beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity } from './harness';

type Row = { id: number; name: string; qty: number; note: string };

const columns = [
  { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 120 },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' } },
  { key: 'note', title: 'メモ', width: 160 },
];

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}`, qty: i * 10, note: '' }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

describe('React 版と同じ DOM と通知', () => {
  it('最初の描画・クリック・矢印キー', async () => {
    await expectParity({
      props: () => ({ rows: makeRows(50), columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      watch: ['onActiveCellChange', 'onRowsChange'],
      steps: async (ctx) => {
        ctx.snapshot('最初');
        await ctx.act(() => {
          const target = ctx.cell(1, 'name');
          fireEvent.pointerDown(target, { button: 0, pointerId: 1, isPrimary: true });
          fireEvent.pointerUp(target, { button: 0, pointerId: 1, isPrimary: true });
        });
        ctx.snapshot('クリック');
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'ArrowDown' });
        });
        ctx.snapshot('ArrowDown');
      },
    });
  });

  it('Shift + 見出しのソートと列幅のドラッグ', async () => {
    await expectParity({
      props: () => ({ rows: makeRows(20), columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      watch: ['onSortChange', 'onStateChange', 'onColumnsChange'],
      steps: async (ctx) => {
        const sortBy = async (key: string) => {
          await ctx.act(() => {
            const header = ctx.header(key);
            fireEvent.pointerDown(header, { button: 0, pointerId: 1, isPrimary: true, shiftKey: true });
            fireEvent.pointerUp(window, { button: 0, pointerId: 1, isPrimary: true, shiftKey: true });
          });
        };
        await sortBy('qty');
        ctx.snapshot('昇順');
        await sortBy('qty');
        ctx.snapshot('降順');
        await ctx.act(() => {
          const handle = ctx.header('name').querySelector('.ssg-header-resize');
          if (!handle) {
            throw new Error('列幅のつまみがありません');
          }
          fireEvent.pointerDown(handle, { button: 0, pointerId: 1, isPrimary: true, clientX: 300 });
          fireEvent.pointerMove(window, { button: 0, pointerId: 1, isPrimary: true, clientX: 360 });
          fireEvent.pointerUp(window, { button: 0, pointerId: 1, isPrimary: true, clientX: 360 });
        });
        ctx.snapshot('列幅');
      },
    });
  });

  it('セルの描き方(renderCell / valueFormatter / メモ / 入力の検査 / チェックボックス / class)', async () => {
    type Item = { id: number; name: string; qty: number; done: boolean; note: string };
    const items: Item[] = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      name: `品目 ${i + 1}`,
      qty: i * 10,
      done: i % 2 === 0,
      note: i === 1 ? 'とても長いメモの文字です' : '',
    }));
    await expectParity({
      props: () => ({
        rows: items,
        rowKeyGetter: (row: Item) => row.id,
        height: 300,
        columns: [
          { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
          {
            key: 'name',
            title: '品名',
            width: 120,
            renderHeader: (ctx: { column: { title?: string } }) => `【${ctx.column.title}】`,
            cellClassName: (ctx: { row: Item }) => (ctx.row.id === 2 ? 'is-two' : undefined),
            cellNote: (ctx: { row: Item }) => (ctx.row.id === 3 ? 'メモです' : undefined),
          },
          {
            key: 'qty',
            title: '数量',
            width: 80,
            align: 'right',
            editor: { type: 'number' },
            validate: (ctx: { value: unknown }) => ((ctx.value as number) >= 30 ? '30 未満にしてください' : true),
            valueFormatter: (ctx: { value: unknown }) => `${String(ctx.value)} 個`,
          },
          { key: 'done', title: '済', width: 60, editor: { type: 'checkbox' } },
          {
            key: 'label',
            title: 'ラベル',
            width: 100,
            renderCell: (ctx: { rowKey: unknown; row: Item }) => `#${String(ctx.rowKey)}:${ctx.row.name}`,
          },
          { key: 'note', title: 'メモ', width: 100, pinned: 'right', tooltip: true },
        ],
        classNames: {
          root: 'my-root',
          toolbar: 'my-top',
          statusBar: 'my-bottom',
          headerRow: 'my-header-row',
          headerCell: 'my-header-cell',
          bodyRow: 'my-row',
          bodyCell: { className: 'my-cell' },
          rowHeaderCell: 'my-row-header',
        },
        getRowClassName: (row: Item) => (row.id % 2 === 0 ? 'is-even' : undefined),
      }),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        ctx.snapshot('最初');
        await ctx.act(() => {
          const checkbox = ctx.cell(0, 'done').querySelector('.ssg-cell-checkbox');
          if (!checkbox) {
            throw new Error('チェックボックスがありません');
          }
          fireEvent.click(checkbox);
        });
        ctx.snapshot('チェックを外す');
        await ctx.act(() => {
          ctx.hover(ctx.cell(2, 'name'));
        });
        ctx.snapshot('ホバー');
      },
    });
  });

  it('テーマ・密度・読み取り専用・空の表', async () => {
    await expectParity({
      props: () => ({
        rows: [],
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 240,
        theme: 'dark',
        density: 'compact',
        readOnly: true,
        dimReadOnlyCells: true,
        ariaLabel: '在庫',
        noRowsText: '行がありません',
        motion: 'off',
      }),
      steps: async (ctx) => {
        ctx.snapshot('空');
        await ctx.setProps({ rows: makeRows(5) });
        ctx.snapshot('行あり');
        await ctx.setProps({ theme: 'light', density: 'comfortable', readOnly: false, motion: 'on' });
        ctx.snapshot('切り替え');
      },
    });
  });

  it('選択(角 / 行番号 / 列見出し / Shift で範囲)と下のバー', async () => {
    await expectParity({
      props: () => ({ rows: makeRows(30), columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      watch: ['onActiveCellChange'],
      steps: async (ctx) => {
        const press = async (target: Element, init: Record<string, unknown> = {}) => {
          await ctx.act(() => {
            fireEvent.pointerDown(target, { button: 0, pointerId: 1, isPrimary: true, ...init });
            fireEvent.pointerUp(window, { button: 0, pointerId: 1, isPrimary: true, ...init });
          });
        };
        const corner = ctx.container.querySelector('.ssg-corner-cell');
        if (!corner) {
          throw new Error('角がありません');
        }
        await press(corner);
        ctx.snapshot('全体');
        await press(corner);
        ctx.snapshot('全体を解除');
        const rowHeader = ctx.container.querySelector('.ssg-body-row[data-row-index="3"] .ssg-row-header-cell');
        if (!rowHeader) {
          throw new Error('行番号がありません');
        }
        await press(rowHeader);
        ctx.snapshot('行');
        await press(ctx.header('qty'));
        ctx.snapshot('列');
        await press(ctx.cell(2, 'name'));
        await press(ctx.cell(5, 'qty'), { shiftKey: true });
        ctx.snapshot('範囲');
      },
    });
  });

  it('削除・元に戻す・Tab で外へ', async () => {
    await expectParity({
      props: () => ({ rows: makeRows(10), columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      watch: ['onRowsChange', 'onUndoRedoStateChange'],
      steps: async (ctx) => {
        await ctx.act(() => {
          const target = ctx.cell(1, 'name');
          fireEvent.pointerDown(target, { button: 0, pointerId: 1, isPrimary: true });
          fireEvent.pointerUp(target, { button: 0, pointerId: 1, isPrimary: true });
        });
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'ArrowRight', shiftKey: true });
          fireEvent.keyDown(ctx.shell(), { key: 'ArrowDown', shiftKey: true });
        });
        ctx.snapshot('範囲');
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'Delete' });
        });
        ctx.snapshot('削除');
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'z', ctrlKey: true });
        });
        ctx.snapshot('元に戻す');
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'End' });
        });
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'Tab' });
        });
        ctx.snapshot('Tab');
      },
    });
  });

  it('命令的 API(ハンドル)', async () => {
    await expectParity({
      props: () => ({ rows: makeRows(200), columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      watch: ['onActiveCellChange', 'onStateChange', 'onSortChange'],
      steps: async (ctx) => {
        const call = (name: string, ...args: unknown[]) =>
          (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);
        await ctx.act(() => {
          call('selectRange', { start: { row: 2, col: 1 }, end: { row: 4, col: 2 } });
        });
        ctx.snapshot('selectRange');
        await ctx.act(() => {
          call('scrollToRow', 150);
        });
        ctx.snapshot('scrollToRow');
        await ctx.act(() => {
          call('applyState', { sort: [{ key: 'qty', direction: 'desc' }] });
        });
        ctx.snapshot('applyState');
        await ctx.act(() => {
          call('setActiveCell', { row: 0, col: 0 });
        });
        ctx.snapshot('setActiveCell');
        const results = [
          call('getActiveCell'),
          call('getSelection'),
          call('getState'),
          call('getVisibleRowRange'),
          call('getRowNumber', 0),
          call('getColIndex', 'qty'),
          call('canUndo'),
        ];
        ctx.snapshot(`結果 ${JSON.stringify(results)}`);
      },
    });
  });

  it('縦のスクロールと onScroll', async () => {
    await expectParity({
      props: () => ({ rows: makeRows(500), columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      watch: ['onScroll'],
      steps: async (ctx) => {
        const scroller = ctx.container.querySelector<HTMLElement>('.ssg-scroll-container');
        if (!scroller) {
          throw new Error('スクロールの器がありません');
        }
        await ctx.act(() => {
          scroller.scrollTop = 3600;
          scroller.dispatchEvent(new Event('scroll'));
        }, 120);
        ctx.snapshot('100 行目あたり');
        await ctx.act(() => {
          scroller.scrollTop = 0;
          scroller.dispatchEvent(new Event('scroll'));
        }, 120);
        ctx.snapshot('先頭');
      },
    });
  });

  it('ツールチップ(メモと入力の検査)', async () => {
    await expectParity({
      props: () => ({
        rows: makeRows(10),
        rowKeyGetter: (row: Row) => row.id,
        height: 300,
        columns: [
          ...columns.slice(0, 2),
          {
            key: 'qty',
            title: '数量',
            width: 80,
            validate: (ctx: { value: unknown }) => ((ctx.value as number) >= 30 ? '30 未満にしてください' : true),
            cellNote: (ctx: { row: Row }) => (ctx.row.id === 5 ? '確認済み' : undefined),
          },
        ],
      }),
      steps: async (ctx) => {
        await ctx.act(() => {
          ctx.hover(ctx.cell(4, 'qty'));
        }, 900);
        ctx.snapshot('メモとエラー');
        await ctx.act(() => {
          const target = ctx.cell(3, 'qty');
          fireEvent.pointerDown(target, { button: 0, pointerId: 1, isPrimary: true });
          fireEvent.pointerUp(target, { button: 0, pointerId: 1, isPrimary: true });
        }, 900);
        ctx.snapshot('アクティブセルのエラー');
      },
    });
  });
});