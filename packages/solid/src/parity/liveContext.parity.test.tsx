// 追加(段 3-3 / R5-3・S1-21): renderCell の中の入力欄で打つたびに setValue する形と、バーの中の入力欄(バーの関数の本体で
//   derivedSummary の 1 つを読む)を、React 版と同じ操作で比べます。React 版は要素を使い回すので、打ち続けてもフォーカスと
//   入力欄はそのまま。Solid 版は 1.3.0 まで、行が変わるたび / 要約のどれかが変わるたびに中身を作り直してフォーカスが外れていた。
import { beforeAll, describe, it } from 'vitest';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { createElement } from 'react';
import { expectParity, type ParityContext } from './harness';

type Row = { id: number; name: string; qty: number };

const makeRows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}`, qty: i * 10 }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

// React の制御された入力欄はプロパティの setter を通さないと変化に気づかない(Solid はどちらでもよい)。
const typeInto = async (ctx: ParityContext, input: HTMLInputElement, text: string) => {
  await ctx.act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);

describe('読んだ値が変わったときだけ呼び直す(段 3-3)', () => {
  it('renderCell の中の入力欄で打つたびに setValue しても、同じ入力欄のまま打ち続けられる(R5-3)', async () => {
    type Ctx = { value: unknown; setValue: (value: unknown) => void };
    await expectParity({
      watch: ['onRowsChange'],
      props: (framework) => ({
        rows: makeRows(10),
        rowKeyGetter: (row: Row) => row.id,
        height: 300,
        columns: [
          { key: 'id', title: 'ID', width: 60, editable: false },
          {
            key: 'name',
            title: '品名',
            width: 160,
            renderCell:
              framework === 'react'
                ? (ctx: Ctx) =>
                    createElement('input', {
                      className: 'inline-input',
                      value: String(ctx.value ?? ''),
                      onChange: (event: { target: HTMLInputElement }) => ctx.setValue(event.target.value),
                    })
                : (ctx: Ctx) => (
                    <input class="inline-input" value={String(ctx.value ?? '')} onInput={(event) => ctx.setValue(event.currentTarget.value)} />
                  ),
          },
          { key: 'qty', title: '数量', width: 80 },
        ],
      }),
      steps: async (ctx) => {
        const find = () => ctx.cell(2, 'name').querySelector<HTMLInputElement>('.inline-input');
        ctx.track('入力欄', find);
        await ctx.act(() => {
          find()?.focus();
        });
        for (const text of ['品目 3a', '品目 3ab', '品目 3abc']) {
          await typeInto(ctx, find() as HTMLInputElement, text);
        }
        ctx.snapshot('3 文字打った');
        // 打った後に表の外から別の列を変えても、入力欄はそのまま。
        await ctx.act(() => {
          call(ctx, 'applyRows', (prev: Row[]) => prev.map((row) => (row.id === 3 ? { ...row, qty: 999 } : row)));
        });
        ctx.snapshot('別の列を変えた');
      },
    });
  });

  it('バーの関数の本体で derivedSummary の 1 つだけを読むと、セルを動かしてもバーの入力欄はそのまま(S1-21)', async () => {
    type BarCtx = { derivedSummary: { sortSummaryText: string } };
    await expectParity({
      features: ['filtering'],
      props: (framework) => ({
        rows: makeRows(20),
        rowKeyGetter: (row: Row) => row.id,
        height: 300,
        columns: [
          { key: 'name', title: '品名', width: 120 },
          { key: 'qty', title: '数量', width: 80 },
        ],
        renderTopBar:
          framework === 'react'
            ? (ctx: BarCtx) => {
                const sort = ctx.derivedSummary.sortSummaryText;
                return createElement(
                  'div',
                  { className: 'my-bar' },
                  createElement('span', { className: 'my-sort' }, sort),
                  createElement('input', { className: 'my-bar-input', defaultValue: '' }),
                );
              }
            : (ctx: BarCtx) => {
                const sort = ctx.derivedSummary.sortSummaryText;
                return (
                  <div class="my-bar">
                    <span class="my-sort">{sort}</span>
                    <input class="my-bar-input" value="" />
                  </div>
                );
              },
      }),
      steps: async (ctx) => {
        const find = () => ctx.container.querySelector<HTMLInputElement>('.my-bar-input');
        ctx.track('バーの入力欄', find);
        await ctx.act(() => {
          find()?.focus();
        });
        await ctx.act(() => {
          call(ctx, 'selectCell', 3, 1);
        });
        await ctx.act(() => {
          call(ctx, 'selectRange', { start: { row: 3, col: 0 }, end: { row: 6, col: 1 } });
        });
        ctx.snapshot('セルと範囲を選んだ');
        await ctx.act(() => {
          call(ctx, 'applyState', { filters: { globalText: '品目 1', columnFilters: {} } });
        });
        ctx.snapshot('絞り込んだ');
        // 並べ替えると、本体で読んだ sortSummaryText が変わるので Solid 版はバーを作り直す(本体で読んだ値の決まり。React 版は
        //   要素を使い回す)。そこは比べず、cellContent.test.tsx で呼び直しの回数を見る。
      },
    });
  });
});