// 追加(合計行 3A): 合計行の集計(組み込み / カスタム / values / serverSide)、表示文字列、見出しの列、エクスポート行、
//   メモ化(同じ入力で同じ参照・values の中身だけの変化で集計し直さない)を固定します。
import { describe, expect, it, vi } from 'vitest';

import {
  buildTotalRowExportLine,
  collectTotalRowCells,
  createTotalRowCellsResolver,
  formatTotalRowCellText,
  formatTotalRowNumber,
  resolveTotalRowCaption,
  resolveTotalRowLabelColumnKey,
} from './totalRow';
import { DETAIL_TOGGLE_COLUMN_KEY } from './detailRow';
import { GROUP_AUTO_COLUMN_KEY } from './grouping';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from './rowReorder';
import type { GridColumn } from '../model/gridTypes.unbound';

type Row = { name: string; qty: unknown; price: unknown };

const rows: Row[] = [
  { name: 'a', qty: 10, price: 1.1 },
  { name: 'b', qty: '5', price: 2.2 },
  { name: 'c', qty: '', price: null },
  { name: 'd', qty: true, price: 'x' },
  { name: 'e', qty: -3, price: 0 },
];

const allOrder = Int32Array.from([0, 1, 2, 3, 4]);

const col = (key: string, extra: Partial<GridColumn<Row>> = {}): GridColumn<Row> => ({ key, width: 100, ...extra });

describe('collectTotalRowCells', () => {
  it('組み込み集計は aggFunc ごとに order の行で計算する(数値と数値の文字列だけを数え、count は行数)', () => {
    const columns = [
      col('name'),
      col('qty', { aggFunc: 'sum' }),
      col('price', { aggFunc: 'avg' }),
    ];
    const cells = collectTotalRowCells({ rows, order: allOrder, columns, values: undefined });
    expect(cells.has('name')).toBe(false);
    expect(cells.get('qty')).toEqual({ value: 12, kind: 'sum' });
    // 1.1 + 2.2 + 0 を 3 件で割る('x' / null は数えない)。
    expect(cells.get('price')?.kind).toBe('avg');
    expect(cells.get('price')?.value).toBeCloseTo(1.1, 10);

    const countCells = collectTotalRowCells({
      rows,
      order: allOrder,
      columns: [col('qty', { aggFunc: 'count' }), col('price', { aggFunc: 'min' }), col('name', { aggFunc: 'max' })],
      values: undefined,
    });
    expect(countCells.get('qty')).toEqual({ value: 5, kind: 'count' });
    expect(countCells.get('price')).toEqual({ value: 0, kind: 'min' });
    // 数値対象が 0 件の max は undefined(空セル)。
    expect(countCells.get('name')).toEqual({ value: undefined, kind: 'max' });
  });

  it('order に含まれる行だけを数える(フィルター後 / ラベル行を除いた並び)', () => {
    const cells = collectTotalRowCells({
      rows,
      order: Int32Array.from([0, 4]),
      columns: [col('qty', { aggFunc: 'sum' }), col('name', { aggFunc: 'count' })],
      values: undefined,
    });
    expect(cells.get('qty')?.value).toBe(7);
    expect(cells.get('name')?.value).toBe(2);
  });

  it('カスタム集計は values / rows / column を受け取り、種別は custom', () => {
    const aggFunc = vi.fn(({ values, rows: aggRows }: { values: unknown[]; rows: Row[] }) =>
      `${values.length}/${aggRows.map((row) => row.name).join('')}`,
    );
    const column = col('name', { aggFunc });
    const cells = collectTotalRowCells({ rows, order: Int32Array.from([1, 3]), columns: [column], values: undefined });
    expect(cells.get('name')).toEqual({ value: '2/bd', kind: 'custom' });
    expect(aggFunc).toHaveBeenCalledTimes(1);
    expect(aggFunc.mock.calls[0]?.[0]).toMatchObject({ values: ['b', 'd'], column });
  });

  it('values で渡した列は計算せずその値を出す(aggFunc より優先。undefined も値として扱う)', () => {
    const aggFunc = vi.fn(() => 'x');
    const cells = collectTotalRowCells({
      rows,
      order: allOrder,
      columns: [col('qty', { aggFunc: 'sum' }), col('price', { aggFunc }), col('name')],
      values: { qty: 999, price: undefined, unknownKey: 1 },
    });
    expect(cells.get('qty')).toEqual({ value: 999, kind: 'value' });
    expect(cells.get('price')).toEqual({ value: undefined, kind: 'value' });
    expect(cells.has('unknownKey')).toBe(false);
    expect(aggFunc).not.toHaveBeenCalled();
  });

  it('serverSide(order が null)は計算せず values の値だけを出す', () => {
    const cells = collectTotalRowCells({
      rows: [],
      order: null,
      columns: [col('qty', { aggFunc: 'sum' }), col('price', { aggFunc: 'avg' })],
      values: { price: 12.5 },
    });
    expect([...cells.keys()]).toEqual(['price']);
    expect(cells.get('price')).toEqual({ value: 12.5, kind: 'value' });
  });

  it('合成列と不正な aggFunc 文字列は対象外', () => {
    const cells = collectTotalRowCells({
      rows,
      order: allOrder,
      columns: [
        col(GROUP_AUTO_COLUMN_KEY, { aggFunc: 'count' }),
        col(DETAIL_TOGGLE_COLUMN_KEY),
        col('qty', { aggFunc: 'median' as never }),
      ],
      values: { [ROW_DRAG_HANDLE_COLUMN_KEY]: 1 },
    });
    expect(cells.size).toBe(0);
  });
});

