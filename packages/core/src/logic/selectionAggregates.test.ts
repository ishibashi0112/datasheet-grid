// 追加(選択範囲の集計): 対象レンジの解決とセル値の集計(数値の判定・空・グループ行 / ラベル行・SSRM の未読み込み)を固定します。
import { describe, expect, it } from 'vitest';

import {
  computeSelectionAggregates,
  createSelectionAggregateTargetStabilizer,
  formatSelectionAggregateNumber,
  resolveSelectionAggregateTarget,
} from './selectionAggregates';
import { DETAIL_TOGGLE_COLUMN_KEY } from './detailRow';
import type { GridColumn, GridGroupRow, GridLabelRow, GridSelection, RowModel } from '../model/gridTypes.unbound';

type Row = { name: unknown; qty: unknown; price: unknown };

const columns: GridColumn<Row>[] = [
  { key: 'name', width: 100 },
  { key: 'qty', width: 100 },
  { key: 'price', width: 100 },
];

const rows: Row[] = [
  { name: 'a', qty: 10, price: '1.5' },
  { name: 'b', qty: '', price: 2 },
  { name: 'c', qty: '  ', price: null },
  { name: 'd', qty: true, price: undefined },
  { name: 'e', qty: -4, price: 'x' },
];

const modelOf = (view: (Row | undefined)[], extra: Partial<RowModel<Row>> = {}): RowModel<Row> => ({
  getRowCount: () => view.length,
  getRow: (index) => view[index] as Row,
  getSourceIndex: (index) => index,
  getRowKey: (index) => index,
  ...extra,
});

const cellRange = (r0: number, c0: number, r1: number, c1: number): GridSelection => ({
  type: 'cell',
  range: { start: { row: r0, col: c0 }, end: { row: r1, col: c1 } },
});

describe('resolveSelectionAggregateTarget', () => {
  it('選択なし / 1 セルだけは null(集計しない)', () => {
    expect(resolveSelectionAggregateTarget(null, 5, columns)).toBeNull();
    expect(resolveSelectionAggregateTarget(cellRange(1, 1, 1, 1), 5, columns)).toBeNull();
  });

  it('2 セル以上はレンジと範囲内の列。逆向きのドラッグも正規化し、ビュー外はクランプする', () => {
    const target = resolveSelectionAggregateTarget(cellRange(9, 2, 3, 1), 5, columns);
    expect(target).toEqual({ startRow: 3, endRow: 4, columns: [columns[1], columns[2]] });
  });

  it('行選択は全列、列選択は全行', () => {
    expect(
      resolveSelectionAggregateTarget({ type: 'row', startRow: 1, endRow: 2 }, 5, columns)?.columns,
    ).toEqual(columns);
    expect(resolveSelectionAggregateTarget({ type: 'col', startCol: 1, endCol: 1 }, 5, columns)).toEqual({
      startRow: 0,
      endRow: 4,
      columns: [columns[1]],
    });
  });

  it('合成列(展開トグル等)は数えない。合成列だけの範囲は null', () => {
    const withToggle: GridColumn<Row>[] = [{ key: DETAIL_TOGGLE_COLUMN_KEY, width: 28 }, ...columns];
    expect(resolveSelectionAggregateTarget(cellRange(0, 0, 1, 1), 5, withToggle)?.columns).toEqual([columns[0]]);
    expect(resolveSelectionAggregateTarget(cellRange(0, 0, 1, 0), 5, withToggle)).toBeNull();
  });
});

