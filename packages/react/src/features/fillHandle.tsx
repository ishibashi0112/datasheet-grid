// 追加(差し込み式 段階 2): フィルハンドル(fillHandle prop)の機能です。中身はシェル(GridShell.tsx)にあった
//   フィルハンドルの節をそのまま移したもので、シェルは元の位置で useFillHandle を呼びます(中の hook の順番は
//   シェルにあったときと同じ)。機能セットに無い構成では代役(features/resolve.ts。何も描かない)が受けます。
import { useCallback, useMemo, type PointerEvent } from 'react';
import {
  FillHandle,
  FillOptionsChip,
  FillOptionsMenu,
  FillPreviewOverlay,
  FillTooltip,
} from '../view/FillHandleLayer';
import { useFillHandleController } from '../hooks/useFillHandleController';
import {
  hasFillableSource,
  resolveFillCornerPlacement,
  resolveFillOptionsChipPosition,
  resolveFillSource,
} from '@ishibashi0112/spreadsheet-grid-core/logic/fillHandle';
import {
  resolveSelectionBand,
  resolveSelectionBandSegments,
  resolveSelectionExtents,
} from '@ishibashi0112/spreadsheet-grid-core/logic/selectionOverlayGeometry';
import type { ColumnPane } from '@ishibashi0112/spreadsheet-grid-core/logic/geometry';
import type { SelectionOverlayRect } from '../SelectionOverlay';
import type { GridSelection } from '../model/gridTypes';
import type { FillHandleFeatureArgs, FillHandleFeatureResult, ReactGridFeatures } from './types';

