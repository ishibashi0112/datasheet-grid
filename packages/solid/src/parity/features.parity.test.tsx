// React 版(`/lite` に同じ機能を差し込んだもの)と Solid 版の機能を同じ操作で動かして、DOM と通知と命令的 API の結果が
//   同じかを見る(段階 2-1)。
import { afterAll, beforeAll, describe, it } from 'vitest';
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

describe('行の高さの自動調整(autoHeight)', () => {
  // jsdom には折り返しが無いので、器(data-autoheight-content)の高さを文字数から決めます(12 文字で 1 行 = 20px)。
  let restore: (() => void) | null = null;
  beforeAll(() => {
    const proto = Element.prototype;
    const original = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function (this: Element) {
      if (this instanceof HTMLElement && this.hasAttribute('data-autoheight-content')) {
        const lines = Math.max(1, Math.ceil((this.textContent ?? '').length / 12));
        const height = lines * 20;
        return { x: 0, y: 0, top: 0, left: 0, bottom: height, right: 100, width: 100, height, toJSON: () => ({}) } as DOMRect;
      }
      return original.call(this);
    };
    restore = () => {
      proto.getBoundingClientRect = original;
    };
  });
  afterAll(() => restore?.());

  const longRows = (count: number): Row[] =>
    makeRows(count).map((row, index) => ({
      ...row,
      note: index % 4 === 1 ? 'とても長いメモの文章で、折り返して何行にもなります。'.repeat(1 + (index % 3)) : row.note,
    }));
  const autoColumns = [
    ...columns.slice(0, 4),
    { key: 'note', title: 'メモ', width: 160, autoHeight: true, editor: { type: 'text', multiline: true } },
  ];

  it.each([
    ['あり', ['autoHeight']],
    ['なし(固定の高さ)', []],
  ])('autoHeight の列で行が伸び、背の高い行は上にそろえる・値を変えると測り直す・エディタも上にそろえる(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      props: () => ({
        rows: longRows(12),
        columns: autoColumns,
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        autoHeight: true,
      }),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        await ctx.act(() => {}, 120);
        ctx.snapshot('最初');
        // 背の高い行(2 行目)のメモを短くする → 測り直して低くなる。
        await ctx.setProps({
          rows: (ctx.rows() as Row[]).map((row) => (row.id === 2 ? { ...row, note: '短い' } : row)),
        });
        await ctx.act(() => {}, 120);
        ctx.snapshot('2 行目を短くする');
        // 背の高い行(6 行目)の数量を編集する(真ん中の揃えの列)/ メモを編集する(上にそろえた複数行のエディタ)。
        await ctx.act(() => {
          fireEvent.dblClick(ctx.cell(5, 'note'));
        });
        ctx.snapshot('背の高い行のメモを編集する');
        await ctx.act(() => {
          fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
        });
        const scroller = ctx.container.querySelector<HTMLElement>('.ssg-scroll-container');
        await ctx.act(() => {
          if (scroller) {
            scroller.scrollTop = 200;
            scroller.dispatchEvent(new Event('scroll'));
          }
        }, 120);
        ctx.snapshot('少しスクロール');
      },
    });
  });
});