// 追加(見直し): columns をインラインで渡されても(毎回新しい配列・新しい列オブジェクト)、対象の参照を保つ。
describe('createSelectionAggregateTargetStabilizer', () => {
  const freshColumns = (): GridColumn<Row>[] => columns.map((column) => ({ ...column }));

  it('同じ範囲・同じ列(key と getValue)なら前回の対象を返す。幅など他の定義の違いは同じとみなす', () => {
    const stabilize = createSelectionAggregateTargetStabilizer<Row>();
    const first = stabilize(resolveSelectionAggregateTarget(cellRange(0, 0, 4, 2), 5, columns));
    const widened = freshColumns().map((column) => ({ ...column, width: 200 }));
    expect(stabilize(resolveSelectionAggregateTarget(cellRange(0, 0, 4, 2), 5, widened))).toBe(first);
  });

  it('範囲・列の key・getValue のどれかが違えば新しい対象。null を挟んだら前回を忘れる', () => {
    const stabilize = createSelectionAggregateTargetStabilizer<Row>();
    const first = stabilize(resolveSelectionAggregateTarget(cellRange(0, 0, 4, 2), 5, columns));
    const otherRange = stabilize(resolveSelectionAggregateTarget(cellRange(0, 0, 3, 2), 5, freshColumns()));
    expect(otherRange).not.toBe(first);
    const withGetter = freshColumns();
    withGetter[1] = { ...withGetter[1], getValue: (row) => row.qty };
    const getterTarget = stabilize(resolveSelectionAggregateTarget(cellRange(0, 0, 3, 2), 5, withGetter));
    expect(getterTarget).not.toBe(otherRange);
    expect(stabilize(null)).toBeNull();
    expect(stabilize(resolveSelectionAggregateTarget(cellRange(0, 0, 3, 2), 5, withGetter))).not.toBe(getterTarget);
  });
});

describe('computeSelectionAggregates', () => {
  it('数値と数値の文字列だけを合計・平均・最小・最大へ。空は個数にも数えない', () => {
    const target = resolveSelectionAggregateTarget(cellRange(0, 1, 4, 2), 5, columns);
    const result = computeSelectionAggregates(modelOf(rows), target!);
    // qty: 10 / '' / '  ' / true / -4 、price: '1.5' / 2 / null / undefined / 'x'
    //   空(数えない)= '' / null / undefined。空白だけ・true・'x' は個数に入るが数値ではない。
    expect(result).toEqual({
      status: 'ready',
      progress: 1,
      cellCount: 10,
      count: 7,
      numericCount: 4,
      sum: 9.5,
      average: 9.5 / 4,
      min: -4,
      max: 10,
      partial: false,
    });
  });

  it('数値が 1 つも無ければ sum / average / min / max は undefined', () => {
    const target = resolveSelectionAggregateTarget(cellRange(0, 0, 4, 0), 5, columns);
    const result = computeSelectionAggregates(modelOf(rows), target!);
    expect(result.count).toBe(5);
    expect(result.numericCount).toBe(0);
    expect(result.sum).toBeUndefined();
    expect(result.average).toBeUndefined();
    expect(result.min).toBeUndefined();
    expect(result.max).toBeUndefined();
  });

  it('グループ行・ラベル行は飛ばし(partial にしない)、どちらでもない未読み込み行は飛ばして partial', () => {
    const view = [rows[0], undefined, rows[1], undefined];
    const target = resolveSelectionAggregateTarget(cellRange(0, 1, 3, 1), view.length, columns)!;
    const grouped = modelOf(view, {
      getGroupRow: (index) => (index === 1 ? ({ groupKey: 'g' } as GridGroupRow) : undefined),
      getLabelRow: (index) => (index === 3 ? ({ label: 'L' } as GridLabelRow<Row>) : undefined),
    });
    expect(computeSelectionAggregates(grouped, target)).toMatchObject({ cellCount: 2, count: 1, sum: 10, partial: false });
    expect(computeSelectionAggregates(modelOf(view), target)).toMatchObject({ cellCount: 2, sum: 10, partial: true });
  });

  it('getValue を持つ列はその値で数える', () => {
    const derived: GridColumn<Row>[] = [{ key: 'total', width: 100, getValue: (row) => Number(row.qty) * 2 }];
    const target = resolveSelectionAggregateTarget(cellRange(0, 0, 1, 0), 2, derived)!;
    expect(computeSelectionAggregates(modelOf([rows[0], rows[4]]), target).sum).toBe(12);
  });
});

describe('formatSelectionAggregateNumber', () => {
  it('浮動小数の誤差を丸め、小数は 4 桁まで、桁区切りあり', () => {
    expect(formatSelectionAggregateNumber(0.1 + 0.2)).toBe((0.3).toLocaleString());
    expect(formatSelectionAggregateNumber(1234567)).toBe((1234567).toLocaleString());
    expect(formatSelectionAggregateNumber(2 / 3)).toBe((0.6667).toLocaleString(undefined, { maximumFractionDigits: 4 }));
  });
});