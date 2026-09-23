// 追加(label-row ①): ラベル行の純ロジックの単体テストです。配置 / ラベル行を除いた恒等 order /
//   表示順(section / follow / hide × ソート・フィルター)/ RowModel の契約 / SSRM ラッパ / 補助関数を検証します。
import { describe, it, expect } from 'vitest';
import {
  buildLabelDisplay,
  countLabelsBefore,
  createLabelFreeOrder,
  createLabelRowModel,
  isSameOrder,
  resolveDataRowNumber,
  resolveLabelRowLayout,
  resolvePasteTargetViewIndexes,
  resolveSectionLabelViewIndex,
  wrapRowModelWithLabelRows,
  type LabelDisplay,
} from './labelRows';
import type { RowModel } from '../model/gridTypes.unbound';

type Row = { id: string; kind?: 'label'; price: number };

// 並び: [L0, a, b, L1, c, d, e, L2, L3, f]
//   セクション 0 = なし / S1(L0) = a, b / S2(L1) = c, d, e / S3(L2) = 空 / S4(L3) = f
const rows: Row[] = [
  { id: 'L0', kind: 'label', price: 0 },
  { id: 'a', price: 30 },
  { id: 'b', price: 10 },
  { id: 'L1', kind: 'label', price: 0 },
  { id: 'c', price: 50 },
  { id: 'd', price: 20 },
  { id: 'e', price: 40 },
  { id: 'L2', kind: 'label', price: 0 },
  { id: 'L3', kind: 'label', price: 0 },
  { id: 'f', price: 5 },
];
const isLabelRow = (row: Row) => row.kind === 'label';
const getLabel = (row: Row) => `label:${row.id}`;
const layout = resolveLabelRowLayout(rows, isLabelRow)!;
const dataOrder = createLabelFreeOrder(layout, rows.length);

const decode = (display: LabelDisplay<Row>): string[] =>
  Array.from(display.displayOrder, (value) =>
    value >= 0 ? rows[value].id : `[${display.labels[-value - 1].row.id}]`,
  );

// 価格降順のデータ行 order(安定ソート済み相当)。
const sortedByPriceDesc = Int32Array.from(
  Array.from(dataOrder).sort((x, y) => rows[y].price - rows[x].price),
);

describe('resolveLabelRowLayout / createLabelFreeOrder / isSameOrder', () => {
  it('ラベル行の source index とセクション番号を 1 パスで求める', () => {
    expect(Array.from(layout.labelIndexes)).toEqual([0, 3, 7, 8]);
    expect(Array.from(layout.sectionBySource)).toEqual([1, 1, 1, 2, 2, 2, 2, 3, 4, 4]);
    expect(layout.dataRowCount).toBe(6);
    expect(Array.from(dataOrder)).toEqual([1, 2, 4, 5, 6, 9]);
  });

  it('ラベル行が無ければ null', () => {
    expect(resolveLabelRowLayout(rows, () => false)).toBeNull();
    expect(resolveLabelRowLayout([], isLabelRow)).toBeNull();
  });

  it('先頭にラベル行が無い行はセクション 0', () => {
    const l = resolveLabelRowLayout([{ id: 'x', price: 1 }, rows[0], rows[1]], isLabelRow)!;
    expect(Array.from(l.sectionBySource)).toEqual([0, 1, 1]);
  });

  it('isSameOrder は長さと各要素の一致を見る', () => {
    expect(isSameOrder(dataOrder, Int32Array.from([1, 2, 4, 5, 6, 9]))).toBe(true);
    expect(isSameOrder(dataOrder, Int32Array.from([1, 2, 4, 5, 6]))).toBe(false);
    expect(isSameOrder(dataOrder, sortedByPriceDesc)).toBe(false);
  });
});

