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
  CsvExportOptions,
  CsvExportScope,
  DetailRowOptions,
  GridColumn,
  GridExportData,
  GridExportOptions,
  GridRowKey,
  GridUiState,
  RowModel,
  RowSelectionState,
  ScrollAlign,
  SpreadsheetGridHandle,
  SpreadsheetGridProps,
} from '../model/gridTypes.unbound';
import { gridActions, type GridUiAction } from '../model/gridActions';
import { normalizeCellRange, normalizeColumnRange, normalizeRowRange } from '../model/gridSelectors';
import { computeSinglePaneColumnExtent, type GridPaneLayout } from '../logic/geometry';
import { logicalToPhysicalScrollTop, physicalToLogicalScrollTop, type RowMetrics } from '../logic/verticalGeometry';
import { findDetailRowIndex, isSyntheticColumnKey, type DetailIndexCache } from '../logic/detailRow';
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
import { collectAllGroupKeys, collectAllGroupRows, type GroupTree } from '../logic/grouping';
import { serializeRowsToCsv, type LabelExportLine } from '../logic/exportCsv';
import { buildGridExportData } from '../logic/exportData';
import { normalizeExportScope } from '../logic/exportScope';
import { scanInvalidCells } from '../logic/validation';
import type { ToolPanelTab } from '../controllers/toolPanelController';

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
  // scope='raw'(フィルター / ソート無視の全ソース行)の直接参照と、serverSide での 'raw' → 'view' フォールバック判定。
  rows: T[];
  isServerSide: boolean;
  // refreshServerSide() の委譲先(SSRM のソフトリフレッシュ)。
  serverSideRefresh: () => void;
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
  // 統合ツールパネル(openFilterManager / closeFilterManager の委譲先)。
  activeToolPanelTab: ToolPanelTab | null;
  openToolPanel: (tab: ToolPanelTab) => void;
  closeToolPanel: () => void;
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
  applyScroll: (logicalTop: number | null, left: number | null) => void;
  verticalTargetFor: (viewRowIndex: number, align: ScrollAlign) => number | null;
  horizontalTargetFor: (colIndex: number, align: ScrollAlign) => number | null;
  scrollToCellInternal: (viewRowIndex: number, colIndex: number, align: ScrollAlign) => void;
};

type ExportResolution<T> = {
  getRow: (index: number) => T;
  startRow: number;
  endRow: number;
  columns: GridColumn<T>[];
  // 出力対象行フィルタ(bound 済み述語)。getRow と同じ index 空間。
  isRowIncluded?: (row: T, rowIndex: number) => boolean;
  // 追加(label-row ④): ラベル行の出力行(includeLabelRows: true のときだけ定義)。getRow と同じ index 空間。
  getLabelLine?: (rowIndex: number) => LabelExportLine | undefined;
};

