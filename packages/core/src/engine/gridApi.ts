// 追加(本体分解 E-5): 命令的 API(ref ハンドル)の実体です(React 非依存。旧 SpreadsheetGrid.tsx の
//   「imperative API(ref ハンドル)」セクション = apiStateRef(30 フィールドの latest-ref)+ スクロール計算群 +
//   useImperativeHandle の 45 メソッドを移設)。
//   - update(args) で最新の状態 / 派生値 / 連携先を受け取り、handle の各メソッドは呼び出し時点の args を読みます
//     (旧 apiStateRef と同じ鮮度。update はレイアウト effect で毎レンダー呼ばれる)。handle は 1 回だけ生成され
//     参照安定です(useImperativeHandle は handle をそのまま返す)。
//   - スクロール計算(applyScroll / verticalTargetFor / horizontalTargetFor / scrollToCellInternal)も公開し、
//     undo/redo の復元先セル可視化(history controller)が使います。
//   - 命令的 API 由来のスクロールは、クランプ後の位置が実際に変わるときだけ markApiScroll を呼びます
//     (scroll イベントの source:'api' 判定用。位置不変の scrollTo は scroll イベントを発火しないため)。
//   - update 前(マウント前)にメソッドが呼ばれた場合は、旧 apiStateRef=null と同じく安全な既定値を返します。
import type {
  CellCoord,
  DetailRowOptions,
  GridColumn,
  GridRowKey,
  GridUiState,
  RowModel,
  RowSelectionState,
  ScrollAlign,
  SpreadsheetGridHandle,
  SpreadsheetGridProps,
} from '../model/gridTypes.unbound';
import { gridActions, type GridUiAction } from '../model/gridActions';
import { normalizeCellRange, normalizeRowRange } from '../model/gridSelectors';
import { computeSinglePaneColumnExtent, type GridPaneLayout } from '../logic/geometry';
import { logicalToPhysicalScrollTop, physicalToLogicalScrollTop, type RowMetrics } from '../logic/verticalGeometry';
import { findDetailRowIndex, type DetailIndexCache } from '../logic/detailRow';
import {
  clearRowSelection,
  countSelectedRows,
  resolveIsRowSelected,
  rowSelectionFromModel,
  rowSelectionToModel,
  selectAllRows,
} from '../logic/rowSelection';
import { applyColumnState, buildGridState, extractColumnState, migrateGridState } from '../logic/gridState';
import { computeHorizontalScrollTarget, computeVerticalScrollTarget } from '../logic/scrollTargets';
import {
  collectAllGroupKeys,
  collectAllGroupRows,
  type GroupTree,
} from '../logic/grouping';
import type { LabelExportLine } from '../logic/exportCsv';
import type { TotalRowCells } from '../logic/totalRow';
import { scanInvalidCells } from '../logic/validation';
import type { ToolPanelTab } from '../controllers/toolPanelController';
import { createInertExportCommands, type GridCoreFeatures } from './features';

type ReadonlyRef<V> = { readonly current: V };

