// 追加(本体分解 E-3): 縦レイアウトのリゾルバの単体テストです(uniform 経路 / auto-height gate / 展開行の帯 /
//   no-op 入力での参照安定)。
import { describe, it, expect } from 'vitest';
import { createVerticalLayoutResolver, type VerticalLayoutInputs } from './verticalLayout';
import type { GridColumn, RowModel } from '../model/gridTypes';
import { createDetailIndexCache } from '../logic/detailRow';

type Row = { id: number; text: string };

const rows: Row[] = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, text: `r${i}` }));
const rowModel: RowModel<Row> = {
  getRowCount: () => rows.length,
  getRow: (i) => rows[i],
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id ?? i,
};
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'text', title: '本文', width: 200, autoHeight: true },
];

const baseInputs = (): VerticalLayoutInputs<Row> => ({
  isServerSide: false,
  autoHeight: false,
  visibleColumns: columns,
  viewRowCount: rows.length,
  estimateRowHeight: 32,
  rowHeight: 32,
  headerHeight: 36,
  viewportHeight: 320,
  scrollTop: 0,
  rowModel,
  measuredHeights: new Map(),
  autoHeightVersion: 0,
  detailRowEnabled: false,
  expandedDetailRowKeys: new Set(),
  detailHeight: 200,
  detailIsExpandable: undefined,
  detailIndexCache: createDetailIndexCache(),
});

describe('createVerticalLayoutResolver', () => {
  it('uniform 経路: 駆動列があっても autoHeight=false なら行高ストアなし、描画窓は overscan 込み', () => {
    const resolve = createVerticalLayoutResolver<Row>();
    const first = resolve(baseInputs());
    expect(first.hasAutoHeightColumn).toBe(true);
    expect(first.autoHeightActive).toBe(false);
    expect(first.rowHeightStore).toBeNull();
    expect(first.detailActive).toBe(false);
    expect(first.rowMetrics).toBe(first.baseRowMetrics);
    expect(first.windowFirstRow).toBe(0);
    // 可視 10 行(320px / 32px)+ 端の部分行 + overscan 20。
    expect(first.windowLastRow).toBe(30);
    expect(first.physicalBodyHeight).toBe(32 * 100);
    expect(first.verticalScaleFactor).toBe(1);
    expect(first.bodyLayerTransform).toBeUndefined();
    expect(first.detailEntries).toHaveLength(0);
    // 同じ入力なら参照不変。
    const second = resolve(baseInputs());
    expect(second.rowMetrics).toBe(first.rowMetrics);
    expect(second.virtualRows).toBe(first.virtualRows);
    expect(second.detailEntries).toBe(first.detailEntries);
  });

  it('auto-height 経路: 行高ストアを estimate で構築し、serverSide では常に無効', () => {
    const resolve = createVerticalLayoutResolver<Row>();
    const measured = new Map<number, number>([[1, 80]]);
    const active = resolve({ ...baseInputs(), autoHeight: true, measuredHeights: measured });
    expect(active.autoHeightActive).toBe(true);
    expect(active.rowHeightStore).not.toBeNull();
    // 行 0(rowKey 1)は実測 80、他は estimate 32。
    expect(active.rowMetrics.rowTop(1)).toBe(80);
    expect(active.rowMetrics.rowTop(2)).toBe(112);
    // version が変わればメトリクスは作り直される(ストアは同一)。
    const bumped = resolve({ ...baseInputs(), autoHeight: true, measuredHeights: measured, autoHeightVersion: 1 });
    expect(bumped.rowHeightStore).toBe(active.rowHeightStore);
    expect(bumped.rowMetrics).not.toBe(active.rowMetrics);
    const server = resolve({ ...baseInputs(), autoHeight: true, isServerSide: true });
    expect(server.autoHeightActive).toBe(false);
  });

  it('展開行: 展開中キーの帯を rowMetrics に足し、描画窓内のマスター行を detailEntries に出す', () => {
    const resolve = createVerticalLayoutResolver<Row>();
    const result = resolve({
      ...baseInputs(),
      detailRowEnabled: true,
      expandedDetailRowKeys: new Set([3]),
    });
    expect(result.detailActive).toBe(true);
    expect(result.detailExtras).toEqual([{ index: 2, height: 200 }]);
    // 行 3(index 3)の top は帯 200px ぶん下がる。
    expect(result.rowMetrics.rowTop(3)).toBe(32 * 3 + 200);
    expect(result.detailEntries.map((entry) => entry.rowKey)).toEqual([3]);
  });
});