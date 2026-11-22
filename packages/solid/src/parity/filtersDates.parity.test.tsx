// フィルターと日付の所見(Solid 版の品質の段 2-5。docs/audits/2026-11-22-solid-quality/)を React 版と Solid 版で比べる。
//   S8-02: 列フィルターの日付の入力欄(開始日 / 終了日)が、全角・「年月日」・ドットの書き方を読まなかった(セルの date エディタは読む)。
//   0 時をまたいだときの値の木(S8-03)と、並びが変わったときの select の候補の位置(S8-05)は、時計と位置が要るので
//   実ブラウザ(audit/harness/t-v130.mjs)と React 版の ColumnFilterPopover.test.tsx で見る。
import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type ParityContext } from './harness';

type Row = { id: number; name: string; due: string };

const columns = [
  { key: 'name', title: '品名', width: 120 },
  { key: 'due', title: '期日', width: 140, filterType: 'dateSet' },
];
const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}`, due: `2026-11-${String(15 + i).padStart(2, '0')}` }));

beforeAll(async () => {
  installJsdomLayoutStubs({ width: 600, height: 400 });
  const reactLite = (await import(/* @vite-ignore */ new URL('../../../react/src/lite.ts', import.meta.url).pathname)) as {
    preloadGridPopups: () => Promise<void>;
  };
  await reactLite.preloadGridPopups();
});

const pointer = { button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse' };
const menuItem = (label: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) => el.textContent?.includes(label));
const openFilter = async (ctx: ParityContext, key: string) => {
  await ctx.act(() => {
    const button = ctx.header(key).querySelector<HTMLButtonElement>('.ssg-icon-btn');
    if (!button) {
      throw new Error(`[${ctx.framework}] ⋮ がありません: ${key}`);
    }
    fireEvent.pointerDown(button, pointer);
    fireEvent.pointerUp(button, pointer);
    fireEvent.click(button, { detail: 1 });
  });
  await ctx.act(() => {
    const item = menuItem('フィルター');
    if (!item) {
      throw new Error(`[${ctx.framework}] 「フィルター…」がありません`);
    }
    fireEvent.click(item, { detail: 1 });
  }, 60);
};
const startInput = () => document.querySelector<HTMLInputElement>('input[aria-label="開始日"]');

describe('S8-02 列フィルターの日付の入力欄', () => {
  it('全角・年月日・ドットの日付を読んで条件にする', async () => {
    await expectParity({
      features: ['filtering', 'columnMenu'],
      props: () => ({ rows: makeRows(10), columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      watch: ['onFiltersChange'],
      steps: async (ctx) => {
        await openFilter(ctx, 'due');
        for (const text of ['２０２６／１１／２０', '2026年11月21日', '2026.11.22']) {
          await ctx.act(() => {
            const input = startInput();
            if (!input) {
              throw new Error(`[${ctx.framework}] 開始日の入力欄がありません`);
            }
            fireEvent.input(input, { target: { value: text } });
            fireEvent.change(input, { target: { value: text } });
          });
          // Enter は打った後の別のイベント(Solid は書き込みを flush で反映するので、同じ act の中では打つ前の文字を読む)。
          await ctx.act(() => {
            const input = startInput();
            if (input) {
              fireEvent.keyDown(input, { key: 'Enter' });
            }
          });
          ctx.log(text, { invalid: startInput()?.getAttribute('aria-invalid') ?? null, shown: startInput()?.value ?? null });
          expect(startInput()?.getAttribute('aria-invalid') ?? null).toBeNull();
        }
        ctx.snapshot('3 つ読んだ後');
      },
    });
  });
});