describe('createTotalRowCellsResolver', () => {
  const columns = [col('qty', { aggFunc: 'sum' }), col('price', { aggFunc: 'sum' })];

  it('同じ入力なら同じ参照を返し、内容が同じなら再集計しても前回の参照を返す', () => {
    const resolve = createTotalRowCellsResolver<Row>();
    const first = resolve({ rows, order: allOrder, columns, values: undefined });
    expect(resolve({ rows, order: allOrder, columns, values: undefined })).toBe(first);
    // order の参照だけ変わって中身が同じ → 再集計しても同じ参照。
    expect(resolve({ rows, order: Int32Array.from(allOrder), columns, values: undefined })).toBe(first);
    // 中身が変わる → 新しい参照。
    const next = resolve({ rows, order: Int32Array.from([0]), columns, values: undefined });
    expect(next).not.toBe(first);
    expect(next.get('qty')?.value).toBe(10);
  });

  it('values の中身だけが変わったときは集計し直さず差し替える', () => {
    const aggFunc = vi.fn(() => 1);
    const customColumns = [col('qty', { aggFunc }), col('price', { aggFunc: 'sum' })];
    const resolve = createTotalRowCellsResolver<Row>();
    const first = resolve({ rows, order: allOrder, columns: customColumns, values: { price: 1 } });
    expect(aggFunc).toHaveBeenCalledTimes(1);
    const second = resolve({ rows, order: allOrder, columns: customColumns, values: { price: 2 } });
    expect(aggFunc).toHaveBeenCalledTimes(1);
    expect(second).not.toBe(first);
    expect(second.get('price')).toEqual({ value: 2, kind: 'value' });
    // 同じ中身の新しいオブジェクト → 前回の参照のまま。
    expect(resolve({ rows, order: allOrder, columns: customColumns, values: { price: 2 } })).toBe(second);
    // values の列の集合が変わる → 集計し直す(price が aggFunc に戻る)。
    const third = resolve({ rows, order: allOrder, columns: customColumns, values: undefined });
    expect(third.get('price')).toEqual({ value: 3.3000000000000003, kind: 'sum' });
  });
});