export const createGridApi = <T,>(): GridApi<T> => {
  let args: GridApiArgs<T> | null = null;

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

  const applyScroll: GridApi<T>['applyScroll'] = (logicalTop, left) => {
    const el = args?.scrollContainerRef.current ?? null;
    const s = args;
    if (!el || !s) {
      return;
    }
    applyApiScroll(el, {
      top: logicalTop === null ? el.scrollTop : logicalToPhysicalScrollTop(logicalTop, s.verticalScaleFactor),
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
      viewportHeight: el.clientHeight,
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
    applyScroll(verticalTargetFor(viewRowIndex, align), horizontalTargetFor(colIndex, align));
  };

  // scope('view' / 'raw' / 'rendered' / 'selection' + 後方互換 'all' / 'visible')から、出力対象の行アクセサ /
  //   行レンジ [startRow, endRow) / 列集合を解決します(exportCsv と getExportData で共有)。
  //   scope='selection' で選択が無いときは null。
  const resolveExportScope = (scope: CsvExportScope, includeLabelRows = false): ExportResolution<T> | null => {
    const s = args;
    if (!s) {
      return null;
    }
    const getViewRow = (index: number) => s.rowModel.getRow(index);
    // 追加(label-row ④): ラベル行の出力値(includeLabelRows 時)。文字列は先頭列へ、配列は列順にそのまま。
    const labelExport = s.labelRowExport;
    const toLabelLine = (row: T): LabelExportLine => {
      if (!labelExport) {
        return [];
      }
      const text = labelExport.exportText ? labelExport.exportText(row) : labelExport.getLabel(row);
      return typeof text === 'string' ? [text] : text;
    };
    const getViewLabelLine =
      includeLabelRows && labelExport && s.rowModel.getLabelRow
        ? (index: number): LabelExportLine | undefined => {
            const label = s.rowModel.getLabelRow?.(index);
            return label ? toLabelLine(label.row) : undefined;
          }
        : undefined;
    const isRowExportableProp = s.isRowExportable;
    const isRowIncludedView = isRowExportableProp
      ? (row: T, viewIndex: number) =>
          isRowExportableProp(row, {
            viewRowIndex: viewIndex,
            rowKey: s.rowModel.getRowKey(viewIndex) ?? viewIndex,
          })
      : undefined;
    const isRowIncludedRaw = isRowExportableProp
      ? (row: T, sourceIndex: number) =>
          isRowExportableProp(row, {
            viewRowIndex: sourceIndex,
            rowKey: s.resolvedRowKeyGetter(row, sourceIndex),
          })
      : undefined;
    const normalized = normalizeExportScope(scope);
    if (normalized === 'raw') {
      // serverSide はソース行配列を持たない(未ロード行が存在する)ため 'view' 相当へフォールバックし警告。
      if (s.isServerSide) {
        console.warn(
          "SpreadsheetGrid: scope 'raw' は serverSide では未ロード行を取得できないため、'view'(ロード済みビュー行)として扱います。全件エクスポートはサーバ側での実施を推奨します。",
        );
        return {
          getRow: getViewRow,
          startRow: 0,
          endRow: s.viewRowCount,
          columns: s.orderedColumns,
          isRowIncluded: isRowIncludedView,
        };
      }
      // 追加(label-row ④): rows 配列にはラベル行が混在するため、データ行としては出さず(undefined)、
      //   includeLabelRows 時だけ getLabelLine で 1 行として出します。
      const isRawLabel = (index: number): boolean =>
        labelExport !== undefined && s.rows[index] !== undefined && labelExport.isLabelRow(s.rows[index], index);
      return {
        getRow: (index: number) => (isRawLabel(index) ? (undefined as unknown as T) : s.rows[index]),
        startRow: 0,
        endRow: s.rows.length,
        columns: s.orderedColumns,
        isRowIncluded: isRowIncludedRaw,
        getLabelLine:
          includeLabelRows && labelExport
            ? (index: number) => (isRawLabel(index) ? toLabelLine(s.rows[index]) : undefined)
            : undefined,
      };
    }
    if (normalized === 'rendered') {
      return {
        getRow: getViewRow,
        startRow: s.windowFirstRow,
        endRow: s.windowLastRow >= s.windowFirstRow ? s.windowLastRow + 1 : s.windowFirstRow,
        columns: s.orderedColumns,
        isRowIncluded: isRowIncludedView,
        getLabelLine: getViewLabelLine,
      };
    }
    if (normalized === 'selection') {
      const sel = s.uiState.selection;
      if (!sel) {
        return null;
      }
      if (sel.type === 'cell') {
        const r = normalizeCellRange(sel.range);
        return {
          getRow: getViewRow,
          startRow: r.start.row,
          endRow: r.end.row + 1,
          columns: s.orderedColumns.slice(r.start.col, r.end.col + 1),
          isRowIncluded: isRowIncludedView,
          getLabelLine: getViewLabelLine,
        };
      }
      if (sel.type === 'row') {
        const r = normalizeRowRange(sel.startRow, sel.endRow);
        return {
          getRow: getViewRow,
          startRow: r.startRow,
          endRow: r.endRow + 1,
          columns: s.orderedColumns,
          isRowIncluded: isRowIncludedView,
          getLabelLine: getViewLabelLine,
        };
      }
      const r = normalizeColumnRange(sel.startCol, sel.endCol);
      return {
        getRow: getViewRow,
        startRow: 0,
        endRow: s.viewRowCount,
        columns: s.orderedColumns.slice(r.startCol, r.endCol + 1),
        isRowIncluded: isRowIncludedView,
        getLabelLine: getViewLabelLine,
      };
    }
    return {
      getRow: getViewRow,
      startRow: 0,
      endRow: s.viewRowCount,
      columns: s.orderedColumns,
      isRowIncluded: isRowIncludedView,
      getLabelLine: getViewLabelLine,
    };
  };

  // 自動グループ列 / 展開行トグル列(合成列)はエクスポート列から除外します。
  const stripSyntheticColumns = (exportColumns: GridColumn<T>[]): GridColumn<T>[] =>
    exportColumns.filter((column) => !isSyntheticColumnKey(column.key));

  const buildCsv = (options?: CsvExportOptions): string => {
    const resolved = resolveExportScope(options?.scope ?? 'view', options?.includeLabelRows === true);
    if (!resolved) {
      return options?.bom ? '\uFEFF' : '';
    }
    return serializeRowsToCsv({
      getRow: resolved.getRow,
      startRow: resolved.startRow,
      endRow: resolved.endRow,
      columns: stripSyntheticColumns(resolved.columns),
      delimiter: options?.delimiter,
      includeHeaders: options?.includeHeaders,
      bom: options?.bom,
      isRowIncluded: resolved.isRowIncluded,
      getLabelLine: resolved.getLabelLine,
    });
  };

  const buildExportData = (options?: GridExportOptions): GridExportData => {
    const resolved = resolveExportScope(options?.scope ?? 'view', options?.includeLabelRows === true);
    if (!resolved) {
      return { columns: [], rows: [] };
    }
    return buildGridExportData({
      getRow: resolved.getRow,
      startRow: resolved.startRow,
      endRow: resolved.endRow,
      columns: stripSyntheticColumns(resolved.columns),
      isRowIncluded: resolved.isRowIncluded,
      getLabelLine: resolved.getLabelLine,
    });
  };

  const handle: SpreadsheetGridHandle<T> = {
    scrollToRow: (viewRowIndex, scrollOptions) =>
      applyScroll(verticalTargetFor(viewRowIndex, scrollOptions?.align ?? 'auto'), null),

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
        top: Math.max(s.headerHeight + s.physicalBodyHeight - el.clientHeight, 0),
        left: el.scrollLeft,
      });
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
      s.dispatch(gridActions.activateCell(cell));
      if (cell && cellOptions?.scrollIntoView) {
        scrollToCellInternal(cell.row, cell.col, 'auto');
      }
    },

    getSelection: () => args?.uiState.selection ?? null,

    selectCell: (viewRowIndex, colIndex, cellOptions) => {
      const s = args;
      if (!s) {
        return;
      }
      const cell = { row: viewRowIndex, col: colIndex };
      // クリック相当: pointerdown(start)→ pointerup(end)。activeCell=cell / 単一セル選択 / dragState クリア。
      s.dispatch(gridActions.startSelection(cell));
      s.dispatch(gridActions.endSelection());
      if (cellOptions?.scrollIntoView) {
        scrollToCellInternal(viewRowIndex, colIndex, 'auto');
      }
    },

    selectRange: (range, rangeOptions) => {
      const s = args;
      if (!s) {
        return;
      }
      // ドラッグ選択相当: start(anchor)→ update(focus)→ end。
      s.dispatch(gridActions.startSelection(range.start));
      s.dispatch(gridActions.updateSelection(range.end));
      s.dispatch(gridActions.endSelection());
      if (rangeOptions?.scrollIntoView) {
        scrollToCellInternal(range.end.row, range.end.col, 'auto');
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

    exportCsv: (options) => buildCsv(options),

    downloadCsv: (filename, options) => {
      if (typeof document === 'undefined') {
        return;
      }
      // ファイル化では Excel 互換のため bom 既定を true にします(明示指定があればそれを尊重)。
      const csv = buildCsv({ ...options, bom: options?.bom ?? true });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename ?? 'export.csv';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    },

    getExportData: (options) => buildExportData(options),

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
  };

  return {
    update: (next) => {
      args = next;
    },
    handle,
    applyScroll,
    verticalTargetFor,
    horizontalTargetFor,
    scrollToCellInternal,
  };
};