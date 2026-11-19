// React 版(`/lite` に同じ機能を差し込んだもの)と Solid 版の機能を同じ操作で動かして、DOM と通知と命令的 API の結果が
//   同じかを見る(段階 2-1)。
import { beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type ParityContext } from './harness';

type Row = { id: number; name: string; qty: number; price: number; note: string };

const columns = [
  { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 120 },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' }, aggFunc: 'sum' },
  { key: 'price', title: '単価', width: 90, align: 'right', editor: { type: 'number' }, aggFunc: 'avg' },
  { key: 'note', title: 'メモ', width: 160, pinned: 'right' },
];

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `品目 ${i + 1}`,
    qty: i * 10,
    price: 100 + (i % 7) * 25,
    note: i % 3 === 0 ? `メモ "${i}"` : '',
  }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

const pointer = { button: 0, pointerId: 1, isPrimary: true };

const selectRange = async (ctx: ParityContext, from: [number, string], to: [number, string]) => {
  await ctx.act(() => {
    fireEvent.pointerDown(ctx.cell(from[0], from[1]), pointer);
    ctx.hover(ctx.cell(to[0], to[1]));
    fireEvent.pointerUp(window, pointer);
  });
};

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);

describe('エクスポート(export)', () => {
  it.each([
    ['あり', ['export']],
    ['なし(空)', []],
  ])('exportCsv / getExportData の scope・区切り・見出し・BOM(機能%s)', async (_label, features) => {
    {
      await expectParity({
        features,
        props: () => ({ rows: makeRows(8), columns, rowKeyGetter: (row: Row) => row.id, height: 360 }),
        steps: async (ctx) => {
          ctx.log('csv(既定)', call(ctx, 'exportCsv'));
          ctx.log('csv(tsv・見出しなし・BOM)', call(ctx, 'exportCsv', { delimiter: '\t', includeHeaders: false, bom: true }));
          ctx.log('data(view)', call(ctx, 'getExportData'));
          await selectRange(ctx, [1, 'name'], [3, 'price']);
          ctx.log('csv(selection)', call(ctx, 'exportCsv', { scope: 'selection' }));
          ctx.log('data(selection)', call(ctx, 'getExportData', { scope: 'selection' }));
          ctx.log('csv(source)', call(ctx, 'exportCsv', { scope: 'source' }));
          // 並べ替えた後の view と source。
          for (let index = 0; index < 2; index += 1) {
            await ctx.act(() => {
              const header = ctx.header('qty');
              fireEvent.pointerDown(header, { ...pointer, shiftKey: true });
              fireEvent.pointerUp(window, { ...pointer, shiftKey: true });
            });
          }
          ctx.log('csv(数量の降順の view)', call(ctx, 'exportCsv'));
          ctx.log('csv(数量の降順の source)', call(ctx, 'exportCsv', { scope: 'source' }));
          ctx.snapshot('最後');
        },
      });
    }
  });
});