describe('formatTotalRowCellText', () => {
  it('count は件数、文字列はそのまま、空は空、formatter の無い数値は下部バーの集計と同じ書式', () => {
    const formatter = vi.fn(({ value }: { value: unknown }) => `¥${String(value)}`);
    const plain = col('qty');
    const formatted = col('price', { valueFormatter: formatter });
    expect(formatTotalRowCellText(formatted, { value: 3, kind: 'count' })).toBe('3');
    expect(formatTotalRowCellText(formatted, { value: '12 件', kind: 'custom' })).toBe('12 件');
    expect(formatTotalRowCellText(formatted, { value: undefined, kind: 'sum' })).toBe('');
    expect(formatTotalRowCellText(formatted, { value: null, kind: 'value' })).toBe('');
    expect(formatter).not.toHaveBeenCalled();
    expect(formatTotalRowCellText(formatted, { value: 1200, kind: 'sum' })).toBe('¥1200');
    expect(formatter.mock.calls[0]?.[0]).toMatchObject({ value: 1200, row: undefined });
    expect(formatTotalRowCellText(plain, { value: 0.1 + 0.2, kind: 'sum' })).toBe('0.3');
    expect(formatTotalRowCellText(plain, { value: 10 / 3, kind: 'avg' })).toBe((3.3333).toLocaleString(undefined, { maximumFractionDigits: 4 }));
    expect(formatTotalRowCellText(plain, { value: 1234567, kind: 'sum' })).toBe((1234567).toLocaleString());
    expect(formatTotalRowCellText(formatted, { value: 12345, kind: 'count' })).toBe((12345).toLocaleString());
    expect(formatTotalRowCellText(plain, { value: true, kind: 'custom' })).toBe('true');
  });

  it('formatTotalRowNumber は下部バーの集計と同じ書式。非有限値はそのまま', () => {
    expect(formatTotalRowNumber(42)).toBe('42');
    expect(formatTotalRowNumber(-0.5)).toBe((-0.5).toLocaleString());
    expect(formatTotalRowNumber(Infinity)).toBe('Infinity');
    expect(formatTotalRowNumber(NaN)).toBe('NaN');
    expect(formatTotalRowNumber(1e-9)).toBe('0');
  });

  it('見出しは合計以外の組み込み集計だけ', () => {
    expect(resolveTotalRowCaption('avg')).toBe('平均');
    expect(resolveTotalRowCaption('min')).toBe('最小');
    expect(resolveTotalRowCaption('max')).toBe('最大');
    expect(resolveTotalRowCaption('count')).toBe('個数');
    expect(resolveTotalRowCaption('sum')).toBeUndefined();
    expect(resolveTotalRowCaption('custom')).toBeUndefined();
    expect(resolveTotalRowCaption('value')).toBeUndefined();
  });
});

describe('resolveTotalRowLabelColumnKey', () => {
  it('行ドラッグ / 展開トグルの合成列を飛ばした先頭列。値があれば null(行番号の欄へ)', () => {
    const cells = new Map([['qty', { value: 1, kind: 'sum' as const }]]);
    expect(
      resolveTotalRowLabelColumnKey(
        [col(ROW_DRAG_HANDLE_COLUMN_KEY), col(DETAIL_TOGGLE_COLUMN_KEY), col('name'), col('qty')],
        cells,
      ),
    ).toBe('name');
    // 自動グループ列は見出しの列になれる。
    expect(resolveTotalRowLabelColumnKey([col(GROUP_AUTO_COLUMN_KEY), col('qty')], cells)).toBe(GROUP_AUTO_COLUMN_KEY);
    expect(resolveTotalRowLabelColumnKey([col('qty'), col('name')], cells)).toBeNull();
    expect(resolveTotalRowLabelColumnKey([], cells)).toBeNull();
  });
});

describe('buildTotalRowExportLine', () => {
  it('エクスポート列順の値。先頭列に値がなければ見出しを置く', () => {
    const cells = new Map([
      ['qty', { value: 12, kind: 'sum' as const }],
      ['price', { value: undefined, kind: 'avg' as const }],
    ]);
    expect(buildTotalRowExportLine([col('name'), col('qty'), col('price')], cells, '合計')).toEqual([
      '合計',
      12,
      undefined,
    ]);
    expect(buildTotalRowExportLine([col('qty'), col('name')], cells, '合計')).toEqual([12, undefined]);
    expect(buildTotalRowExportLine([col('name')], cells, '')).toEqual([undefined]);
    expect(buildTotalRowExportLine([], cells, '合計')).toEqual([]);
  });
});