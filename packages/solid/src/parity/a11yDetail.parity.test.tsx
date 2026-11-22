// 展開行と合成列の読み上げ(Solid 版の品質の段 2-6。docs/audits/2026-11-22-solid-quality/)を React 版と Solid 版で比べる。
//   React 版の結合テストは packages/react/src/SpreadsheetGrid.aria.integration.test.tsx の「展開行と合成列の読み上げ(1.3.0)」。
//   要望: 展開のボタンの名前にどの行かを入れる(「行 7 の詳細を開く」。行見出しと同じ番号 = ラベル行は数えない)。
//   S6-02: 表の直後の目印(.ssg-tab-exit)を Tab の順番に入れている間は aria-hidden を付けない。
//   S6-03: 合成列(展開トグル / 行ドラッグ)の列見出しに見えない文字で名前を置く。
import { beforeAll, describe, expect, it } from 'vitest';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type ParityContext } from './harness';

type Row = { id: string; kind?: 'label'; name: string; qty: number };

const rows: Row[] = [
  { id: 's1', kind: 'label', name: 'セクション 1', qty: 0 },
  { id: 'a', name: 'alpha', qty: 1 },
  { id: 'b', name: 'beta', qty: 2 },
  { id: 's2', kind: 'label', name: 'セクション 2', qty: 0 },
  { id: 'c', name: 'gamma', qty: 3 },
];
const columns = [
  { key: 'name', title: '名称', width: 160 },
  { key: 'qty', title: '数量', width: 100 },
];

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);
const logA11y = (ctx: ParityContext, label: string) => {
  const exit = ctx.container.querySelector<HTMLElement>('.ssg-tab-exit');
  ctx.log(label, {
    toggles: Array.from(ctx.container.querySelectorAll('.ssg-detail-toggle')).map((button) => button.getAttribute('aria-label')),
    headers: Array.from(ctx.container.querySelectorAll('[role="columnheader"][data-ssg-col-key] .ssg-header-label')).map(
      (element) => element.textContent,
    ),
    exit: { tabIndex: exit?.tabIndex ?? null, ariaHidden: exit?.getAttribute('aria-hidden') ?? null },
  });
};

describe('展開行と合成列の読み上げ', () => {
  it('ボタンの名前の行番号・合成列の見出しの名前・表の直後の目印の aria-hidden', async () => {
    await expectParity({
      features: ['labelRow', 'rowDrag'],
      props: () => ({
        rows,
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 300,
        labelRow: { isLabelRow: (row: Row) => row.kind === 'label', getLabel: (row: Row) => row.name },
        detailRow: { height: 60, isExpandable: (row: Row) => row.kind !== 'label', render: (row: Row) => `詳細 ${row.id}` },
        enableRowDrag: true,
        onRowsChange: () => {},
      }),
      steps: async (ctx) => {
        logA11y(ctx, '最初');
        expect(
          Array.from(ctx.container.querySelectorAll('.ssg-detail-toggle')).map((button) => button.getAttribute('aria-label')),
        ).toEqual(['行 1 の詳細を開く', '行 2 の詳細を開く', '行 3 の詳細を開く']);
        ctx.snapshot('最初');
        await ctx.act(() => {
          call(ctx, 'setDetailRowExpanded', 'c', true);
        });
        logA11y(ctx, '3 行目を開いた');
        expect(ctx.container.querySelector('.ssg-tab-exit')?.hasAttribute('aria-hidden')).toBe(false);
        ctx.snapshot('3 行目を開いた');
        await ctx.setProps({ localeText: { showDetails: 'Open {row}', hideDetails: 'Close {row}', detailColumnName: 'Details' } });
        logA11y(ctx, '文言を変えた');
        await ctx.act(() => {
          call(ctx, 'collapseAllDetailRows');
        });
        logA11y(ctx, '閉じた');
      },
    });
  });
});
