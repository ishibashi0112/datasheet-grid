// 追加(本体分解 E-3): 縦レイアウトの派生値計算です(React 非依存。旧 SpreadsheetGrid.tsx の
//   「auto-height gate / 行高ストア(C1)」「縦ジオメトリ」「展開行の帯」セクションを移設)。
//   - auto-height の gate(props 有効 + 駆動列あり + 行数上限内 + clientSide)→ 行高ストア(prefix-sum)
//   - 行メトリクス(uniform / auto-height)→ 展開行の帯(detailExtras)を疎に足した rowMetrics
//   - 縦ジオメトリ(uniform は算術窓出し + pixel scaling、metrics 駆動は prefix-sum 版)→ 描画窓の行 /
//     窓端 index / 物理ボディ高さ / 倍率 / overlay 基準オフセット、描画窓内の展開中マスター行(detailEntries)
//   メモ単位は旧 useMemo と同一です。autoHeightVersion は測定 flush(行高ストアの in-place prefix 更新)後に
//   メトリクスを作り直させる意図的なトリガー入力です。
import type { GridColumn, GridRowKey, RowModel } from '../model/gridTypes.unbound';
import {
  AUTO_HEIGHT_MAX_ROWS,
  MAX_BODY_PX,
  computeAutoHeightVerticalGeometry,
  computeVerticalGeometry,
  createDetailRowMetrics,
  createUniformRowMetrics,
  shouldUseAutoHeight,
  type DetailRowExtra,
  type RowMetrics,
  type VerticalGeometry,
  type VerticalRow,
} from '../logic/verticalGeometry';
import { buildRowHeightStore, createAutoHeightRowMetrics, type RowHeightStore } from '../logic/rowHeightStore';
import { resolveDetailRowExtras, type DetailIndexCache } from '../logic/detailRow';
import { createMemo } from './memo';

type ReadonlyRef<V> = { readonly current: V };

const EMPTY_DETAIL_EXTRAS: readonly DetailRowExtra[] = [];
const EMPTY_DETAIL_ENTRIES: readonly DetailLayerEntry[] = [];
// 旧 rowVirtualizer の overscan=20 を踏襲します。
const ROW_OVERSCAN = 20;

// 描画窓内の展開中マスター行(帯レイヤーの入力)。view/GridDetailLayer の GridDetailLayerEntry と同形です。
export type DetailLayerEntry = {
  rowKey: GridRowKey;
  virtualRow: VerticalRow;
};

type DetailIsExpandable<T> = Parameters<typeof resolveDetailRowExtras<T>>[0]['isExpandable'];

export type VerticalLayoutInputs<T> = {
  isServerSide: boolean;
  // props.autoHeight(有効化フラグ)。
  autoHeight: boolean;
  visibleColumns: GridColumn<T>[];
  viewRowCount: number;
  // 未測定行の推定高さ(props.estimateRowHeight ?? rowHeight)。
  estimateRowHeight: number;
  rowHeight: number;
  headerHeight: number;
  viewportHeight: number;
  scrollTop: number;
  rowModel: RowModel<T>;
  // 実測高さの永続キャッシュ(rowKey 単位。store を作り直しても引き継ぐ)。
  measuredHeights: Map<GridRowKey, number>;
  // 測定 flush で store の prefix が更新されたことを伝える version。
  autoHeightVersion: number;
  detailRowEnabled: boolean;
  expandedDetailRowKeys: ReadonlySet<GridRowKey>;
  detailHeight: number;
  detailIsExpandable: DetailIsExpandable<T>;
  // rowKey → view index のキャッシュ(SSRM の query 変化で差し替わるため ref で受け、計算時に読む。メモ依存には
  //   含めない = 旧 useMemo と同じ)。
  detailIndexCacheRef: ReadonlyRef<DetailIndexCache>;
};

