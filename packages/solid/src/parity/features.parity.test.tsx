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
        allowMissingFeatures: ['export'],
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
      allowMissingFeatures: ['autoHeight'],
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

  // 追加(速さの段階 3-2b): Solid 版は auto-height を使わない間はセルの auto-height の memo を作らない(primitives/memoWhen)。
  //   後から autoHeight を入れても外しても、React 版と同じに描くかを見ます。
  it('autoHeight を後から入れる・外す', async () => {
    await expectParity({
      features: ['autoHeight'],
      props: () => ({ rows: longRows(12), columns: autoColumns, rowKeyGetter: (row: Row) => row.id, height: 360 }),
      steps: async (ctx) => {
        await ctx.act(() => {}, 120);
        ctx.snapshot('固定の高さ');
        await ctx.setProps({ autoHeight: true });
        await ctx.act(() => {}, 120);
        ctx.snapshot('autoHeight を入れた');
        await ctx.setProps({ autoHeight: false });
        await ctx.act(() => {}, 120);
        ctx.snapshot('autoHeight を外した');
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
      allowMissingFeatures: ['conditionalFormat'],
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
// 追加(速さの段階): Solid 版は、書式 / メモ / 条件付き書式 / 入力の検査の値を、それを使う列のセルだけ memo にします
//   (primitives/memoWhen)。セルを作った後に同じ列のキーのまま足したり外したりしても、React 版と同じに描くかを見ます。
describe('列の書式・メモ・条件付き書式・検査を後から足す / 外す', () => {
  type Item = { id: number; name: string; qty: number; score: number };
  const items = (count: number): Item[] =>
    Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}`, qty: (i * 37) % 100, score: (i * 7) % 50 }));
  const plainColumns = [
    { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
    { key: 'name', title: '品名', width: 120 },
    { key: 'qty', title: '数量', width: 90, align: 'right', editor: { type: 'number' } },
    { key: 'score', title: '点数', width: 90, align: 'right', editor: { type: 'number' } },
  ];
  const decoratedColumns = [
    { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false, cellClassName: 'my-id-cell' },
    {
      key: 'name',
      title: '品名',
      width: 120,
      cellClassName: (ctx: { rowIndex: number; isActive: boolean }) =>
        ctx.isActive ? { className: 'my-active', style: { color: 'rgb(1, 2, 3)' } } : ctx.rowIndex % 2 === 0 ? 'my-even' : undefined,
      cellNote: (ctx: { row: Item }) => (ctx.row.id === 2 ? '確認済み' : undefined),
    },
    {
      key: 'qty',
      title: '数量',
      width: 90,
      align: 'right',
      editor: { type: 'number' },
      conditionalFormat: { dataBar: {} },
      validate: (ctx: { value: unknown }) => ((ctx.value as number) >= 50 ? '50 未満にしてください' : true),
    },
    {
      key: 'score',
      title: '点数',
      width: 90,
      align: 'right',
      editor: { type: 'number' },
      conditionalFormat: { colorScale: { type: 'diverging', mid: 25 } },
    },
  ];

  it('同じ列のキーのまま足す・状態に追従する・外す', async () => {
    await expectParity({
      features: ['conditionalFormat'],
      props: () => ({ rows: items(8), columns: plainColumns, rowKeyGetter: (row: Item) => row.id, height: 360 }),
      steps: async (ctx) => {
        ctx.snapshot('素の列');
        await ctx.setProps({ columns: decoratedColumns, showValidationMarks: true });
        ctx.snapshot('書式・メモ・条件付き書式・検査を足した');
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(1, 'name'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.snapshot('品名のセルをアクティブに(関数の書式が追従)');
        await ctx.setProps({ rows: (ctx.rows() as Item[]).map((row) => (row.id === 1 ? { ...row, qty: 80, score: 49 } : row)) });
        ctx.snapshot('値を変える(検査の印・帯・色)');
        await ctx.setProps({ showValidationMarks: false });
        ctx.snapshot('検査の印を消す');
        await ctx.setProps({ columns: plainColumns });
        ctx.snapshot('素の列に戻す');
      },
    });
  });

  it('最初から足した列で外す・足し直す(データバーの色も)', async () => {
    const coloredColumns = decoratedColumns.map((column) =>
      column.key === 'qty'
        ? { ...column, conditionalFormat: { dataBar: { color: 'rgb(10, 20, 30)', negativeColor: 'rgb(200, 0, 0)' } } }
        : column,
    );
    await expectParity({
      features: ['conditionalFormat'],
      props: () => ({
        rows: items(8).map((row) => (row.id === 3 ? { ...row, qty: -20 } : row)),
        columns: coloredColumns,
        showValidationMarks: true,
        rowKeyGetter: (row: Item) => row.id,
        height: 360,
      }),
      steps: async (ctx) => {
        ctx.snapshot('最初から足した列');
        await ctx.setProps({ showValidationMarks: false });
        ctx.snapshot('検査の印を消す');
        await ctx.setProps({ showValidationMarks: true });
        ctx.snapshot('検査の印を戻す');
        await ctx.setProps({ columns: plainColumns });
        ctx.snapshot('素の列にする');
        await ctx.setProps({ columns: coloredColumns });
        ctx.snapshot('足し直す');
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
      allowMissingFeatures: ['totalRow', 'pinnedRows', 'conditionalFormat'],
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
        // 列の幅が変わっても、合計行 / 固定行のセルの中身(renderCell の要素・チップ)は作り直さない(React 版と同じ)。
        ctx.track('合計行の数量の中身', () => ctx.container.querySelector('.ssg-total-row [data-ssg-col-key="qty"] > *'));
        ctx.track('固定行の品名の中身', () => ctx.container.querySelector('.ssg-pinned-rows--top [data-ssg-col-key="name"] > *'));
        ctx.track('固定行の点数のチップ', () => ctx.container.querySelector('.ssg-pinned-rows--top [data-ssg-col-key="score"] .ssg-chip'));
        await ctx.act(() => {
          call(ctx, 'applyState', { columnWidths: { id: 90, name: 150 } });
        });
        ctx.snapshot('列の幅を変える');
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
      allowMissingFeatures: ['selectionAggregates'],
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

describe('スクロール位置インジケーター(scrollHint)', () => {
  const scrollTo = async (ctx: ParityContext, top: number, waitMs = 120) => {
    const scroller = ctx.container.querySelector<HTMLElement>('.ssg-scroll-container');
    if (!scroller) {
      throw new Error('スクロールの器がありません');
    }
    await ctx.act(() => {
      scroller.scrollTop = top;
      scroller.dispatchEvent(new Event('scroll'));
    }, waitMs);
  };
  const scroller = (ctx: ParityContext) => ctx.container.querySelector<HTMLElement>('.ssg-scroll-container') as HTMLElement;

  it.each([
    ['あり', ['scrollHint']],
    ['なし(空)', []],
  ])('バブル・ルーラー・ジャンプの線・カスタムスクロールバー・止まると消える・minRows(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      allowMissingFeatures: ['scrollHint'],
      props: () => ({ rows: makeRows(300), columns, rowKeyGetter: (row: Row) => row.id, height: 360, scrollHint: true }),
      steps: async (ctx) => {
        ctx.snapshot('最初(スクロールしていない)');
        ctx.track('バブル', () => ctx.container.querySelector('.ssg-scroll-hint-bubble'));
        await scrollTo(ctx, 3000);
        ctx.snapshot('スクロール中');
        await scrollTo(ctx, 4200);
        ctx.snapshot('さらにスクロール');
        // 止まってから 1 秒で消える。
        await ctx.act(() => {}, 1200);
        ctx.snapshot('止まって 1 秒後');
        // ガターの上のポインタでジャンプの線(ルーラーも出る)。
        const gutter = () => ctx.container.querySelector<HTMLElement>('.ssg-scroll-hint-scrollbar');
        await ctx.act(() => {
          const target = gutter();
          if (target) {
            // React の onPointerEnter は pointerover から作られるので ctx.hover(両方を送る)。
            ctx.hover(target);
            fireEvent.pointerMove(target, { clientY: 200, pointerId: 1 });
          }
        });
        ctx.snapshot('ガターの上のポインタ');
        // ガターを押すとそこへ飛ぶ(scrollTop を書くだけ。scroll はテストから送る)。
        await ctx.act(() => {
          const target = gutter();
          if (target) {
            target.setPointerCapture = () => {};
            target.releasePointerCapture = () => {};
            fireEvent.pointerDown(target, { clientY: 300, pointerId: 1, button: 0 });
          }
        });
        ctx.log('ガターを押した後の scrollTop', scroller(ctx).scrollTop);
        await scrollTo(ctx, scroller(ctx).scrollTop);
        ctx.snapshot('ガターを押す');
        await ctx.act(() => {
          const target = gutter();
          if (target) {
            fireEvent.pointerMove(target, { clientY: 120, pointerId: 1 });
            fireEvent.pointerUp(target, { clientY: 120, pointerId: 1 });
            fireEvent.pointerOut(target, { relatedTarget: document.body });
            fireEvent.pointerLeave(target, { relatedTarget: document.body });
          }
        });
        ctx.log('ドラッグした後の scrollTop', scroller(ctx).scrollTop);
        await scrollTo(ctx, scroller(ctx).scrollTop);
        ctx.snapshot('ドラッグして離す');
        await ctx.setProps({ scrollHint: { minRows: 1000 } });
        ctx.snapshot('minRows に足りない');
      },
    });
  }, 20_000);

  it.each([
    ['あり', ['scrollHint']],
    ['なし(空)', []],
  ])('hintColumn / renderHint・trigger の always と hover・ネイティブのバー(機能%s)', async (_label, features) => {
    const { createElement } = await import('react');
    await expectParity({
      features,
      allowMissingFeatures: ['scrollHint'],
      props: (framework) => ({
        rows: makeRows(300),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        scrollHint: {
          scrollbar: false,
          trigger: 'always',
          renderHint:
            framework === 'react'
              ? ({ rowData }: { rowData?: Row }) =>
                  rowData ? createElement('b', { className: 'hint' }, `「${rowData.name}」`) : null
              : ({ rowData }: { rowData?: Row }) => (rowData ? <b class="hint">{`「${rowData.name}」`}</b> : null),
        },
      }),
      steps: async (ctx) => {
        await scrollTo(ctx, 1800);
        ctx.snapshot('always + renderHint(Solid は要素)');
        // ネイティブのバーの帯の上のポインタでジャンプの線(補足つき)。
        await ctx.act(() => {
          fireEvent.pointerMove(scroller(ctx), { clientX: 790, clientY: 250, pointerId: 1 });
        });
        ctx.snapshot('帯の上のポインタ');
        await ctx.act(() => {
          fireEvent.pointerLeave(scroller(ctx));
        });
        await ctx.setProps({ scrollHint: { scrollbar: false, ruler: false, trigger: 'hover', hintColumn: 'note' } });
        // スクロールが止まって 1 秒たつまでは出ている。
        await ctx.act(() => {}, 1200);
        ctx.snapshot('hover(まだ入っていない)・hintColumn');
        await ctx.act(() => {
          fireEvent.pointerEnter(scroller(ctx));
        });
        ctx.snapshot('hover(入った)');
        // 先頭が 103 行目(メモのある行)。
        await scrollTo(ctx, 3672);
        ctx.snapshot('hintColumn の値のある行');
        await ctx.setProps({ localeText: { scrollHintRow: 'Row {row}' } });
        ctx.snapshot('文言の差し替え');
      },
    });
  }, 20_000);
});

describe('動きの追加(motionExtras)', () => {
  // jsdom には navigator.clipboard が無いので、書き込みは成功したことにする(コピー範囲の点線はコピーに成功したときだけ)。
  const copied: string[] = [];
  beforeAll(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void copied.push(text) },
    });
  });
  afterAll(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it.each([
    ['あり', ['motionExtras']],
    ['なし(空)', []],
  ])('コピー範囲の点線・クロスヘア・変わったセルのフラッシュとトゥイーン(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      allowMissingFeatures: ['motionExtras'],
      props: () => ({
        rows: makeRows(10),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        motion: 'on',
        highlightChanges: true,
        hoverHighlight: 'cross',
      }),
      steps: async (ctx) => {
        await selectRange(ctx, [1, 'name'], [3, 'price']);
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'c', ctrlKey: true });
        });
        ctx.log('コピーした文字', copied.at(-1));
        ctx.snapshot('コピーした範囲の点線');
        // 選択を変えても点線は残る。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(5, 'qty'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.snapshot('選択を変える');
        // クロスヘア: 本体のセルのホバーで列もホバーの列にし、列の帯を描く。本体から出たら消す。
        await ctx.act(() => {
          ctx.hover(ctx.cell(4, 'price'));
        });
        ctx.snapshot('セルにホバー(クロスヘア)');
        // 本体から出る(React は pointerout から leave を作り、Solid は leave のリスナーを要素へ直接付けるので両方を送る)。
        await ctx.act(() => {
          fireEvent.pointerOut(ctx.cell(4, 'price'), { relatedTarget: document.body });
          fireEvent.pointerLeave(ctx.shell(), { relatedTarget: document.body });
        });
        ctx.snapshot('本体から出る');
        // 値が変わったセル: フラッシュ(class)。数値のトゥイーンは jsdom の requestAnimationFrame の時刻が performance.now() と
        //   ずれていて途中の値が決まらないので、ここでは数値 → 空(トゥイーンしない)で見る(トゥイーンは Chromium で確かめる)。
        await ctx.act(async () => {
          await ctx.setProps({
            rows: (ctx.rows() as Row[]).map((row) =>
              row.id === 3 ? { ...row, qty: null as unknown as number, name: '変更' } : row,
            ),
          });
        }, 500);
        ctx.snapshot('値が変わったセル');
        await ctx.act(() => {}, 1600);
        ctx.snapshot('フラッシュが消えた後');
        // 数値のトゥイーンの始まり(requestAnimationFrame を止め、旧値へ戻して書いた直後の文字を見る)。
        const originalRaf = window.requestAnimationFrame;
        const queuedFrames: FrameRequestCallback[] = [];
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
          queuedFrames.push(callback);
          return queuedFrames.length;
        }) as typeof window.requestAnimationFrame;
        try {
          await ctx.setProps({ rows: (ctx.rows() as Row[]).map((row) => (row.id === 5 ? { ...row, price: 900 } : row)) });
          const tweened = ctx.container.querySelector('.ssg-body-row[data-row-key="5"] [data-ssg-col-key="price"]');
          ctx.log('トゥイーンの始まりの文字', tweened?.textContent);
          ctx.log('トゥイーン中のフラッシュ', tweened?.classList.contains('ssg-body-cell--changed'));
        } finally {
          window.requestAnimationFrame = originalRaf;
        }
        // 1 セルのコピーの後の Escape はグリッドが受ける(既定の動きを止めて点線を消す。ダイアログの中では 1 回目で閉じない)。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(6, 'qty'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'c', ctrlKey: true });
        });
        ctx.snapshot('1 セルをコピー');
        await ctx.act(() => {
          ctx.log('1 セルのコピーの後の Escape を止めたか', !fireEvent.keyDown(ctx.shell(), { key: 'Escape' }));
        });
        ctx.snapshot('1 セルのコピーの後の Escape');
        // 範囲を選び直してコピーしておく(下の「行数が変わる」で点線が消えるのを見る)。
        await selectRange(ctx, [1, 'name'], [3, 'price']);
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'c', ctrlKey: true });
        });
        // 行数が変わると点線は消える(コピーした時点の見え方と違う)。
        await ctx.setProps({ rows: makeRows(12) });
        ctx.snapshot('行数が変わる');
        await ctx.setProps({ showCopyRange: false, hoverHighlight: 'row' });
        await selectRange(ctx, [0, 'name'], [1, 'qty']);
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'c', ctrlKey: true });
        });
        await ctx.act(() => {
          ctx.hover(ctx.cell(2, 'qty'));
        });
        ctx.snapshot('showCopyRange={false}・hoverHighlight="row"');
      },
    });
  }, 20_000);
});