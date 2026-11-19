// React 版(機能なしの /lite)と Solid 版の行の選択(チェックボックス)・展開行(Master/Detail)・フォーカスの順を同じ操作で
//   動かして、DOM と通知が同じかを見る(段階 1-3)。
import { beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { createElement } from 'react';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type Framework, type ParityContext } from './harness';

type Row = { id: number; name: string; qty: number; note: string };

const columns = [
  { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 120 },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' } },
  { key: 'note', title: 'メモ', width: 160, pinned: 'right' },
];

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}`, qty: i * 10, note: '' }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

const pointer = { button: 0, pointerId: 1, isPrimary: true };

const rowHeader = (ctx: ParityContext, row: number): HTMLElement => {
  const element = ctx.container.querySelector<HTMLElement>(
    `.ssg-body-row[data-row-index="${row}"] .ssg-row-header-cell`,
  );
  if (!element) {
    throw new Error(`[${ctx.framework}] 行番号のセルがありません: ${row}`);
  }
  return element;
};

const corner = (ctx: ParityContext): HTMLElement => {
  const element = ctx.container.querySelector<HTMLElement>('.ssg-corner-cell');
  if (!element) {
    throw new Error(`[${ctx.framework}] 角がありません`);
  }
  return element;
};

const pressRowHeader = async (ctx: ParityContext, row: number, init: { shiftKey?: boolean } = {}) => {
  await ctx.act(() => {
    const target = rowHeader(ctx, row);
    fireEvent.pointerDown(target, { ...pointer, ...init });
    fireEvent.pointerUp(window, { ...pointer, ...init });
  });
};

const logSelection = (ctx: ParityContext, label: string) => {
  const handle = ctx.handle();
  ctx.log(label, {
    keys: (handle.getSelectedRowKeys as () => unknown)(),
    count: (handle.getSelectedRowCount as () => unknown)(),
  });
};

describe('行の選択(チェックボックス)', () => {
  it('multiple: 行番号のチェック・Shift で範囲・角で全選択 / 解除・ドラッグで範囲', async () => {
    await expectParity({
      props: () => ({
        rows: makeRows(12),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 300,
        enableRowSelection: true,
      }),
      watch: ['onRowSelectionChange', 'onActiveCellChange'],
      steps: async (ctx) => {
        ctx.snapshot('最初');
        await pressRowHeader(ctx, 1);
        ctx.snapshot('2 行目をチェック');
        await pressRowHeader(ctx, 4, { shiftKey: true });
        ctx.snapshot('Shift で 5 行目まで');
        logSelection(ctx, '選択(範囲)');
        await pressRowHeader(ctx, 2);
        ctx.snapshot('3 行目を外す');
        await ctx.act(() => {
          const target = corner(ctx);
          fireEvent.pointerDown(target, pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.snapshot('角で全選択');
        logSelection(ctx, '選択(全部)');
        await pressRowHeader(ctx, 0);
        ctx.snapshot('全選択から 1 行目を外す');
        await ctx.act(() => {
          const target = corner(ctx);
          fireEvent.pointerDown(target, pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.snapshot('角でもう一度(全選択)');
        await ctx.act(() => {
          const target = corner(ctx);
          fireEvent.pointerDown(target, pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.snapshot('角で解除');
        // ドラッグ: 7 行目で押して 9 行目まで動かす。
        await ctx.act(() => {
          fireEvent.pointerDown(rowHeader(ctx, 6), pointer);
          ctx.hover(rowHeader(ctx, 7));
          ctx.hover(rowHeader(ctx, 8));
          fireEvent.pointerUp(window, pointer);
        });
        ctx.snapshot('ドラッグで範囲');
        logSelection(ctx, '選択(ドラッグ)');
        await ctx.act(() => {
          (ctx.handle().clearRowSelection as () => void)();
        });
        ctx.snapshot('ハンドルで解除');
      },
    });
  });

  it('single: 1 行だけ・角は表全体のセルの選択(全選択のチェックは無い)', async () => {
    await expectParity({
      props: () => ({
        rows: makeRows(8),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 300,
        enableRowSelection: true,
        rowSelectionMode: 'single',
      }),
      watch: ['onRowSelectionChange'],
      steps: async (ctx) => {
        ctx.snapshot('最初');
        await pressRowHeader(ctx, 1);
        await pressRowHeader(ctx, 3);
        ctx.snapshot('4 行目だけ');
        await ctx.act(() => {
          const target = corner(ctx);
          fireEvent.pointerDown(target, pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.snapshot('角');
      },
    });
  });

  it('controlled(selectedRowKeys / rowSelection)と enableSelectAllRows={false}', async () => {
    await expectParity({
      props: () => ({
        rows: makeRows(8),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 300,
        enableRowSelection: true,
        selectedRowKeys: [2, 3],
      }),
      watch: ['onRowSelectionChange'],
      steps: async (ctx) => {
        ctx.snapshot('最初(2 / 3)');
        await pressRowHeader(ctx, 0);
        // controlled なので親が変えるまで見た目は変わらない。
        ctx.snapshot('押しても親が変えるまでそのまま');
        await ctx.setProps({ selectedRowKeys: [1, 2, 3] });
        ctx.snapshot('親が変えた');
        await ctx.setProps({ selectedRowKeys: undefined, rowSelection: { type: 'exclude', rowKeys: [5] } });
        ctx.snapshot('rowSelection の exclude');
        logSelection(ctx, '選択(exclude)');
        await ctx.setProps({ enableSelectAllRows: false });
        ctx.snapshot('全選択のチェックなし');
        await ctx.setProps({ enableRowSelection: false });
        ctx.snapshot('行の選択をやめる');
      },
    });
  });
});

// 展開行の中身(React 版は createElement、Solid 版は JSX で同じ DOM)。
const detailRender = (framework: Framework) =>
  framework === 'react'
    ? (ctx: { row: Row; rowKey: unknown; rowIndex: number; collapse: () => void }) =>
        createElement(
          'div',
          { className: 'detail-body' },
          createElement('span', { className: 'detail-title' }, `${ctx.row.name} / ${ctx.rowIndex}`),
          createElement('input', { className: 'detail-input', 'aria-label': '詳細の入力' }),
          createElement('button', { type: 'button', className: 'detail-close', onClick: ctx.collapse }, '閉じる'),
        )
    : (ctx: { row: Row; rowKey: unknown; rowIndex: number; collapse: () => void }) => (
        <div class="detail-body">
          <span class="detail-title">{`${ctx.row.name} / ${ctx.rowIndex}`}</span>
          <input class="detail-input" aria-label="詳細の入力" />
          <button type="button" class="detail-close" onClick={() => ctx.collapse()}>
            閉じる
          </button>
        </div>
      );

const toggleButton = (ctx: ParityContext, row: number): HTMLElement => {
  const element = ctx.container.querySelector<HTMLElement>(`.ssg-body-row[data-row-index="${row}"] .ssg-detail-toggle`);
  if (!element) {
    throw new Error(`[${ctx.framework}] トグルがありません: ${row}`);
  }
  return element;
};

const card = (ctx: ParityContext, row: number): HTMLElement => {
  const element = ctx.container.querySelector<HTMLElement>(`[data-detail-row-index="${row}"] [data-ssg-detail]`);
  if (!element) {
    throw new Error(`[${ctx.framework}] カードがありません: ${row}`);
  }
  return element;
};

const clickToggle = async (ctx: ParityContext, row: number) => {
  await ctx.act(() => {
    const target = toggleButton(ctx, row);
    fireEvent.pointerDown(target, pointer);
    fireEvent.pointerUp(target, pointer);
    fireEvent.click(target);
  });
};

describe('展開行(Master/Detail)', () => {
  it('トグル列で開閉・中身の collapse・isExpandable・className・選択の帯が展開行を避ける・ハンドル', async () => {
    await expectParity({
      props: (framework) => ({
        rows: makeRows(10),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        detailRow: {
          render: detailRender(framework),
          height: 80,
          isExpandable: (row: Row) => row.id !== 3,
          className: { className: 'my-card', style: framework === 'react' ? { padding: '4px' } : { padding: '4px' } },
        },
        classNames: { detailBand: 'my-band', detailCard: 'my-card-slot' },
      }),
      watch: ['onExpandedDetailRowKeysChange', 'onActiveCellChange', 'onCellClick'],
      steps: async (ctx) => {
        ctx.snapshot('最初(3 行目はトグルなし)');
        await clickToggle(ctx, 1);
        ctx.snapshot('2 行目を開く');
        ctx.track('2 行目のカード', () => ctx.container.querySelector('[data-detail-row-index="1"] [data-ssg-detail]'));
        await clickToggle(ctx, 4);
        ctx.snapshot('5 行目も開く');
        // 1 行目から 6 行目までを選ぶ(選択の塗りは展開行の帯を避けて 3 つに分かれる)。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(0, 'name'), pointer);
          ctx.hover(ctx.cell(5, 'qty'));
          fireEvent.pointerUp(window, pointer);
        });
        ctx.snapshot('帯をまたぐ範囲の選択');
        await ctx.act(() => {
          fireEvent.click(card(ctx, 1).querySelector('.detail-close') as HTMLElement);
        });
        ctx.snapshot('中身の閉じるボタン');
        ctx.log('開いている行', (ctx.handle().getExpandedDetailRowKeys as () => unknown)());
        await ctx.act(() => {
          (ctx.handle().setDetailRowExpanded as (key: number, expanded: boolean) => void)(7, true);
          (ctx.handle().setDetailRowExpanded as (key: number, expanded: boolean) => void)(3, true);
        });
        ctx.snapshot('ハンドルで 7 を開く(3 は開けない)');
        // 並べ替えても帯はキーで付いていき、カードの中身は作り直さない。
        ctx.track(
          '5 のカード',
          () =>
            Array.from(ctx.container.querySelectorAll('[data-ssg-detail]')).find((element) =>
              element.textContent?.startsWith('品目 5 /'),
            ) ?? null,
        );
        for (let index = 0; index < 2; index += 1) {
          await ctx.act(() => {
            const header = ctx.header('qty');
            fireEvent.pointerDown(header, { ...pointer, shiftKey: true });
            fireEvent.pointerUp(window, { ...pointer, shiftKey: true });
          });
        }
        ctx.snapshot('数量の降順');
        await ctx.act(() => {
          (ctx.handle().collapseAllDetailRows as () => void)();
        });
        ctx.snapshot('ハンドルですべて閉じる');
      },
    });
  });

  it('キーボード: トグル列のセルで Enter / Space・最終列の Tab でカードへ・カードの端の Tab / Shift+Tab', async () => {
    await expectParity({
      props: (framework) => ({
        rows: makeRows(6),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        detailRow: { render: detailRender(framework), height: 80 },
      }),
      watch: ['onExpandedDetailRowKeysChange', 'onActiveCellChange'],
      steps: async (ctx) => {
        // 2 行目の ID のセルを押して、← で展開トグル列へ。
        await ctx.act(() => {
          const target = ctx.cell(1, 'id');
          fireEvent.pointerDown(target, pointer);
          fireEvent.pointerUp(target, pointer);
        });
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'ArrowLeft' });
        });
        ctx.snapshot('トグル列');
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'Enter' });
        });
        ctx.snapshot('Enter で開く');
        // 最終列(右固定のメモ)へ移って Tab。
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'End' });
        });
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'Tab' });
        });
        ctx.snapshot('最終列の Tab でカードの最初の要素へ');
        // カードの最後の要素(閉じるボタン)で Tab → 表の直後の目印へ(既定の Tab はそこから外へ進む)。
        await ctx.act(() => {
          const close = card(ctx, 1).querySelector<HTMLElement>('.detail-close');
          close?.focus();
          fireEvent.keyDown(close as HTMLElement, { key: 'Tab' });
        });
        ctx.snapshot('カードの最後の Tab');
        // カードの最初の要素で Shift+Tab → その行の最終列のセルへ。
        await ctx.act(() => {
          const input = card(ctx, 1).querySelector<HTMLElement>('.detail-input');
          input?.focus();
          fireEvent.keyDown(input as HTMLElement, { key: 'Tab', shiftKey: true });
        });
        ctx.snapshot('カードの最初の Shift+Tab');
        // 表の外から Shift+Tab で目印に来たら、アクティブセルの行のカードの最後の要素へ。
        const outside = document.createElement('button');
        document.body.append(outside);
        await ctx.act(() => {
          outside.focus();
          const exit = ctx.container.querySelector<HTMLElement>('.ssg-tab-exit');
          exit?.focus();
        });
        ctx.snapshot('後ろから戻る');
        outside.remove();
        // カードの中にフォーカスがあるまま、トグル列のセルの Space で閉じる → フォーカスは表へ戻る。
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'Home' });
        });
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'ArrowLeft' });
        });
        ctx.snapshot('トグル列へ(フォーカスはカードのまま)');
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: ' ' });
        });
        ctx.snapshot('Space で閉じる');
      },
    });
  });

  it('カードの中にフォーカスがあるまま閉じる / 行が消えるとフォーカスは表へ・キーは本体へ伝わらない', async () => {
    await expectParity({
      props: (framework) => ({
        rows: makeRows(6),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        detailRow: { render: detailRender(framework), height: 80 },
      }),
      watch: ['onExpandedDetailRowKeysChange', 'onActiveCellChange', 'onRowsChange'],
      steps: async (ctx) => {
        await clickToggle(ctx, 2);
        await clickToggle(ctx, 4);
        // カードの入力欄のキーはグリッドへ伝わらない(Delete で選択を消さない・矢印で動かない)。
        await ctx.act(() => {
          const input = card(ctx, 2).querySelector<HTMLElement>('.detail-input');
          input?.focus();
          fireEvent.keyDown(input as HTMLElement, { key: 'ArrowDown' });
          fireEvent.keyDown(input as HTMLElement, { key: 'Delete' });
        });
        ctx.snapshot('カードの中のキー');
        // カードの閉じるボタンで閉じる → 3 行目のセル(最初のデータの列)がアクティブになり、フォーカスは表へ。
        await ctx.act(() => {
          const close = card(ctx, 2).querySelector<HTMLElement>('.detail-close');
          close?.focus();
          close?.click();
        });
        ctx.snapshot('閉じるボタン(フォーカスは表へ)');
        // 5 行目のカードにフォーカスを置いたまま、その行を消す(DF-25 でキーも外れる)。
        await ctx.act(() => {
          card(ctx, 4).querySelector<HTMLElement>('.detail-input')?.focus();
        });
        await ctx.setProps({ rows: ctx.rows().filter((row) => (row as Row).id !== 5) });
        ctx.snapshot('行を消す');
      },
    });
  });

  it('showToggleColumn: false と renderCell の ctx.detail', async () => {
    await expectParity({
      props: (framework) => ({
        rows: makeRows(5),
        columns: [
          ...columns.slice(0, 1),
          {
            key: 'name',
            title: '品名',
            width: 160,
            renderCell:
              framework === 'react'
                ? (ctx: { value: unknown; detail?: { expanded: boolean; expandable: boolean; toggle: () => void } }) =>
                    createElement(
                      'span',
                      { className: 'my-cell' },
                      String(ctx.value),
                      ctx.detail
                        ? createElement(
                            'button',
                            { type: 'button', className: 'my-toggle', onClick: ctx.detail.toggle },
                            ctx.detail.expanded ? '閉' : '開',
                          )
                        : null,
                    )
                : (ctx: { value: unknown; detail?: { expanded: boolean; expandable: boolean; toggle: () => void } }) => (
                    <span class="my-cell">
                      {String(ctx.value)}
                      {ctx.detail ? (
                        <button type="button" class="my-toggle" onClick={() => ctx.detail?.toggle()}>
                          {ctx.detail.expanded ? '閉' : '開'}
                        </button>
                      ) : null}
                    </span>
                  ),
          },
          ...columns.slice(2),
        ],
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        detailRow: { render: detailRender(framework), height: 60, showToggleColumn: false },
      }),
      watch: ['onExpandedDetailRowKeysChange'],
      steps: async (ctx) => {
        ctx.snapshot('最初(トグル列なし)');
        await ctx.act(() => {
          fireEvent.click(ctx.cell(1, 'name').querySelector('.my-toggle') as HTMLElement);
        });
        ctx.snapshot('セルのボタンで開く');
        await ctx.setProps({ detailRow: undefined });
        ctx.snapshot('detailRow を外す');
      },
    });
  });
});