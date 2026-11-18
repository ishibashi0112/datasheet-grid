// 追加(Solid 版 段階 0-3): オーバーレイ(アクティブセルの枠 / エディタ / 選択範囲 / コピー範囲 / クロスヘアの列の帯)の
//   ペインごとの矩形と、シェルの aria-activedescendant を付けてよいかの判断です(React 版の GridShell.tsx の useCallback /
//   useMemo の本体を移設。Solid 版と共用)。矩形の left はペインの列領域のローカル座標(leadingWidth を含まない)で、
//   top は行の論理座標(描画窓の基準オフセットは描く側が引く)です。
import type { CellCoord, RowModel } from '../model/gridTypes.unbound';
import { computeSinglePaneColumnExtent, type ColumnPane, type GridPaneLayout, type PaneColumnEntry } from './geometry';
import type { RowBand, SelectionExtents } from './selectionOverlayGeometry';
import type { RowMetrics } from './verticalGeometry';

export type PaneRect = { left: number; top: number; width: number; height: number };

export type CellPlacement = { pane: ColumnPane; rect: PaneRect };

// セルが属するペインと、そのペインのローカル矩形(行が表の外 / 列がどのペインにも無ければ null)。高さは展開行の帯を
//   含まないセルの行の高さです。アクティブセルと編集中のセルの両方に使います(エディタは編集中のセルに重ねる = FC-10)。
export const resolveCellPlacement = <T,>(
  cell: CellCoord | null,
  viewRowCount: number,
  paneLayout: GridPaneLayout<T>,
  rowMetrics: Pick<RowMetrics, 'rowTop' | 'cellHeight'>,
): CellPlacement | null => {
  if (!cell || cell.row < 0 || cell.row >= viewRowCount) {
    return null;
  }
  const single = computeSinglePaneColumnExtent(paneLayout, cell.col);
  if (!single) {
    return null;
  }
  return {
    pane: single.pane,
    rect: {
      left: single.extent.start,
      top: rowMetrics.rowTop(cell.row),
      width: single.extent.width,
      height: rowMetrics.cellHeight(cell.row),
    },
  };
};

// 指定のペインにあるときだけ矩形を返します。
export const placementRectInPane = (placement: CellPlacement | null, pane: ColumnPane): PaneRect | null =>
  placement && placement.pane === pane ? placement.rect : null;

// 選択範囲(またはコピー範囲)のペインの矩形(1 本の帯)。そのペインに列が無い / 窓の外なら null。
export const resolvePaneBandRect = (
  extents: SelectionExtents | null,
  band: RowBand | null,
  pane: ColumnPane,
): PaneRect | null => {
  const extent = extents?.extents[pane];
  if (!extent || !band) {
    return null;
  }
  return { left: extent.start, top: band.top, width: extent.width, height: band.height };
};

// 展開行があるときの、展開行の帯を避けた矩形の並び(展開行が無いとき = segments が null なら null)。
export const resolvePaneSegmentRects = (
  extents: SelectionExtents | null,
  segments: ReadonlyArray<RowBand> | null,
  pane: ColumnPane,
): PaneRect[] | null => {
  const extent = extents?.extents[pane];
  if (!segments || !extent) {
    return null;
  }
  return segments.map((segment) => ({ left: extent.start, top: segment.top, width: extent.width, height: segment.height }));
};

// クロスヘア(hoverHighlight: 'cross')のポインタの列の帯。描画窓の縦の範囲だけを覆います。
export const resolveColumnHoverRect = <T,>(
  columnIndex: number | null,
  pane: ColumnPane,
  paneLayout: GridPaneLayout<T>,
  rowMetrics: Pick<RowMetrics, 'rowTop'>,
  windowFirstRow: number,
  windowLastRow: number,
): PaneRect | null => {
  if (columnIndex === null || windowLastRow < windowFirstRow) {
    return null;
  }
  const single = computeSinglePaneColumnExtent(paneLayout, columnIndex);
  if (!single || single.pane !== pane) {
    return null;
  }
  const top = rowMetrics.rowTop(windowFirstRow);
  return { left: single.extent.start, top, width: single.extent.width, height: rowMetrics.rowTop(windowLastRow + 1) - top };
};

// シェルの aria-activedescendant でアクティブセルを指してよいか(audit V-05)。参照先のセルが描かれているときだけ
//   true です(縦横の仮想化で外れた / グループ行・ラベル行・読み込んでいない行は描かれない = 存在しない id を指さない)。
export const isActiveCellRendered = <T,>(
  cell: CellCoord | null,
  renderedRows: { has: (row: number) => boolean },
  rowModel: Pick<RowModel<T>, 'getRow'>,
  paneEntries: ReadonlyArray<ReadonlyArray<PaneColumnEntry<T> | undefined>>,
): boolean => {
  if (cell === null || !renderedRows.has(cell.row) || rowModel.getRow(cell.row) === undefined) {
    return false;
  }
  return paneEntries.some((entries) => entries.some((entry) => entry?.logicalIndex === cell.col));
};