export type VerticalLayoutResolution = {
  hasAutoHeightColumn: boolean;
  autoHeightActive: boolean;
  // autoHeight 無効時は null(uniform 経路)。
  rowHeightStore: RowHeightStore | null;
  baseRowMetrics: RowMetrics;
  detailExtras: readonly DetailRowExtra[];
  detailActive: boolean;
  rowMetrics: RowMetrics;
  verticalGeometry: VerticalGeometry;
  virtualRows: VerticalGeometry['rows'];
  virtualRowIndexes: VerticalGeometry['rowIndexSet'];
  detailEntries: readonly DetailLayerEntry[];
  // 描画窓の先頭 / 末尾行 index(空窓では末尾 < 先頭)。
  windowFirstRow: number;
  windowLastRow: number;
  physicalBodyHeight: number;
  // overlay+body wrapper の transform。scaleFactor=1 のとき undefined(= 従来と同一 DOM)。
  bodyLayerTransform: string | undefined;
  verticalScaleFactor: number;
  overlayBaseOffset: number;
};

export const createVerticalLayoutResolver = <T,>() => {
  const memoHasAutoHeightColumn = createMemo((visibleColumns: GridColumn<T>[]) =>
    visibleColumns.some((column) => column.autoHeight === true),
  );
  // 行高ストア。order(view 順)/ 行数 / estimate が変わったときだけ作り直します(rowModel は order 変化で
  //   identity が変わるため、これを依存に持てば reorder で再構築されます)。
  const memoRowHeightStore = createMemo(
    (
      autoHeightActive: boolean,
      viewRowCount: number,
      estimate: number,
      rowModel: RowModel<T>,
      measuredHeights: Map<GridRowKey, number>,
    ): RowHeightStore | null =>
      autoHeightActive ? buildRowHeightStore(viewRowCount, estimate, rowModel.getRowKey, measuredHeights) : null,
  );
  // 行メトリクス(スクロール非依存)。auto-height では prefix-sum 版、uniform では従来版。
  //   autoHeightVersion は測定 flush 後に作り直させるトリガー(本体では参照しない)。
  const memoBaseRowMetrics = createMemo(
    (
      autoHeightActive: boolean,
      rowHeightStore: RowHeightStore | null,
      _autoHeightVersion: number,
      viewRowCount: number,
      rowHeight: number,
    ): RowMetrics =>
      autoHeightActive && rowHeightStore
        ? createAutoHeightRowMetrics(rowHeightStore)
        : createUniformRowMetrics(viewRowCount, rowHeight),
  );
  // 展開中キー集合 → view index 昇順の帯リスト(表示行リストは不変)。走査は clientSide のみ。
  const memoDetailExtras = createMemo(
    (
      detailRowEnabled: boolean,
      expandedKeys: ReadonlySet<GridRowKey>,
      rowModel: RowModel<T>,
      height: number,
      isExpandable: DetailIsExpandable<T>,
      cacheRef: ReadonlyRef<DetailIndexCache>,
      isServerSide: boolean,
    ): readonly DetailRowExtra[] =>
      detailRowEnabled
        ? resolveDetailRowExtras({
            expandedKeys,
            rowModel,
            height,
            isExpandable,
            cache: cacheRef.current,
            allowScan: !isServerSide,
          })
        : EMPTY_DETAIL_EXTRAS,
  );
  // 展開行なしでは baseRowMetrics そのもの(参照同一)を使い、既存経路の再計算を誘発しません。
  const memoRowMetrics = createMemo(
    (detailActive: boolean, baseRowMetrics: RowMetrics, detailExtras: readonly DetailRowExtra[]): RowMetrics =>
      detailActive ? createDetailRowMetrics(baseRowMetrics, detailExtras) : baseRowMetrics,
  );
  // 縦ジオメトリ。metrics 駆動(auto-height または展開行あり)は prefix-sum 版、uniform は従来版
  //   (rowMetrics 非依存で従来と数値一致)。
  const memoGeometry = createMemo(
    (
      metricsGeometryActive: boolean,
      rowMetrics: RowMetrics,
      viewRowCount: number,
      rowHeight: number,
      headerHeight: number,
      viewportHeight: number,
      scrollTop: number,
    ): VerticalGeometry =>
      metricsGeometryActive
        ? computeAutoHeightVerticalGeometry({ headerHeight, viewportHeight, scrollTop, overscan: ROW_OVERSCAN }, rowMetrics)
        : computeVerticalGeometry({
            rowCount: viewRowCount,
            rowHeight,
            headerHeight,
            viewportHeight,
            scrollTop,
            overscan: ROW_OVERSCAN,
            maxBodyPx: MAX_BODY_PX,
          }),
  );
  const memoDetailEntries = createMemo(
    (detailActive: boolean, virtualRows: VerticalGeometry['rows'], rowModel: RowModel<T>): readonly DetailLayerEntry[] => {
      if (!detailActive) {
        return EMPTY_DETAIL_ENTRIES;
      }
      const entries: DetailLayerEntry[] = [];
      for (const virtualRow of virtualRows) {
        if (virtualRow.detailSize !== undefined && virtualRow.detailSize > 0) {
          entries.push({
            rowKey: rowModel.getRowKey(virtualRow.index) ?? virtualRow.index,
            virtualRow,
          });
        }
      }
      return entries;
    },
  );

  return (inputs: VerticalLayoutInputs<T>): VerticalLayoutResolution => {
    const {
      isServerSide,
      autoHeight,
      visibleColumns,
      viewRowCount,
      estimateRowHeight,
      rowHeight,
      headerHeight,
      viewportHeight,
      scrollTop,
      rowModel,
      measuredHeights,
      autoHeightVersion,
      detailRowEnabled,
      expandedDetailRowKeys,
      detailHeight,
      detailIsExpandable,
      detailIndexCacheRef,
    } = inputs;
    const hasAutoHeightColumn = memoHasAutoHeightColumn(visibleColumns);
    // gate: props 有効 + 駆動列あり + 行数が上限内。serverSide では未ロード行の高さが不明なため常に無効。
    const autoHeightActive =
      !isServerSide && shouldUseAutoHeight(autoHeight, hasAutoHeightColumn, viewRowCount, AUTO_HEIGHT_MAX_ROWS);
    const rowHeightStore = memoRowHeightStore(autoHeightActive, viewRowCount, estimateRowHeight, rowModel, measuredHeights);
    const baseRowMetrics = memoBaseRowMetrics(autoHeightActive, rowHeightStore, autoHeightVersion, viewRowCount, rowHeight);
    const detailExtras = memoDetailExtras(
      detailRowEnabled,
      expandedDetailRowKeys,
      rowModel,
      detailHeight,
      detailIsExpandable,
      detailIndexCacheRef,
      isServerSide,
    );
    // 展開行モードの gate: 帯が 1 つ以上あり、帯込みの論理全高が MAX_BODY_PX 以内(metrics 経路は sf=1 固定)。
    const detailActive =
      detailExtras.length > 0 &&
      baseRowMetrics.totalBodyHeight + detailExtras.reduce((sum, extra) => sum + extra.height, 0) <= MAX_BODY_PX;
    const rowMetrics = memoRowMetrics(detailActive, baseRowMetrics, detailExtras);
    const metricsGeometryActive = autoHeightActive || detailActive;
    const verticalGeometry = memoGeometry(
      metricsGeometryActive,
      rowMetrics,
      viewRowCount,
      rowHeight,
      headerHeight,
      viewportHeight,
      scrollTop,
    );
    const virtualRows = verticalGeometry.rows;
    const detailEntries = memoDetailEntries(detailActive, virtualRows, rowModel);
    return {
      hasAutoHeightColumn,
      autoHeightActive,
      rowHeightStore,
      baseRowMetrics,
      detailExtras,
      detailActive,
      rowMetrics,
      verticalGeometry,
      virtualRows,
      virtualRowIndexes: verticalGeometry.rowIndexSet,
      detailEntries,
      windowFirstRow: virtualRows.length > 0 ? virtualRows[0].index : 0,
      windowLastRow: virtualRows.length > 0 ? virtualRows[virtualRows.length - 1].index : -1,
      physicalBodyHeight: verticalGeometry.physicalBodyHeight,
      bodyLayerTransform:
        verticalGeometry.translateY !== 0 ? `translateY(${verticalGeometry.translateY}px)` : undefined,
      verticalScaleFactor: verticalGeometry.scaleFactor,
      overlayBaseOffset: verticalGeometry.windowBaseOffsetPx,
    };
  };
};