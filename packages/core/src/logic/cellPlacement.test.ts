// 追加(Solid 版 段階 0-3): オーバーレイのペインの矩形と aria-activedescendant の判断(logic/cellPlacement)のテストです。
//   React 版の結合テスト(アクティブセルの枠 / エディタ / 選択範囲 / コピー範囲 / クロスヘア / aria-activedescendant)が
//   描いた結果を広く見ているので、こちらはペインの振り分けと範囲の外の扱いを固定します。
import { describe, expect, it } from 'vitest';
import {
  isActiveCellRendered,
  placementRectInPane,
  resolveCellPlacement,
  resolveColumnHoverRect,
  resolvePaneBandRect,
  resolvePaneSegmentRects,
} from './cellPlacement';
import { buildGridPaneLayout } from './geometry';
import { createUniformRowMetrics } from './verticalGeometry';
import { resolveSelectionExtents } from './selectionOverlayGeometry';
import type { GridColumn, RowModel } from '../model/gridTypes.unbound';

type Row = { a: string };
// 左固定 1 列(60px)+ 中央 2 列(100px / 80px)+ 右固定 1 列(50px)。
const ordered: GridColumn<Row>[] = [
  { key: 'l', title: 'L', width: 60, pinned: 'left' },
  { key: 'c1', title: 'C1', width: 100 },
  { key: 'c2', title: 'C2', width: 80 },
  { key: 'r', title: 'R', width: 50, pinned: 'right' },
];
const layout = buildGridPaneLayout(ordered, { l: 60, c1: 100, c2: 80, r: 50 });
const metrics = createUniformRowMetrics(10, 30);

describe('cellPlacement', () => {
  it('resolveCellPlacement: ペインとペインのローカル矩形。行が表の外 / null は null', () => {
    expect(resolveCellPlacement({ row: 2, col: 2 }, 10, layout, metrics)).toEqual({
      pane: 'center',
      rect: { left: 100, top: 60, width: 80, height: 30 },
    });
    expect(resolveCellPlacement({ row: 0, col: 0 }, 10, layout, metrics)?.pane).toBe('left');
    expect(resolveCellPlacement({ row: 0, col: 3 }, 10, layout, metrics)).toEqual({
      pane: 'right',
      rect: { left: 0, top: 0, width: 50, height: 30 },
    });
    expect(resolveCellPlacement({ row: 10, col: 0 }, 10, layout, metrics)).toBeNull();
    expect(resolveCellPlacement({ row: -1, col: 0 }, 10, layout, metrics)).toBeNull();
    expect(resolveCellPlacement({ row: 0, col: 9 }, 10, layout, metrics)).toBeNull();
    expect(resolveCellPlacement(null, 10, layout, metrics)).toBeNull();
  });

  it('placementRectInPane: そのペインにあるときだけ矩形', () => {
    const placement = resolveCellPlacement({ row: 1, col: 1 }, 10, layout, metrics);
    expect(placementRectInPane(placement, 'center')).toEqual({ left: 0, top: 30, width: 100, height: 30 });
    expect(placementRectInPane(placement, 'left')).toBeNull();
    expect(placementRectInPane(null, 'center')).toBeNull();
  });

  it('resolvePaneBandRect / resolvePaneSegmentRects: 選択の横の範囲 × 縦の帯。ペインに列が無ければ null', () => {
    const extents = resolveSelectionExtents(
      { type: 'cell', range: { start: { row: 1, col: 0 }, end: { row: 3, col: 1 } } },
      layout,
      10,
    );
    const band = { top: 30, height: 90 };
    expect(resolvePaneBandRect(extents, band, 'left')).toEqual({ left: 0, top: 30, width: 60, height: 90 });
    expect(resolvePaneBandRect(extents, band, 'center')).toEqual({ left: 0, top: 30, width: 100, height: 90 });
    expect(resolvePaneBandRect(extents, band, 'right')).toBeNull();
    expect(resolvePaneBandRect(extents, null, 'left')).toBeNull();
    expect(resolvePaneBandRect(null, band, 'left')).toBeNull();
    const segments = [
      { top: 30, height: 30 },
      { top: 100, height: 60 },
    ];
    expect(resolvePaneSegmentRects(extents, segments, 'center')).toEqual([
      { left: 0, top: 30, width: 100, height: 30 },
      { left: 0, top: 100, width: 100, height: 60 },
    ]);
    expect(resolvePaneSegmentRects(extents, null, 'center')).toBeNull();
    expect(resolvePaneSegmentRects(extents, segments, 'right')).toBeNull();
  });

  it('resolveColumnHoverRect: そのペインの列の、描画窓の縦の範囲', () => {
    expect(resolveColumnHoverRect(2, 'center', layout, metrics, 2, 5)).toEqual({ left: 100, top: 60, width: 80, height: 120 });
    expect(resolveColumnHoverRect(2, 'left', layout, metrics, 2, 5)).toBeNull();
    expect(resolveColumnHoverRect(null, 'center', layout, metrics, 2, 5)).toBeNull();
    expect(resolveColumnHoverRect(2, 'center', layout, metrics, 5, 4)).toBeNull();
  });

  it('isActiveCellRendered: 行が描かれ、行のデータがあり、列がどれかのペインに描かれているときだけ', () => {
    // 4 行目は読み込んでいない行(getRow が undefined。型は RowModel に合わせる)。
    const rowModel: Pick<RowModel<Row>, 'getRow'> = { getRow: (i) => (i === 4 ? undefined : { a: 'x' }) as Row };
    const panes = [layout.left.entries, layout.center.entries.slice(0, 1), layout.right.entries];
    const rendered = new Set([0, 1, 2, 3, 4]);
    expect(isActiveCellRendered({ row: 1, col: 0 }, rendered, rowModel, panes)).toBe(true);
    expect(isActiveCellRendered({ row: 1, col: 1 }, rendered, rowModel, panes)).toBe(true);
    // 中央の 2 列目は横の仮想化で描かれていない。
    expect(isActiveCellRendered({ row: 1, col: 2 }, rendered, rowModel, panes)).toBe(false);
    // 縦の仮想化で外れた行 / 読み込んでいない行。
    expect(isActiveCellRendered({ row: 7, col: 0 }, rendered, rowModel, panes)).toBe(false);
    expect(isActiveCellRendered({ row: 4, col: 0 }, rendered, rowModel, panes)).toBe(false);
    expect(isActiveCellRendered(null, rendered, rowModel, panes)).toBe(false);
  });
});