describe('条件付き書式(conditionalFormat)', () => {
  type Item = { id: number; name: string; qty: number; diff: number; score: number; status: string; level: number };
  const items = (count: number): Item[] =>
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      name: `品目 ${i + 1}`,
      qty: (i * 37) % 100,
      diff: ((i * 13) % 21) - 10,
      score: (i * 7) % 50,
      status: ['済み', '確認中', '保留', '不明'][i % 4] ?? '',
      level: i % 5,
    }));
  const cfColumns = [
    { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
    { key: 'name', title: '品名', width: 120 },
    { key: 'qty', title: '数量', width: 90, align: 'right', editor: { type: 'number' }, conditionalFormat: { dataBar: {} } },
    {
      key: 'diff',
      title: '増減',
      width: 90,
      align: 'right',
      editor: { type: 'number' },
      conditionalFormat: { dataBar: { color: 'rgb(0, 128, 0)', negativeColor: 'rgb(200, 0, 0)', showValue: false } },
    },
    {
      key: 'score',
      title: '点数',
      width: 90,
      align: 'right',
      editor: { type: 'number' },
      conditionalFormat: { colorScale: { type: 'diverging', mid: 25 } },
    },
    {
      key: 'status',
      title: '状態',
      width: 110,
      conditionalFormat: {
        chips: { 済み: 'good', 確認中: { tone: 'warning', label: '確認待ち' }, 保留: { tone: 'info', icon: false, color: 'rgb(1, 2, 3)' } },
      },
    },
    {
      key: 'level',
      title: '段階',
      width: 70,
      // 関数のチップ: アクティブなセルだけ色を変える(位置や状態を読むチップも追従する)。
      conditionalFormat: {
        chips: (ctx: { value: unknown; isActive: boolean }) =>
          ctx.isActive ? { tone: 'critical', label: `選択中 ${String(ctx.value)}` } : Number(ctx.value) >= 3 ? 'warning' : null,
      },
    },
  ];

  it.each([
    ['あり', ['conditionalFormat']],
    ['なし(素の表示)', []],
  ])('データバー・カラースケール・チップ・値の変更と並べ替えで集計が変わる・関数のチップが状態に追従する(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      props: () => ({ rows: items(10), columns: cfColumns, rowKeyGetter: (row: Item) => row.id, height: 360 }),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        ctx.snapshot('最初');
        ctx.track('済みのチップ', () => ctx.container.querySelector('.ssg-body-row[data-row-key="1"] [data-ssg-col-key="status"] .ssg-chip'));
        ctx.track('数量の帯', () => ctx.container.querySelector('.ssg-body-row[data-row-key="2"] [data-ssg-col-key="qty"] .ssg-cf-bar'));
        // 最大の値を大きくする → ほかの行の帯が短くなる。
        await ctx.setProps({ rows: (ctx.rows() as Item[]).map((row) => (row.id === 3 ? { ...row, qty: 500 } : row)) });
        ctx.snapshot('数量の最大を変える');
        // 段階のセルをアクティブに → 関数のチップが変わる。状態のセルを押しても中身は作り直さない。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(1, 'level'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.snapshot('段階のセルをアクティブに');
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(0, 'status'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.snapshot('状態のセルをアクティブに');
        // 並べ替え(点数の昇順)。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.header('score'), { ...pointer, shiftKey: true });
          fireEvent.pointerUp(window, { ...pointer, shiftKey: true });
        });
        ctx.snapshot('点数で並べ替え');
        // 値をチップの無い値へ / 帯の値を負へ。
        await ctx.setProps({
          rows: (ctx.rows() as Item[]).map((row) => (row.id === 1 ? { ...row, status: '不明', diff: -10, score: 49 } : row)),
        });
        ctx.snapshot('チップの無い値と負の帯');
      },
    });
  });
});
describe('合計行(totalRow)と固定行(pinnedRows)', () => {
  type Line = { id: number | string; name: string; qty: number; price: number; done: boolean; score: number };
  const lines = (count: number): Line[] =>
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      name: `品目 ${i + 1}`,
      qty: i * 10,
      price: 100 + (i % 7) * 25,
      done: i % 2 === 0,
      score: (i * 7) % 30,
    }));
  const lineColumns = [
    { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
    { key: 'name', title: '品名', width: 120 },
    { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' }, aggFunc: 'sum' },
    {
      key: 'price',
      title: '単価',
      width: 90,
      align: 'right',
      editor: { type: 'number' },
      aggFunc: 'avg',
      valueFormatter: ({ value }: { value: unknown }) => `¥${String(value)}`,
    },
    { key: 'done', title: '済', width: 60, editor: { type: 'checkbox' }, aggFunc: 'count' },
    {
      key: 'score',
      title: '点数',
      width: 90,
      align: 'right',
      aggFunc: 'max',
      conditionalFormat: { dataBar: {}, chips: (ctx: { value: unknown }) => (Number(ctx.value) > 20 ? 'good' : null) },
      cellClassName: (ctx: { pinned?: string }) => (ctx.pinned ? `pinned-${ctx.pinned}` : undefined),
      pinned: 'right',
    },
  ];
  const pinnedTopRows: Line[] = [{ id: 'budget', name: '予算', qty: 999, price: 0, done: true, score: 25 }];
  const pinnedBottomRows: Line[] = [
    { id: 'tax', name: '消費税', qty: 10, price: 0, done: false, score: 5 },
    { id: 'gross', name: '税込', qty: 110, price: 0, done: false, score: 29 },
  ];

  it.each([
    ['あり', ['totalRow', 'pinnedRows', 'conditionalFormat', 'export']],
    ['なし(エクスポートだけ)', ['export']],
  ])('合計行・上下の固定行の描画・値の変更で合計が変わる・固定行は選べない・エクスポート(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      props: () => ({
        rows: lines(9),
        columns: lineColumns,
        rowKeyGetter: (row: Line) => row.id,
        height: 360,
        totalRow: true,
        pinnedTopRows,
        pinnedBottomRows,
        getRowClassName: (_row: Line, _index: number, ctx: { pinned?: string }) => (ctx.pinned ? `row-${ctx.pinned}` : undefined),
      }),
      watch: ['onRowsChange', 'onActiveCellChange', 'onHoveredRowChange'],
      steps: async (ctx) => {
        ctx.snapshot('最初');
        // 本体の数量を変える → 合計が変わる。
        await ctx.setProps({ rows: (ctx.rows() as Line[]).map((row) => (row.id === 2 ? { ...row, qty: 1000 } : row)) });
        ctx.snapshot('数量を変える');
        // 固定行のセルを押してもアクティブセルは変わらない。本体の行にホバーしてから固定行 / 合計行へ入るとホバーが外れる。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(2, 'name'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await ctx.act(() => {
          const pinnedCell = ctx.container.querySelector('.ssg-pinned-rows--top [data-ssg-col-key="name"]');
          if (pinnedCell) {
            fireEvent.pointerDown(pinnedCell, pointer);
            fireEvent.pointerUp(window, pointer);
          }
        });
        await ctx.act(() => {
          ctx.hover(ctx.cell(3, 'qty'));
        });
        await ctx.act(() => {
          const total = ctx.container.querySelector('.ssg-total-row');
          if (total) {
            ctx.hover(total);
          }
        });
        ctx.snapshot('固定行を押す / 合計行へ入る');
        // 最後の行で下へ → 固定行 / 合計行へは入らない。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(8, 'qty'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'ArrowDown' });
        });
        ctx.snapshot('最後の行で下へ');
        ctx.log('csv(合計行・固定行つき)', call(ctx, 'exportCsv', { includeTotalRow: true, includePinnedRows: true }));
        ctx.log('data(既定)', call(ctx, 'getExportData'));
        // 合計行のオプション(見出し・値・高さ・className・renderCell)と、下の固定行を合計行の下へ。
        await ctx.setProps({
          totalRow: {
            label: '計',
            height: 44,
            values: { name: '9 品目' },
            className: 'my-total',
            renderCell: (c: { text: string; caption?: string; column: { key: string } }) =>
              c.column.key === 'qty' ? `[${c.text}]` : `${c.caption ?? ''}${c.text}`,
          },
          pinnedBottomRowsPlacement: 'belowTotal',
        });
        ctx.snapshot('合計行のオプションと belowTotal');
        ctx.log('csv(belowTotal)', call(ctx, 'exportCsv', { includeTotalRow: true, includePinnedRows: true }));
        // 固定行を外す / 合計行を外す。
        await ctx.setProps({ pinnedTopRows: [], pinnedBottomRows: undefined, totalRow: false });
        ctx.snapshot('外す');
      },
    });
  });
});

