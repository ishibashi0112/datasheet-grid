// 追加(段 3-2 / S1-01): Solid 版の行を createStore で持つ形(`s.rows = next` / `reconcile(next, key)(s.rows)` で戻す)と、
//   React 版の useState で、同じ操作の DOM と通知を比べます。元に戻す / やり直す・貼り付け・行の追加と削除・並べ替えと絞り込み・
//   グループ化・行のドラッグ(moveRow)・親からの差し替え。
//   ほかのすべての場面は環境変数 PARITY_SOLID_ROWS=store(または reconcile)で store の形でも回せます(段 3-2 で 257 本が同じ結果)。
//   reconcile のときは、モジュールの定数の行を使い回す場面を続けて回すと、Solid の store が前の場面の書き込みを持ち越すので
//   (同じ元のオブジェクトを包む store は中身を共有する = Solid の store の決まり)、その場面は 1 つずつ回してください。
//   ここの場面は、どれも props を呼ぶたびに新しい行を作ります。
import { beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type ParityContext, type SolidRowsHolder } from './harness';

type Row = { id: number; name: string; cat: string; qty: number };

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}`, cat: i % 2 === 0 ? 'A' : 'B', qty: (i + 1) * 10 }));

const columns = [
  { key: 'name', title: '品名', width: 120 },
  { key: 'cat', title: '分類', width: 80 },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' } },
];

beforeAll(() => {
  installJsdomLayoutStubs({ width: 900, height: 400 });
});

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);

const paste = async (ctx: ParityContext, cell: { row: number; col: number }, text: string) => {
  await ctx.act(() => {
    call(ctx, 'selectCell', cell.row, cell.col);
  });
  await ctx.act(() => {
    fireEvent.paste(ctx.shell(), { clipboardData: { getData: () => text } });
  });
};

const key = async (ctx: ParityContext, init: KeyboardEventInit & { key: string }) => {
  await ctx.act(() => {
    fireEvent.keyDown(ctx.shell(), init);
  });
};

const logHistory = (ctx: ParityContext, label: string, initial: readonly unknown[] | null) => {
  ctx.log(label, {
    canUndo: call(ctx, 'canUndo'),
    canRedo: call(ctx, 'canRedo'),
    backToInitial: initial === null ? null : ctx.rows() === initial,
    names: ctx.rows().map((row) => (row as Row).name),
  });
};

describe.each(['store', 'reconcile'] as const satisfies readonly SolidRowsHolder[])('Solid 版の行を store で持つ(%s)', (solidRows) => {
  it('貼り付け → 元に戻す / やり直す → 続けて編集・行を足す / 消す・親からの差し替えで履歴が消える', async () => {
    let initial: readonly unknown[] | null = null;
    await expectParity({
      solidRows,
      props: () => {
        const rows = makeRows(6);
        initial = rows;
        return { rows, columns, rowKeyGetter: (row: Row) => row.id, height: 300 };
      },
      watch: ['onRowsChange', 'onUndoRedoStateChange'],
      steps: async (ctx) => {
        await paste(ctx, { row: 0, col: 0 }, 'EDITED\n二行目');
        logHistory(ctx, '貼り付け', initial);
        await key(ctx, { key: 'z', ctrlKey: true });
        logHistory(ctx, 'Ctrl+Z', initial);
        ctx.snapshot('元に戻した');
        await key(ctx, { key: 'y', ctrlKey: true });
        logHistory(ctx, 'Ctrl+Y', initial);
        await paste(ctx, { row: 3, col: 2 }, '999');
        await ctx.act(() => {
          call(ctx, 'applyRows', (prev: Row[]) => [...prev, { id: 100, name: '足した', cat: 'A', qty: 1 }]);
        });
        await ctx.act(() => {
          call(ctx, 'applyRows', (prev: Row[]) => prev.filter((row) => row.id !== 2));
        });
        logHistory(ctx, '足して消した', initial);
        ctx.snapshot('足して消した');
        await ctx.act(() => {
          call(ctx, 'undo');
          call(ctx, 'undo');
          call(ctx, 'undo');
          call(ctx, 'undo');
        });
        logHistory(ctx, '4 回戻す', initial);
        ctx.snapshot('4 回戻した');
        // 親が行を差し替えると履歴は消える(React 版と同じ)。
        await ctx.setProps({ rows: makeRows(3) });
        logHistory(ctx, '親から差し替え', null);
        ctx.snapshot('差し替えた');
      },
    });
  });

  it('並べ替えと絞り込みの中で編集して戻す・グループ化', async () => {
    await expectParity({
      solidRows,
      features: ['filtering', 'grouping'],
      props: () => ({ rows: makeRows(8), columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'applyState', {
            sort: [{ columnKey: 'qty', direction: 'desc' }],
            filters: { globalText: '', columnFilters: { cat: { kind: 'set', values: ['A'] } } },
          });
        });
        ctx.snapshot('並べ替えて絞った');
        await paste(ctx, { row: 0, col: 2 }, '5');
        ctx.snapshot('編集した');
        await key(ctx, { key: 'z', ctrlKey: true });
        ctx.snapshot('戻した');
        await ctx.setProps({ columns: columns.map((column) => (column.key === 'cat' ? { ...column, rowGroup: true } : column)) });
        await ctx.act(() => {
          call(ctx, 'applyState', { sort: [], filters: { globalText: '', columnFilters: {} } });
        });
        ctx.snapshot('グループ化した');
        ctx.log('getGroupRows', (call(ctx, 'getGroupRows') as { label: string; count?: number }[]).map((group) => group.label));
      },
    });
  });

  it('行のドラッグ(moveRow)を元に戻す', async () => {
    let initial: readonly unknown[] | null = null;
    await expectParity({
      solidRows,
      features: ['rowDrag'],
      props: () => {
        const rows = makeRows(5);
        initial = rows;
        return { rows, columns, rowKeyGetter: (row: Row) => row.id, height: 300, enableRowDrag: true };
      },
      watch: ['onRowsChange', 'onRowMove'],
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'moveRow', 1, 4);
        });
        logHistory(ctx, '動かした', initial);
        ctx.snapshot('動かした');
        await key(ctx, { key: 'z', ctrlKey: true });
        logHistory(ctx, '戻した', initial);
        ctx.snapshot('戻した');
      },
    });
  });
});