const useFillHandleFeature = <T,>({
  fillHandle,
  readOnly,
  isServerSide,
  rows,
  rowModel,
  orderedColumns,
  uiState,
  serverSideQueryKey,
  serverSideRefreshToken,
  canEditCell,
  dispatch,
  getCellCoordFromClientPoint,
  scrollContainerRef,
  gridRootRef,
  footerHeight,
  handleRowsChange,
  amendRowsChange,
  applyServerSideCellEdits,
  viewRowCount,
  paneLayout,
  rowMetrics,
  windowFirstRow,
  windowLastRow,
  detailActive,
  detailExtras,
  viewportHeight,
  scrollTop,
  headerHeight,
  overlayBaseOffset,
  portalClassName,
}: FillHandleFeatureArgs<T>): FillHandleFeatureResult => {
  // 追加(フィルハンドル 1A): 選択範囲(無ければアクティブセル)の右下の四角を引いて、連続データ / セルのコピーで
  //   埋めます。書き込みは貼り付けと同じ規則(編集可否 / reject / ラベル行・グループ行を飛ばす)で、clientSide は
  //   履歴付きの handleRowsChange、serverSide は書き戻し口(updateRows)へ流します。readOnly・書き込み先なしでは休眠。
  const fillHandleOptions = typeof fillHandle === 'object' ? fillHandle : undefined;
  const fillHandleEnabled =
    Boolean(fillHandle) &&
    !readOnly &&
    (isServerSide ? applyServerSideCellEdits !== undefined : handleRowsChange !== undefined);
  const { fillController, fillSnapshot, fillChipRef, fillMenuRef } = useFillHandleController({
    enabled: fillHandleEnabled,
    isServerSide,
    rows,
    rowModel,
    columns: orderedColumns,
    selection: uiState.selection,
    activeCell: uiState.activeCell,
    editing: uiState.editingCell !== null,
    // 変更(見直し): 表示の条件が変わったら埋めたあとのボタンを消します(並びが変わった行へ選び直さない)。
    viewKey: [
      uiState.sort,
      uiState.filters,
      uiState.collapsedGroupKeys,
      serverSideQueryKey,
      serverSideRefreshToken,
    ],
    readOnly,
    canEditCell,
    getFillValue: fillHandleOptions?.getFillValue,
    dispatch,
    hitTest: getCellCoordFromClientPoint,
    scrollContainerRef,
    gridRootRef,
    footerHeight,
    applyRowsChange: handleRowsChange,
    amendRowsChange,
    applyServerSideCellEdits,
  });
  // ハンドルを出す角(範囲選択中のドラッグ・編集中・行 / 列選択では出さない)。
  const fillHandleCorner = useMemo(() => {
    if (!fillHandleEnabled || uiState.editingCell || uiState.dragState?.type === 'selection') {
      return null;
    }
    const source = resolveFillSource(uiState.selection, uiState.activeCell, viewRowCount, orderedColumns.length);
    // 変更(見直し): 合成列だけ / ラベル行・グループ行だけの範囲には出しません(埋める値が無い)。
    if (!source || !hasFillableSource(source, rowModel, orderedColumns)) {
      return null;
    }
    return resolveFillCornerPlacement(source, paneLayout, rowMetrics, windowFirstRow, windowLastRow);
  }, [
    fillHandleEnabled,
    uiState.editingCell,
    uiState.dragState,
    uiState.selection,
    uiState.activeCell,
    viewRowCount,
    orderedColumns,
    rowModel,
    paneLayout,
    rowMetrics,
    windowFirstRow,
    windowLastRow,
  ]);
  // ドラッグ中の点線(元の範囲 + 埋める範囲)。ペイン別の矩形(展開行の帯は避ける)。
  const fillPreviewSelection = useMemo<GridSelection>(() => {
    if (fillSnapshot.status !== 'dragging' || fillSnapshot.target === null) {
      return null;
    }
    const { source, target } = fillSnapshot;
    return {
      type: 'cell',
      range: {
        start: {
          row: Math.min(source.startRow, target.range.startRow),
          col: Math.min(source.startCol, target.range.startCol),
        },
        end: {
          row: Math.max(source.endRow, target.range.endRow),
          col: Math.max(source.endCol, target.range.endCol),
        },
      },
    };
  }, [fillSnapshot]);
  const fillPreviewRectsForPane = useMemo(() => {
    const extents = resolveSelectionExtents(fillPreviewSelection, paneLayout, viewRowCount);
    const segments = resolveSelectionBandSegments(
      detailActive,
      extents,
      windowFirstRow,
      windowLastRow,
      rowMetrics,
      detailExtras,
    );
    const band = segments ? null : resolveSelectionBand(extents, windowFirstRow, windowLastRow, rowMetrics);
    return (pane: ColumnPane): SelectionOverlayRect[] => {
      const extent = extents?.extents[pane];
      if (!extent) {
        return [];
      }
      if (segments) {
        return segments.map((segment) => ({
          left: extent.start,
          top: segment.top,
          width: extent.width,
          height: segment.height,
        }));
      }
      return band ? [{ left: extent.start, top: band.top, width: extent.width, height: band.height }] : [];
    };
  }, [fillPreviewSelection, paneLayout, viewRowCount, detailActive, windowFirstRow, windowLastRow, rowMetrics, detailExtras]);
  // 埋めたあとのボタンの位置(埋めた範囲の右下)。
  const fillChipPlacement = useMemo(() => {
    if (fillSnapshot.status !== 'filled') {
      return null;
    }
    const corner = resolveFillCornerPlacement(fillSnapshot.range, paneLayout, rowMetrics, windowFirstRow, windowLastRow);
    // 変更(見直し): 本体の行が見えている下端(合計行があればその上端)を超えるなら角の上へ出します。座標は
    //   overlay と同じ(行の座標 − baseOffset + 見出しの高さ = スクロールコンテナ内の位置)。未計測なら使いません。
    const visibleBottom =
      viewportHeight > 0 ? scrollTop + viewportHeight - headerHeight + overlayBaseOffset : Number.POSITIVE_INFINITY;
    return corner
      ? {
          pane: corner.pane,
          position: resolveFillOptionsChipPosition(corner, rowMetrics.totalBodyHeight, visibleBottom),
        }
      : null;
  }, [
    fillSnapshot,
    paneLayout,
    rowMetrics,
    windowFirstRow,
    windowLastRow,
    viewportHeight,
    scrollTop,
    headerHeight,
    overlayBaseOffset,
  ]);
  const handleFillHandlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => fillController.handlePointerDown(event),
    [fillController],
  );
  // 3 ペイン共通: ハンドル / 点線 / ボタン(各ペインの overlay 層の中、アクティブセル枠の上)。
  const renderFillHandleLayer = (pane: ColumnPane, leadingWidth: number) => (
    <>
      {fillPreviewRectsForPane(pane).map((rect, segmentIndex) => (
        <FillPreviewOverlay
          key={segmentIndex}
          rect={rect}
          headerHeight={headerHeight}
          baseOffset={overlayBaseOffset}
          leadingWidth={leadingWidth}
        />
      ))}
      <FillHandle
        corner={fillHandleCorner?.pane === pane ? fillHandleCorner : null}
        headerHeight={headerHeight}
        baseOffset={overlayBaseOffset}
        leadingWidth={leadingWidth}
        onPointerDown={handleFillHandlePointerDown}
      />
      {fillSnapshot.status === 'filled' && (
        <FillOptionsChip
          position={fillChipPlacement?.pane === pane ? fillChipPlacement.position : null}
          headerHeight={headerHeight}
          baseOffset={overlayBaseOffset}
          leadingWidth={leadingWidth}
          kind={fillSnapshot.kind}
          menuOpen={fillSnapshot.menu !== null}
          chipRef={fillChipRef}
          controller={fillController}
        />
      )}
    </>
  );

  return {
    filling: fillSnapshot.status === 'dragging',
    renderLayer: renderFillHandleLayer,
    // 埋めたあとのメニュー / ドラッグ中の値のツールチップ(ポータル)。
    renderPortals: () => (
      <>
        {fillSnapshot.status === 'filled' && fillSnapshot.menu !== null && (
          <FillOptionsMenu
            layout={fillSnapshot.menu}
            kind={fillSnapshot.kind}
            seriesAvailable={fillSnapshot.seriesAvailable}
            themeClassName={portalClassName}
            panelRef={fillMenuRef}
            controller={fillController}
          />
        )}
        {fillSnapshot.status === 'dragging' && fillSnapshot.previewText !== null && (
          <FillTooltip
            text={fillSnapshot.previewText}
            themeClassName={portalClassName}
            controller={fillController}
          />
        )}
      </>
    ),
  };
};

export const fillHandleFeature: NonNullable<ReactGridFeatures['fillHandle']> = {
  useFillHandle: useFillHandleFeature,
};