describe('選択範囲の集計(selectionAggregates)', () => {
  const aggregatesText = (value: unknown) => JSON.stringify(value ?? null);
  const reactAggregatesBar = async () => {
    const { createElement } = await import('react');
    return (ctx: { selectionAggregates: unknown }) =>
      createElement('div', { className: 'my-bottom' }, aggregatesText(ctx.selectionAggregates));
  };
  const solidAggregatesBar = (ctx: { selectionAggregates: unknown }) => (
    <div class="my-bottom">{aggregatesText(ctx.selectionAggregates)}</div>
  );

  it.each([
    ['あり', ['selectionAggregates']],
    ['なし(空)', []],
  ])('数値 / 文字だけ / 空だけ / 1 セルの範囲・値の変更・件数なしの置き場所・止める(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      props: () => ({ rows: makeRows(12), columns, rowKeyGetter: (row: Row) => row.id, height: 360 }),
      steps: async (ctx) => {
        await selectRange(ctx, [1, 'qty'], [3, 'price']);
        // 集計の要素は値や範囲が変わっても作り直さない(消えて出直したときだけ新しい要素)。
        ctx.track('集計', () => ctx.container.querySelector('.ssg-bar-aggregates'));
        ctx.snapshot('数値の範囲');
        await ctx.setProps({ rows: (ctx.rows() as Row[]).map((row) => (row.id === 3 ? { ...row, qty: 1234.5 } : row)) });
        ctx.snapshot('範囲の中の値を変える');
        await selectRange(ctx, [1, 'name'], [4, 'name']);
        ctx.snapshot('文字だけ');
        await selectRange(ctx, [1, 'note'], [2, 'note']);
        ctx.snapshot('空のセルだけ');
        await selectRange(ctx, [0, 'name'], [2, 'note']);
        ctx.snapshot('数値と文字と空の混ざった範囲');
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(5, 'qty'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.snapshot('1 セル');
        await selectRange(ctx, [2, 'qty'], [6, 'qty']);
        await ctx.setProps({ showBottomBarCounts: false });
        ctx.snapshot('件数なし(集計は右のグループの後ろ)');
        await ctx.setProps({ showBottomBarCounts: true, localeText: { aggregateSum: 'SUM', aggregateAverage: 'AVG' } });
        ctx.snapshot('文言の差し替え');
        await ctx.setProps({ showSelectionAggregates: false });
        ctx.snapshot('showSelectionAggregates={false}');
        await ctx.setProps({ showSelectionAggregates: true, showBottomBar: false });
        ctx.snapshot('下のバーを消す');
      },
    });
  });

  it.each([
    ['あり', ['selectionAggregates']],
    ['なし(空)', []],
  ])('大きな選択は時間分割で集計し、利用側のバーへも渡す(機能%s)', async (_label, features) => {
    const bar = await reactAggregatesBar();
    await expectParity({
      features,
      // 15,000 行 × 5 列 = 75,000 セル(同期で計算する上限 50,000 を超える)。
      props: (framework) => ({
        rows: makeRows(15_000),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        renderBottomBar: framework === 'react' ? bar : solidAggregatesBar,
      }),
      steps: async (ctx) => {
        await selectRange(ctx, [1, 'qty'], [2, 'price']);
        ctx.snapshot('小さな範囲(利用側のバー)');
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(0, 'name'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'a', ctrlKey: true });
        }, 1500);
        ctx.snapshot('全選択(計算が終わった後)');
        await ctx.setProps({ renderBottomBar: undefined });
        ctx.snapshot('既定のバーへ戻す');
      },
    });
  });
});