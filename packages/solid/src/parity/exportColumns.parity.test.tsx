// 列の exportable: false(1.3.0 / Solid 版の品質の段 2 の要望)を React 版と Solid 版で比べる。
//   CSV / TSV の書き出しと getExportData から外し、範囲を選んだコピー(Ctrl/Cmd+C)には出す。
//   React 版の結合テストは packages/react/src/SpreadsheetGrid.export.integration.test.tsx の「列の exportable」。
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type ParityContext } from './harness';

type Row = { id: number; name: string; qty: number };

const columns = [
  { key: 'id', title: 'ID', width: 80, exportable: false },
  { key: 'name', title: 'Name', width: 160 },
  { key: 'qty', title: 'Qty', width: 100 },
];
const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 30 },
  { id: 2, name: 'beta', qty: 10 },
];

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});
const copied: string[] = [];
beforeEach(() => {
  copied.length = 0;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text: string) => void copied.push(text) },
  });
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);

describe('列の exportable: false', () => {
  it('CSV / TSV / getExportData / scope selection から外し、Ctrl+C には出す', async () => {
    await expectParity({
      features: ['export'],
      props: () => ({ rows, columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      steps: async (ctx) => {
        ctx.log('view', call(ctx, 'exportCsv'));
        ctx.log('raw TSV', call(ctx, 'exportCsv', { scope: 'raw', delimiter: '\t' }));
        ctx.log('getExportData', call(ctx, 'getExportData'));
        expect(call(ctx, 'exportCsv')).toBe('Name,Qty\r\nalpha,30\r\nbeta,10');
        await ctx.act(() => {
          call(ctx, 'selectRange', { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
        });
        ctx.log('selection', call(ctx, 'exportCsv', { scope: 'selection', includeHeaders: false }));
        await ctx.act(async () => {
          fireEvent.keyDown(ctx.shell(), { key: 'c', ctrlKey: true });
          await Promise.resolve();
        });
        ctx.log('Ctrl+C', copied.at(-1) ?? null);
        expect(copied.at(-1)).toBe('1\talpha\n2\tbeta');
      },
    });
  });
});