// React 版(`/lite` に同じ機能を差し込んだもの)と Solid 版の操作の機能を同じ操作で動かして、DOM と通知と命令的 API の結果が
//   同じかを見る(段階 2-2)。
import { beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type ParityContext } from './harness';

type Row = { id: number; name: string; qty: number; price: number; note: string; status: string };

const columns = [
  { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 120 },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' } },
  { key: 'price', title: '単価', width: 90, align: 'right', editor: { type: 'number' } },
  { key: 'status', title: '状態', width: 100 },
  { key: 'note', title: 'メモ', width: 160, pinned: 'right' },
];

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `品目 ${i + 1}`,
    qty: i * 10,
    price: 100 + (i % 7) * 25,
    note: i % 3 === 0 ? `Memo 品目の控え ${i}` : '',
    status: i % 2 === 0 ? '在庫あり' : '品切れ',
  }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

const pointer = { button: 0, pointerId: 1, isPrimary: true };

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);

const findInput = (ctx: ParityContext) => ctx.container.querySelector<HTMLInputElement>('.ssg-find-bar-input');

describe('セル内検索(find)', () => {
  it.each([
    ['あり', ['find']],
    ['なし(空)', []],
  ])('Ctrl+F・入力・次 / 前・命令的 API・閉じる(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      watch: ['onFindChange'],
      props: () => ({ rows: makeRows(12), columns, rowKeyGetter: (row: Row) => row.id, height: 360, find: true }),
      steps: async (ctx) => {
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(0, 'name'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await ctx.act(() => {
          ctx.log('Ctrl+F を止めたか', !fireEvent.keyDown(ctx.shell(), { key: 'f', ctrlKey: true }));
        });
        ctx.snapshot('Ctrl+F');
        const input = findInput(ctx);
        if (input) {
          await ctx.act(() => {
            fireEvent.input(input, { target: { value: '品目' } });
          }, 120);
          ctx.snapshot('「品目」を入力');
          // ヒットやカレントが変わっても、セルの箱と中身の span と印は使い回す(下で値を変える 2 行目とは別の行で見る。
          //   値が変わったセルの中身を作り直すのは既知の差 = docs/solid/README.md の 2-1)。
          ctx.track('ヒットのあるセル', () => ctx.cell(3, 'name'));
          ctx.track('ヒットのあるセルの文字', () => ctx.cell(3, 'name').querySelector('.ssg-cell-value'));
          ctx.track('ヒットの印', () => ctx.cell(3, 'name').querySelector('mark'));
          await ctx.act(() => {
            fireEvent.keyDown(input, { key: 'Enter' });
          });
          ctx.snapshot('Enter で次');
          await ctx.act(() => {
            fireEvent.keyDown(input, { key: 'ArrowDown' });
          });
          await ctx.act(() => {
            fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
          });
          ctx.snapshot('↓ と Shift+Enter');
          await ctx.act(() => {
            fireEvent.keyDown(input, { key: 'ArrowUp' });
          });
          await ctx.act(() => {
            fireEvent.keyDown(input, { key: 'ArrowUp' });
          });
          ctx.snapshot('↑ を 2 回(先頭から末尾へ回る)');
          // 当たらない文字。
          await ctx.act(() => {
            fireEvent.input(input, { target: { value: 'ない文字' } });
          }, 120);
          ctx.snapshot('当たらない');
          await ctx.act(() => {
            fireEvent.keyDown(input, { key: 'Escape' });
          });
          ctx.snapshot('Escape で閉じる');
        }
        // 命令的 API。
        await ctx.act(() => {
          call(ctx, 'openFind', '控え');
        }, 120);
        ctx.snapshot('openFind("控え")');
        await ctx.act(() => {
          call(ctx, 'findNext');
        });
        await ctx.act(() => {
          call(ctx, 'findNext');
        });
        ctx.snapshot('findNext を 2 回');
        await ctx.act(() => {
          call(ctx, 'findPrev');
        });
        ctx.snapshot('findPrev');
        // 行が変わったら探し直す(カレントはそのまま)。
        await ctx.setProps({
          rows: (ctx.rows() as Row[]).map((row) => (row.id === 2 ? { ...row, name: '控えの品' } : row)),
        });
        await ctx.act(() => {}, 120);
        ctx.snapshot('行が変わって探し直す');
        // × で閉じる(グリッドの本体へフォーカスを戻す)。
        const close = ctx.container.querySelector<HTMLButtonElement>('.ssg-find-bar-btn:last-child');
        if (close) {
          await ctx.act(() => {
            fireEvent.click(close);
          });
        }
        ctx.snapshot('× で閉じる');
        await ctx.act(() => {
          call(ctx, 'closeFind');
        });
        // shortcut: false では Ctrl+F を横取りしない。
        await ctx.setProps({ find: { shortcut: false } });
        await ctx.act(() => {
          ctx.log('shortcut: false の Ctrl+F を止めたか', !fireEvent.keyDown(ctx.shell(), { key: 'f', ctrlKey: true }));
        });
        ctx.snapshot('shortcut: false');
        // caseSensitive(大文字と小文字を分ける)と、find={false} にしたら閉じる。
        await ctx.setProps({ find: { caseSensitive: true } });
        await ctx.act(() => {
          call(ctx, 'openFind', 'memo');
        }, 120);
        ctx.snapshot('caseSensitive の「memo」');
        await ctx.setProps({ find: true });
        await ctx.act(() => {}, 120);
        ctx.snapshot('caseSensitive をやめる');
        await ctx.setProps({ find: false });
        ctx.snapshot('find={false}');
      },
    });
  }, 20_000);

  it.each([
    ['あり', ['find', 'conditionalFormat']],
    ['検索だけ', ['find']],
  ])('状態チップの文字・データバーの showValue: false・renderCell(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      watch: ['onFindChange'],
      props: () => ({
        rows: makeRows(8),
        columns: [
          ...columns.slice(0, 2),
          {
            key: 'qty',
            title: '数量',
            width: 80,
            align: 'right',
            conditionalFormat: { dataBar: { showValue: false } },
          },
          {
            key: 'price',
            title: '単価',
            width: 90,
            // renderCell の列は強調しない(既定のセルだけ)。
            renderCell: ({ value }: { value: unknown }) => `¥${String(value)}`,
          },
          {
            key: 'status',
            title: '状態',
            width: 120,
            conditionalFormat: {
              chips: { 在庫あり: { tone: 'good', label: '在庫あり(倉庫)' }, 品切れ: 'critical' },
            },
          },
        ],
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        find: true,
      }),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'openFind', '1');
        }, 120);
        ctx.snapshot('「1」');
        await ctx.act(() => {
          call(ctx, 'openFind', '倉庫');
        }, 120);
        ctx.snapshot('「倉庫」(チップの文字)');
        await ctx.act(() => {
          call(ctx, 'openFind', '品切れ');
        }, 120);
        ctx.snapshot('「品切れ」');
        await ctx.act(() => {
          call(ctx, 'openFind', '¥');
        }, 120);
        ctx.snapshot('「¥」(renderCell の列)');
      },
    });
  }, 20_000);
});