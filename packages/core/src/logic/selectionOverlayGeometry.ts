// 追加(motion-4 / M-3): 選択(GridSelection)から「ペイン別の横の範囲」と「描画窓にクリップした縦の帯」を求める純関数です。
//   旧 SpreadsheetGrid.tsx の selectionExtents / selectionBand / selectionBandSegments の useMemo 本体を移設し、
//   ライブの選択(範囲選択の塗り)とコピー範囲(動く点線)の両方が同じ計算を使います。
import type { GridSelection } from '../model/gridTypes.unbound';
import {
  normalizeCellRange,
  normalizeColumnRange,
  normalizeRowRange,
} from '../model/gridSelectors';
import {
  computeFullWidthPaneExtents,
  computePaneColumnExtents,
  type GridPaneLayout,
  type PaneColumnExtentMap,
} from './geometry';
import { clipRowRangeToWindow, type DetailRowExtra, type RowMetrics } from './verticalGeometry';
import { splitRowBandByDetail } from './detailRow';

export type SelectionExtents = {
  extents: PaneColumnExtentMap;
  startRow: number;
  endRow: number;
};

export type RowBand = { top: number; height: number };

// 選択 → ペイン別の横の範囲 + 行範囲。col 選択は全行(窓クリップ側で帯に畳む)、row 選択は全ペインの全列。
export const resolveSelectionExtents = <T,>(
  selection: GridSelection,
  paneLayout: GridPaneLayout<T>,
  viewRowCount: number,
): SelectionExtents | null => {
  if (!selection) {
    return null;
  }
  if (selection.type === 'cell') {
    const normalizedRange = normalizeCellRange(selection.range);
    return {
      extents: computePaneColumnExtents(
        paneLayout,
        normalizedRange.start.col,
        normalizedRange.end.col,
      ),
      startRow: normalizedRange.start.row,
      endRow: normalizedRange.end.row,
    };
  }
  if (selection.type === 'row') {
    const normalizedRange = normalizeRowRange(selection.startRow, selection.endRow);
    return {
      extents: computeFullWidthPaneExtents(paneLayout),
      startRow: normalizedRange.startRow,
      endRow: normalizedRange.endRow,
    };
  }
  const normalizedRange = normalizeColumnRange(selection.startCol, selection.endCol);
  return {
    extents: computePaneColumnExtents(
      paneLayout,
      normalizedRange.startCol,
      normalizedRange.endCol,
    ),
    startRow: 0,
    endRow: Math.max(viewRowCount - 1, 0),
  };
};

// 縦帯(スクロール依存): 行範囲を描画窓へクリップし、rowMetrics で top / height を求めます。窓と交差しない
//   (画面外へ完全にスクロールアウトした)選択は null。
export const resolveSelectionBand = (
  extents: SelectionExtents | null,
  windowFirstRow: number,
  windowLastRow: number,
  rowMetrics: Pick<RowMetrics, 'rowTop' | 'rowsHeight'>,
): RowBand | null => {
  if (!extents) {
    return null;
  }
  const clipped = clipRowRangeToWindow(extents.startRow, extents.endRow, windowFirstRow, windowLastRow);
  if (!clipped) {
    return null;
  }
  return {
    top: rowMetrics.rowTop(clipped.start),
    height: rowMetrics.rowsHeight(clipped.start, clipped.end),
  };
};

// 展開行があるとき、縦帯を detail 帯を避けた複数セグメントへ分割します(展開行なしでは null = 1 本の帯を使う)。
export const resolveSelectionBandSegments = (
  detailActive: boolean,
  extents: SelectionExtents | null,
  windowFirstRow: number,
  windowLastRow: number,
  rowMetrics: RowMetrics,
  detailExtras: readonly DetailRowExtra[],
): ReadonlyArray<RowBand> | null => {
  if (!detailActive || !extents) {
    return null;
  }
  const clipped = clipRowRangeToWindow(extents.startRow, extents.endRow, windowFirstRow, windowLastRow);
  if (!clipped) {
    return null;
  }
  return splitRowBandByDetail(clipped.start, clipped.end, rowMetrics, detailExtras);
};
