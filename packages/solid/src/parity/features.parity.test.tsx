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