describe('buildLabelDisplay', () => {
  const build = (
    order: Int32Array,
    opts: Partial<{ sortMode: 'section' | 'follow' | 'hide'; keepEmptySections: boolean; sortActive: boolean }> = {},
  ) =>
    buildLabelDisplay({
      rows,
      order,
      layout,
      sortMode: opts.sortMode ?? 'section',
      keepEmptySections: opts.keepEmptySections ?? false,
      sortActive: opts.sortActive ?? false,
      getLabel,
    });

  it('ソート / フィルターなしでは 3 モードとも rows の並びそのもの(恒等)になる(空セクションも残る)', () => {
    for (const sortMode of ['section', 'follow', 'hide'] as const) {
      const display = build(dataOrder, { sortMode });
      expect(decode(display)).toEqual(['[L0]', 'a', 'b', '[L1]', 'c', 'd', 'e', '[L2]', '[L3]', 'f']);
      // view index = source index。
      expect(Array.from(display.labelViewIndexes)).toEqual([0, 3, 7, 8]);
      expect(display.labels.map((label) => label.sectionRowCount)).toEqual([2, 3, 0, 1]);
      expect(display.labels[0]).toMatchObject({ kind: 'label', sourceIndex: 0, label: 'label:L0', row: rows[0] });
    }
  });

  it("'section': ソートはセクション内に閉じ、境界は動かない", () => {
    const display = build(sortedByPriceDesc, { sortActive: true });
    expect(decode(display)).toEqual(['[L0]', 'a', 'b', '[L1]', 'c', 'e', 'd', '[L2]', '[L3]', 'f']);
  });

  it("'section': フィルターで空になったセクションはラベルごと消え、keepEmptySections で残る", () => {
    // c / d / e(S2)と f(S4)を除外。
    const filtered = Int32Array.from([1, 2]);
    expect(decode(build(filtered))).toEqual(['[L0]', 'a', 'b']);
    expect(decode(build(filtered, { keepEmptySections: true }))).toEqual([
      '[L0]', 'a', 'b', '[L1]', '[L2]', '[L3]',
    ]);
    const display = build(filtered, { keepEmptySections: true });
    expect(display.labels.map((label) => label.sectionRowCount)).toEqual([2, 0, 0, 0]);
    expect(Array.from(display.labelViewIndexes)).toEqual([0, 3, 4, 5]);
  });

  it("'follow': 全体順のまま、各セクションの最初のデータ行の直前にラベルが付く", () => {
    const display = build(sortedByPriceDesc, { sortMode: 'follow', sortActive: true });
    // 価格降順: c(50) e(40) a(30) d(20) b(10) f(5)
    expect(decode(display)).toEqual(['[L1]', 'c', 'e', '[L0]', 'a', 'd', 'b', '[L3]', 'f']);
    expect(display.labels.map((label) => label.row.id)).toEqual(['L1', 'L0', 'L3']);
    expect(Array.from(display.labelViewIndexes)).toEqual([0, 3, 7]);
  });

  it("'follow' + keepEmptySections: 中身の無いセクションのラベルは次のラベルの直前 / 末尾に順序どおり残る", () => {
    // S2(L1)を丸ごと除外し、価格降順。a(30) b(10) f(5)
    const filtered = Int32Array.from([1, 2, 9]);
    const display = build(filtered, { sortMode: 'follow', sortActive: true, keepEmptySections: true });
    expect(decode(display)).toEqual(['[L0]', 'a', 'b', '[L1]', '[L2]', '[L3]', 'f']);
    expect(decode(build(filtered, { sortMode: 'follow', sortActive: true }))).toEqual([
      '[L0]', 'a', 'b', '[L3]', 'f',
    ]);
  });

  it("'hide': ソート / フィルター中はラベル行を出さない(order をそのまま表示順に使う)", () => {
    const display = build(sortedByPriceDesc, { sortMode: 'hide', sortActive: true });
    expect(display.displayOrder).toBe(sortedByPriceDesc);
    expect(display.labels).toEqual([]);
    expect(display.labelViewIndexes.length).toBe(0);
    const filtered = Int32Array.from([1, 2]);
    expect(decode(build(filtered, { sortMode: 'hide' }))).toEqual(['a', 'b']);
  });
});

describe('createLabelRowModel', () => {
  const display = buildLabelDisplay({
    rows,
    order: dataOrder,
    layout,
    sortMode: 'section',
    keepEmptySections: false,
    sortActive: false,
    getLabel,
  });
  const rowModel = createLabelRowModel(display, rows, (row) => row.id);

  it('ラベル行では getRow / getSourceIndex が undefined、getLabelRow が記述子を返す', () => {
    expect(rowModel.getRowCount()).toBe(10);
    expect(rowModel.getRow(0)).toBeUndefined();
    expect(rowModel.getSourceIndex(0)).toBeUndefined();
    expect(rowModel.getLabelRow?.(0)).toMatchObject({ kind: 'label', sourceIndex: 0, label: 'label:L0' });
    expect(rowModel.getRowKey(0)).toBe('L0');
  });

  it('データ行では従来どおり', () => {
    expect(rowModel.getRow(1)).toBe(rows[1]);
    expect(rowModel.getSourceIndex(1)).toBe(1);
    expect(rowModel.getRowKey(1)).toBe('a');
    expect(rowModel.getLabelRow?.(1)).toBeUndefined();
    // OOB。
    expect(rowModel.getRow(99)).toBeUndefined();
    expect(rowModel.getLabelRow?.(99)).toBeUndefined();
  });
});