export type GridApiArgs<T> = {
  scrollContainerRef: ReadonlyRef<HTMLElement | null>;
  dispatch: (action: GridUiAction) => void;
  rowModel: RowModel<T>;
  viewRowCount: number;
  // グループ行を除くデータ行数(行選択件数用)と、グループツリー(一括開閉 / getGroupRows 用。無効時 null)。
  leafRowCount: number;
  groupTree: GroupTree<T> | null;
  rowMetrics: RowMetrics;
  paneLayout: GridPaneLayout<T>;
  orderedColumns: GridColumn<T>[];
  // getState の列メタ抽出 / applyState の列メタ適用に使う生 columns(consumer 宣言順)と onColumnsChange。
  columns: GridColumn<T>[];
  onColumnsChange: ((nextColumns: GridColumn<T>[]) => void) | undefined;
  uiState: GridUiState;
  headerHeight: number;
  verticalScaleFactor: number;
  leftPaneTotalWidth: number;
  rightPaneTotalWidth: number;
  centerLeadingWidth: number;
  windowFirstRow: number;
  windowLastRow: number;
  physicalBodyHeight: number;
  // 追加(合計行 3A): 下端に固定する行(合計行)の高さ。末尾へのスクロール / 行を見せる位置に効きます。既定 0。
  footerHeight?: number;
  // 追加(監査 M-05): 行高を実測するモード(auto-height 列 / 展開行)か。scrollToBottom() 直後の計測で総高が
  //   伸びたとき、末尾へ再補正するかの判定に使います(固定行高では総高が計測で変わらないため補正しない)。
  measuredRowHeights?: boolean;
  // scope='raw'(フィルター / ソート無視の全ソース行)の直接参照と、serverSide での 'raw' → 'view' フォールバック判定。
  rows: T[];
  isServerSide: boolean;
  // refreshServerSide() の委譲先(SSRM のソフトリフレッシュ)。
  serverSideRefresh: () => void;
  // 追加(監査 C-7): retryServerSideLoads() の委譲先(失敗ブロックだけの再取得)。
  serverSideRetryFailed: () => void;
  // getInvalidCells / エクスポートの rowKey 解決(source index 基準)。
  resolvedRowKeyGetter: (row: T, sourceRowIndex: number) => GridRowKey;
  // exportCsv / getExportData の対象行フィルタ。
  isRowExportable: SpreadsheetGridProps<T>['isRowExportable'];
  // 追加(label-row ④): ラベル行のエクスポート設定(labelRow prop 由来。未指定 = ラベル行なし)。
  //   scope 'raw' でラベル行をデータ行として出さないための述語と、includeLabelRows 時の出力値。
  labelRowExport?:
    | {
        isLabelRow: (row: T, sourceIndex: number) => boolean;
        getLabel: (row: T) => string;
        exportText: ((row: T) => string | LabelExportLine) | undefined;
      }
    | undefined;
  // 追加(合計行 3A): 合計行のエクスポート(includeTotalRow)の値と見出し(totalRow 無効時は undefined)。
  totalRowExport?: { cells: TotalRowCells; label: string } | undefined;
  // 統合ツールパネル(openFilterManager / closeFilterManager の委譲先)。
  activeToolPanelTab: ToolPanelTab | null;
  openToolPanel: (tab: ToolPanelTab) => void;
  closeToolPanel: () => void;
  // 追加(F-2): セル内検索(openFind / closeFind / findNext / findPrev の委譲先)。
  find: { open: (query?: string) => void; close: () => void; next: () => void; prev: () => void };
  // undo / redo(history controller)。
  undoRows: () => void;
  redoRows: () => void;
  canUndoRows: () => boolean;
  canRedoRows: () => boolean;
  clearUndoHistory: () => void;
  // 展開行 API の有効判定 / 展開可否ガード / rowKey → view index のキャッシュ(SSRM の query 変化で差し替わる)。
  detailRowEnabled: boolean;
  detailIsExpandable: DetailRowOptions<T>['isExpandable'];
  detailIndexCacheRef: ReadonlyRef<DetailIndexCache>;
  // moveRow の委譲先。
  moveRowByKey: (rowKey: GridRowKey, toIndex: number) => void;
  // 行選択のコミット(rowSelectionCommands。controlled では onChange のみ)。
  commitRowSelection: (next: RowSelectionState) => void;
  // 命令的 API 由来のスクロール(位置が実際に変わるもの)を通知します(scroll イベントの source 判定用)。
  markApiScroll: () => void;
};

export type GridApi<T> = {
  update: (args: GridApiArgs<T>) => void;
  // 公開ハンドル(参照安定)。
  handle: SpreadsheetGridHandle<T>;
  // 論理 scrollTop を物理へ戻してスクロールコンテナへ適用(横は圧縮対象外で物理 = 論理)。null は現状維持。
  //   align は行を合わせた位置(下端に合わせたときは物理位置を切り上げる。BR-5)。
  applyScroll: (logicalTop: number | null, left: number | null, align?: ScrollAlign) => void;
  verticalTargetFor: (viewRowIndex: number, align: ScrollAlign) => number | null;
  horizontalTargetFor: (colIndex: number, align: ScrollAlign) => number | null;
  scrollToCellInternal: (viewRowIndex: number, colIndex: number, align: ScrollAlign) => void;
};


// 追加(監査 M-05): scrollToBottom() 後に末尾へ再補正し続ける最大時間(ms)。
const BOTTOM_PIN_MS = 1000;

// 変更(差し込み式 段階 2): エクスポート(exportCsv / downloadCsv / getExportData)は機能セットの export から
//   (engine/exportCommands)。無ければ代役(空を返す)。
export const createGridApi = <T,>(features: Pick<GridCoreFeatures, 'export'> = {}): GridApi<T> => {
  let args: GridApiArgs<T> | null = null;
  const exportCommands = (features.export?.createExportCommands ?? createInertExportCommands)<T>(() => args);
  // 追加(監査 M-05): 行高を実測するモードでは、scrollToBottom() で末尾へ飛んだ直後に新しく描画された行が
  //   計測されて総高が伸び、1 回では末尾に届きませんでした。呼び出し直後の BOTTOM_PIN_MS の間だけ「末尾固定」を
  //   覚えておき、update で総高が変わったら末尾へ合わせ直します。ユーザーが上へスクロールしたら(scrollTop が
  //   固定時より小さくなったら)即座にやめます。
  let bottomPin: { pinnedTop: number; until: number } | null = null;

  // 命令的 API 由来のスクロール適用。スクロール可能範囲へクランプし、クランプ後の位置が現在と実際に変わるときだけ
  //   markApiScroll を呼びます。
  const applyApiScroll = (
    el: HTMLElement,
    target: { top: number; left: number },
    behavior: 'auto' | 'smooth' = 'auto',
  ) => {
    const maxTop = Math.max(el.scrollHeight - el.clientHeight, 0);
    const maxLeft = Math.max(el.scrollWidth - el.clientWidth, 0);
    const top = Math.min(Math.max(target.top, 0), maxTop);
    const left = Math.min(Math.max(target.left, 0), maxLeft);
    if (Math.round(top) !== Math.round(el.scrollTop) || Math.round(left) !== Math.round(el.scrollLeft)) {
      args?.markApiScroll();
    }
    el.scrollTo({ top, left, behavior });
  };

  const applyScroll: GridApi<T>['applyScroll'] = (logicalTop, left, align) => {
    const el = args?.scrollContainerRef.current ?? null;
    const s = args;
    if (!el || !s) {
      return;
    }
    let top = logicalTop === null ? el.scrollTop : logicalToPhysicalScrollTop(logicalTop, s.verticalScaleFactor);
    // 変更(BR-5 2026-10-28): 行を下端に合わせるとき('end'、または 'auto' で下へ動かすとき)は物理位置を切り上げます。
    //   行の位置を縮めて持つモードでは物理位置が小数になり、WebKit はスクロール位置の小数を切り捨てるため、最後の行が
    //   合計行の下に 2px 隠れていました。
    if (align === 'end' || (align === 'auto' && top > el.scrollTop)) {
      top = Math.ceil(top);
    }
    applyApiScroll(el, {
      top,
      left: left === null ? el.scrollLeft : left,
    });
  };

  // 縦の scroll target(論理)。範囲外 index はクランプ。
  const verticalTargetFor: GridApi<T>['verticalTargetFor'] = (viewRowIndex, align) => {
    const el = args?.scrollContainerRef.current ?? null;
    const s = args;
    if (!el || !s || s.viewRowCount === 0) {
      return null;
    }
    const clamped = Math.min(Math.max(viewRowIndex, 0), s.viewRowCount - 1);
    return computeVerticalScrollTarget({
      rowTop: s.rowMetrics.rowTop(clamped),
      // 帯を含まないセル行の高さ(展開行なしでは rowsHeight と一致)。
      rowHeight: s.rowMetrics.cellHeight(clamped),
      headerHeight: s.headerHeight,
      // 変更(合計行 3A): 下端の合計行に隠れる分を除いた高さ。
      viewportHeight: el.clientHeight - (s.footerHeight ?? 0),
      currentScrollTop: physicalToLogicalScrollTop(el.scrollTop, s.verticalScaleFactor),
      align,
    });
  };

  // 横の scroll target(物理 = 論理)。中央ペインの列のみ対象(固定列は常に可視)。
  const horizontalTargetFor: GridApi<T>['horizontalTargetFor'] = (colIndex, align) => {
    const el = args?.scrollContainerRef.current ?? null;
    const s = args;
    if (!el || !s) {
      return null;
    }
    const single = computeSinglePaneColumnExtent(s.paneLayout, colIndex);
    if (!single || single.pane !== 'center') {
      return null;
    }
    return computeHorizontalScrollTarget({
      cellLeft: s.leftPaneTotalWidth + s.centerLeadingWidth + single.extent.start,
      cellWidth: single.extent.width,
      leftPaneWidth: s.leftPaneTotalWidth,
      rightPaneWidth: s.rightPaneTotalWidth,
      viewportWidth: el.clientWidth,
      currentScrollLeft: el.scrollLeft,
      align,
    });
  };

  const scrollToCellInternal: GridApi<T>['scrollToCellInternal'] = (viewRowIndex, colIndex, align) => {
    applyScroll(verticalTargetFor(viewRowIndex, align), horizontalTargetFor(colIndex, align), align);
  };

  // 追加(audit B-05): 選択 / アクティブセル API の入力をビュー座標内へクランプします(行は viewRowCount、
  //   列は orderedColumns.length 基準。0 行 / 0 列なら 0)。
  const clampCellCoord = (cell: CellCoord): CellCoord => {
    const s = args;
    if (!s) {
      return cell;
    }
    return {
      row: Math.min(Math.max(cell.row, 0), Math.max(s.viewRowCount - 1, 0)),
      col: Math.min(Math.max(cell.col, 0), Math.max(s.orderedColumns.length - 1, 0)),
    };
  };

  const handle: SpreadsheetGridHandle<T> = {
    scrollToRow: (viewRowIndex, scrollOptions) => {
      const align = scrollOptions?.align ?? 'auto';
      applyScroll(verticalTargetFor(viewRowIndex, align), null, align);
    },

    scrollToCell: (viewRowIndex, colIndex, scrollOptions) =>
      scrollToCellInternal(viewRowIndex, colIndex, scrollOptions?.align ?? 'auto'),

    scrollToTop: () => {
      const el = args?.scrollContainerRef.current ?? null;
      if (el) {
        applyApiScroll(el, { top: 0, left: el.scrollLeft });
      }
    },

    scrollToBottom: () => {
      const el = args?.scrollContainerRef.current ?? null;
      const s = args;
      if (!el || !s) {
        return;
      }
      applyApiScroll(el, {
        top: Math.max(s.headerHeight + s.physicalBodyHeight + (s.footerHeight ?? 0) - el.clientHeight, 0),
        left: el.scrollLeft,
      });
      bottomPin = s.measuredRowHeights ? { pinnedTop: el.scrollTop, until: Date.now() + BOTTOM_PIN_MS } : null;
    },

    // スクロール位置(px)の取得 / 設定。値は生の scrollTop / scrollLeft(onScroll と同一基準)。
    getScrollPosition: () => {
      const el = args?.scrollContainerRef.current ?? null;
      return el ? { top: el.scrollTop, left: el.scrollLeft } : null;
    },

    setScrollPosition: (position, scrollOptions) => {
      const el = args?.scrollContainerRef.current ?? null;
      if (!el) {
        return;
      }
      applyApiScroll(
        el,
        { top: position.top ?? el.scrollTop, left: position.left ?? el.scrollLeft },
        scrollOptions?.behavior ?? 'auto',
      );
    },

    getVisibleRowRange: () => {
      const s = args;
      if (!s || s.windowLastRow < s.windowFirstRow) {
        return null;
      }
      return { startIndex: s.windowFirstRow, endIndex: s.windowLastRow + 1 };
    },

    getActiveCell: () => {
      const cell = args?.uiState.activeCell;
      return cell ? { row: cell.row, col: cell.col } : null;
    },

    setActiveCell: (cell, cellOptions) => {
      const s = args;
      if (!s) {
        return;
      }
      // 変更(audit B-05): 範囲外 index はビュー座標内へクランプする(API_REFERENCE「範囲外 index は内部で
      //   クランプ / 無視する」との整合。旧実装は reducer へそのまま入り getActiveCell が範囲外を返していた)。
      const clamped = cell ? clampCellCoord(cell) : null;
      s.dispatch(gridActions.activateCell(clamped));
      if (clamped && cellOptions?.scrollIntoView) {
        scrollToCellInternal(clamped.row, clamped.col, 'auto');
      }
    },

    getSelection: () => args?.uiState.selection ?? null,

    selectCell: (viewRowIndex, colIndex, cellOptions) => {
      const s = args;
      if (!s) {
        return;
      }
      const cell = clampCellCoord({ row: viewRowIndex, col: colIndex });
      // クリック相当: pointerdown(start)→ pointerup(end)。activeCell=cell / 単一セル選択 / dragState クリア。
      s.dispatch(gridActions.startSelection(cell));
      s.dispatch(gridActions.endSelection());
      if (cellOptions?.scrollIntoView) {
        scrollToCellInternal(cell.row, cell.col, 'auto');
      }
    },

    selectRange: (range, rangeOptions) => {
      const s = args;
      if (!s) {
        return;
      }
      const start = clampCellCoord(range.start);
      const end = clampCellCoord(range.end);
      // ドラッグ選択相当: start(anchor)→ update(focus)→ end。
      s.dispatch(gridActions.startSelection(start));
      s.dispatch(gridActions.updateSelection(end));
      s.dispatch(gridActions.endSelection());
      if (rangeOptions?.scrollIntoView) {
        scrollToCellInternal(end.row, end.col, 'auto');
      }
    },

    clearSelection: () => {
      args?.dispatch(gridActions.clearSelection());
    },

    getSelectedRows: () => {
      const s = args;
      if (!s) {
        return [];
      }
      const sel = s.uiState.selection;
      if (!sel) {
        return [];
      }
      const result: T[] = [];
      const pushRow = (index: number) => {
        const row = s.rowModel.getRow(index);
        // SSRM 未ロード行(undefined)はスキップ。
        if (row) {
          result.push(row);
        }
      };
      if (sel.type === 'cell') {
        const r = normalizeCellRange(sel.range);
        for (let i = r.start.row; i <= r.end.row; i += 1) {
          pushRow(i);
        }
      } else if (sel.type === 'row') {
        const r = normalizeRowRange(sel.startRow, sel.endRow);
        for (let i = r.startRow; i <= r.endRow; i += 1) {
          pushRow(i);
        }
      } else {
        // 列選択は全ビュー行が対象(コピーと同義)。
        for (let i = 0; i < s.viewRowCount; i += 1) {
          pushRow(i);
        }
      }
      return result;
    },

    exportCsv: (options) => exportCommands.exportCsv(options),

    downloadCsv: (filename, options) => exportCommands.downloadCsv(filename, options),

    getExportData: (options) => exportCommands.getExportData(options),

    // ── 状態の保存 / 復元 ──
    getState: () => {
      const s = args;
      if (!s) {
        // 未確定時(通常起こりません)は現行スキーマの空状態(列メタは空配列)。
        return buildGridState({}, { globalText: '', columnFilters: {} }, [], []);
      }
      // 永続スライス(手動リサイズ幅 / フィルター / ソート)+ 列メタ(可視 / 順序 / ピン)を純粋にスナップショット。
      return buildGridState(s.uiState.columnWidths, s.uiState.filters, s.uiState.sort, extractColumnState(s.columns));
    },

    applyState: (state) => {
      const s = args;
      if (!s) {
        return;
      }
      // 外部入力(deserialize 結果)を現行スキーマへ防御的に正規化してから反映します。
      const normalized = migrateGridState(state);
      // 列メタ(v2): onColumnsChange があり、かつ正規化後に columns があるときだけ反映(手動リサイズ幅の
      //   column.width 焼き込み込み)。
      if (s.onColumnsChange && normalized.columns) {
        s.onColumnsChange(applyColumnState(s.columns, normalized.columns, normalized.columnWidths));
      }
      // 幅 reset / フィルター一括 / ソート set の 3 dispatch(同一イベント内で自動バッチ)。
      s.dispatch(gridActions.resetColumnWidths(normalized.columnWidths));
      s.dispatch(gridActions.setAllFilters(normalized.filters));
      s.dispatch(gridActions.setSort(normalized.sort));
    },

    // ── 行選択(チェックボックス選択)──
    getRowSelection: () => {
      const s = args;
      return s ? rowSelectionToModel(s.uiState.rowSelection) : { type: 'include', rowKeys: [] };
    },
    setRowSelection: (model) => {
      args?.commitRowSelection(rowSelectionFromModel(model));
    },
    getSelectedRowKeys: () => {
      const s = args;
      if (!s) {
        return [];
      }
      const sel = s.uiState.rowSelection;
      // include はキーをそのまま返します(exclude のみ全行を走査)。
      if (sel.mode === 'include') {
        return Array.from(sel.keys);
      }
      const keys: GridRowKey[] = [];
      const count = s.rowModel.getRowCount();
      for (let i = 0; i < count; i += 1) {
        const row = s.rowModel.getRow(i);
        if (!row) {
          continue;
        }
        const key = s.rowModel.getRowKey(i) ?? i;
        if (!sel.keys.has(key)) {
          keys.push(key);
        }
      }
      return keys;
    },
    getSelectedRowData: () => {
      const s = args;
      if (!s) {
        return [];
      }
      const sel = s.uiState.rowSelection;
      const result: T[] = [];
      const count = s.rowModel.getRowCount();
      for (let i = 0; i < count; i += 1) {
        const row = s.rowModel.getRow(i);
        if (!row) {
          continue;
        }
        const key = s.rowModel.getRowKey(i) ?? i;
        if (resolveIsRowSelected(sel, key)) {
          result.push(row);
        }
      }
      return result;
    },
    getSelectedRowCount: () => {
      const s = args;
      return s ? countSelectedRows(s.uiState.rowSelection, s.leafRowCount) : 0;
    },
    isRowSelected: (rowKey) => {
      const s = args;
      return s ? resolveIsRowSelected(s.uiState.rowSelection, rowKey) : false;
    },
    selectAllRows: () => {
      args?.commitRowSelection(selectAllRows());
    },
    clearRowSelection: () => {
      args?.commitRowSelection(clearRowSelection());
    },

    // ── undo / redo(編集履歴)──
    undo: () => {
      args?.undoRows();
    },
    redo: () => {
      args?.redoRows();
    },
    canUndo: () => args?.canUndoRows() ?? false,
    canRedo: () => args?.canRedoRows() ?? false,
    clearUndoHistory: () => {
      args?.clearUndoHistory();
    },

    // ── 行グルーピング ──
    setGroupCollapsed: (groupKey, collapsed) => {
      args?.dispatch(gridActions.setGroupCollapsed(groupKey, collapsed));
    },
    expandAllGroups: () => {
      args?.dispatch(gridActions.setCollapsedGroupKeys(new Set()));
    },
    collapseAllGroups: () => {
      const s = args;
      if (!s || !s.groupTree) {
        return;
      }
      s.dispatch(gridActions.setCollapsedGroupKeys(new Set(collectAllGroupKeys(s.groupTree))));
    },
    getGroupRows: () => {
      const s = args;
      return s?.groupTree ? collectAllGroupRows(s.groupTree) : [];
    },

    // ── 展開行(detail)──
    //   展開時は行を引いて isExpandable を確認し、false なら no-op。行が引けないとき(serverSide の未ロード行 /
    //   フィルター除外中)はキーだけ保持し、描画側(resolveDetailRowExtras)が可否を判定します。
    setDetailRowExpanded: (rowKey, expanded) => {
      const s = args;
      if (!s || !s.detailRowEnabled) {
        return;
      }
      if (expanded && s.detailIsExpandable) {
        const index = findDetailRowIndex(s.rowModel, rowKey, s.detailIndexCacheRef.current, !s.isServerSide);
        if (index >= 0) {
          const row = s.rowModel.getRow(index);
          if (
            row != null &&
            !s.detailIsExpandable(row, { rowKey, sourceRowIndex: s.rowModel.getSourceIndex(index) })
          ) {
            return;
          }
        }
      }
      s.dispatch(gridActions.setDetailRowExpanded(rowKey, expanded));
    },
    getExpandedDetailRowKeys: () => {
      const s = args;
      return s && s.detailRowEnabled ? Array.from(s.uiState.expandedDetailRowKeys) : [];
    },
    collapseAllDetailRows: () => {
      const s = args;
      if (!s || !s.detailRowEnabled) {
        return;
      }
      s.dispatch(gridActions.setExpandedDetailRowKeys(new Set()));
    },

    // ── 行ドラッグ並び替え ──
    moveRow: (rowKey, toIndex) => {
      args?.moveRowByKey(rowKey, toIndex);
    },

    // ── バリデーション(clientSide 専用)──
    getInvalidCells: () => {
      const s = args;
      if (!s) {
        return [];
      }
      if (s.isServerSide) {
        console.warn('[SpreadsheetGrid] getInvalidCells は serverSide モードでは利用できません(空配列を返します)。');
        return [];
      }
      return scanInvalidCells(s.rows, s.columns, s.resolvedRowKeyGetter);
    },

    // ── serverSide(SSRM)──
    refreshServerSide: () => {
      const s = args;
      if (!s) {
        return;
      }
      if (!s.isServerSide) {
        console.warn(
          '[SpreadsheetGrid] refreshServerSide は clientSide(rows)モードでは何もしません(dataSource 指定時のみ有効です)。',
        );
        return;
      }
      s.serverSideRefresh();
    },
    retryServerSideLoads: () => {
      const s = args;
      if (!s) {
        return;
      }
      if (!s.isServerSide) {
        console.warn(
          '[SpreadsheetGrid] retryServerSideLoads は clientSide(rows)モードでは何もしません(dataSource 指定時のみ有効です)。',
        );
        return;
      }
      s.serverSideRetryFailed();
    },

    // ── UI パネル ──
    //   openFilterManager / closeFilterManager は統合ツールパネルのフィルタータブへ委譲。close は「フィルタータブ表示中」
    //   のときだけ閉じます(別タブ表示中の統合パネルを巻き込まない)。
    openFilterManager: () => {
      args?.openToolPanel('filter');
    },
    closeFilterManager: () => {
      const s = args;
      if (s && s.activeToolPanelTab === 'filter') {
        s.closeToolPanel();
      }
    },

    // ── 追加(F-2): セル内検索 ──
    openFind: (query) => {
      args?.find.open(query);
    },
    closeFind: () => {
      args?.find.close();
    },
    findNext: () => {
      args?.find.next();
    },
    findPrev: () => {
      args?.find.prev();
    },
  };

  return {
    update: (next) => {
      const previousHeight = args?.physicalBodyHeight;
      args = next;
      // 追加(監査 M-05): 末尾固定中に総高が変わったら末尾へ合わせ直します。
      if (bottomPin === null || previousHeight === next.physicalBodyHeight) {
        return;
      }
      const el = next.scrollContainerRef.current;
      if (!el || !next.measuredRowHeights || Date.now() > bottomPin.until || el.scrollTop < bottomPin.pinnedTop - 1) {
        bottomPin = null;
        return;
      }
      applyApiScroll(el, {
        top: Math.max(next.headerHeight + next.physicalBodyHeight + (next.footerHeight ?? 0) - el.clientHeight, 0),
        left: el.scrollLeft,
      });
      bottomPin = { ...bottomPin, pinnedTop: el.scrollTop };
    },
    handle,
    applyScroll,
    verticalTargetFor,
    horizontalTargetFor,
    scrollToCellInternal,
  };
};