describe('wrapRowModelWithLabelRows(SSRM)', () => {
  const loaded: (Row | undefined)[] = [rows[0], rows[1], undefined, rows[3]];
  const base: RowModel<Row> = {
    getRowCount: () => 4,
    getRow: (i) => loaded[i] as Row,
    getSourceIndex: (i) => i,
    getRowKey: (i) => loaded[i]?.id ?? i,
  };
  const wrapped = wrapRowModelWithLabelRows(base, isLabelRow, getLabel);

  it('述語でラベル行を判定し、getRow / getSourceIndex を undefined に倒す', () => {
    expect(wrapped.getRow(0)).toBeUndefined();
    expect(wrapped.getSourceIndex(0)).toBeUndefined();
    expect(wrapped.getLabelRow?.(0)).toMatchObject({ kind: 'label', sourceIndex: 0, label: 'label:L0' });
    expect(wrapped.getLabelRow?.(0)?.sectionRowCount).toBeUndefined();
    // 同じ行オブジェクトなら同じ記述子(描画 memo 用)。
    expect(wrapped.getLabelRow?.(0)).toBe(wrapped.getLabelRow?.(0));
    expect(wrapped.getRowKey(0)).toBe('L0');
  });

  it('データ行 / 未ロード行は素通し', () => {
    expect(wrapped.getRow(1)).toBe(rows[1]);
    expect(wrapped.getSourceIndex(1)).toBe(1);
    expect(wrapped.getLabelRow?.(1)).toBeUndefined();
    expect(wrapped.getRow(2)).toBeUndefined();
    expect(wrapped.getLabelRow?.(2)).toBeUndefined();
    expect(wrapped.getRowKey(2)).toBe(2);
    expect(wrapped.getRowCount()).toBe(4);
  });
});

describe('補助関数', () => {
  const labelViewIndexes = Int32Array.from([0, 3, 7, 8]);

  it('countLabelsBefore / resolveDataRowNumber(ラベル行を飛ばした通し番号)', () => {
    expect(countLabelsBefore(labelViewIndexes, 0)).toBe(0);
    expect(countLabelsBefore(labelViewIndexes, 1)).toBe(1);
    expect(countLabelsBefore(labelViewIndexes, 9)).toBe(4);
    expect(resolveDataRowNumber(labelViewIndexes, 1)).toBe(1);
    expect(resolveDataRowNumber(labelViewIndexes, 2)).toBe(2);
    expect(resolveDataRowNumber(labelViewIndexes, 4)).toBe(3);
    expect(resolveDataRowNumber(labelViewIndexes, 9)).toBe(6);
    expect(resolveDataRowNumber(new Int32Array(0), 4)).toBe(5);
  });

  it('resolveSectionLabelViewIndex(現在セクションのラベル行)', () => {
    expect(resolveSectionLabelViewIndex(labelViewIndexes, 0)).toBe(0);
    expect(resolveSectionLabelViewIndex(labelViewIndexes, 2)).toBe(0);
    expect(resolveSectionLabelViewIndex(labelViewIndexes, 3)).toBe(3);
    expect(resolveSectionLabelViewIndex(labelViewIndexes, 6)).toBe(3);
    expect(resolveSectionLabelViewIndex(labelViewIndexes, 9)).toBe(8);
    expect(resolveSectionLabelViewIndex(Int32Array.from([2]), 1)).toBe(-1);
  });

  it('resolvePasteTargetViewIndexes(ラベル行を読み飛ばし、末尾追記ぶんは連番)', () => {
    const display = buildLabelDisplay({
      rows,
      order: dataOrder,
      layout,
      sortMode: 'section',
      keepEmptySections: false,
      sortActive: false,
      getLabel,
    });
    const rowModel = createLabelRowModel(display, rows, (row) => row.id);
    expect(resolvePasteTargetViewIndexes(rowModel, 1, 3)).toEqual([1, 2, 4]);
    expect(resolvePasteTargetViewIndexes(rowModel, 6, 3)).toEqual([6, 9, 10]);
    expect(resolvePasteTargetViewIndexes(rowModel, 9, 2)).toEqual([9, 10]);
    // getLabelRow の無い RowModel では連番。
    const plain: RowModel<Row> = {
      getRowCount: () => 3,
      getRow: (i) => rows[i],
      getSourceIndex: (i) => i,
      getRowKey: (i) => i,
    };
    expect(resolvePasteTargetViewIndexes(plain, 1, 3)).toEqual([1, 2, 3]);
  });
});
