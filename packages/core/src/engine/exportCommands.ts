// 追加(差し込み式 段階 2): 命令的 API のエクスポート(exportCsv / downloadCsv / getExportData)の実体です(React 非依存)。
//   gridApi.ts の中にあった scope の解決 / 合成列の除外 / 合計行の出力行 / CSV・整形済みデータの組み立て / ファイル化を
//   そのまま移したもので、gridApi は機能セット(GridCoreFeatures.export)からこの生成関数を受け取ります。機能セットに
//   無い構成では代役(空を返す)が受けます。呼び出し時点の最新の状態は getArgs で読みます(gridApi の update と同じ鮮度)。
import type {
  CsvExportOptions,
  CsvExportScope,
  GridColumn,
  GridExportData,
  GridExportOptions,
  SpreadsheetGridHandle,
} from '../model/gridTypes.unbound';
import { normalizeCellRange, normalizeColumnRange, normalizeRowRange } from '../model/gridSelectors';
import { isSyntheticColumnKey } from '../logic/detailRow';
import { flattenGroupTree, isGroupOrderValue } from '../logic/grouping';
import { serializeRowsToCsv, type LabelExportLine } from '../logic/exportCsv';
import { buildGridExportData } from '../logic/exportData';
import { buildTotalRowExportLine } from '../logic/totalRow';
import { normalizeExportScope } from '../logic/exportScope';
import type { GridApiArgs } from './gridApi';

export type ExportCommands<T> = {
  exportCsv: SpreadsheetGridHandle<T>['exportCsv'];
  downloadCsv: SpreadsheetGridHandle<T>['downloadCsv'];
  getExportData: SpreadsheetGridHandle<T>['getExportData'];
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

// エクスポート用の「全展開」開閉状態(行グルーピングの 'view' 出力で使用)。
const NO_COLLAPSED_GROUPS: ReadonlySet<string> = new Set();

export const createExportCommands = <T,>(getArgs: () => GridApiArgs<T> | null): ExportCommands<T> => {
  // scope('view' / 'raw' / 'rendered' / 'selection' + 後方互換 'all' / 'visible')から、出力対象の行アクセサ /
  //   行レンジ [startRow, endRow) / 列集合を解決します(exportCsv と getExportData で共有)。
  //   scope='selection' で選択が無いときは null。
  const resolveExportScope = (scope: CsvExportScope, includeLabelRows = false): ExportResolution<T> | null => {
    const s = getArgs();
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
    // 'view' + 行グルーピング: 開閉状態に関わらず、フィルター / ソート後の leaf 行をすべて出力します
    //   (折りたたみは見た目の操作で、出力を減らしません。件数表示(leaf 基準)とも揃えます)。
    //   全展開した表示順で走査し、グループ行(負値)は undefined としてスキップします。
    //   isRowExportable の viewRowIndex は「全展開時のビュー行 index」です。
    if (s.groupTree) {
      const expandedOrder = flattenGroupTree(s.groupTree, NO_COLLAPSED_GROUPS).displayOrder;
      const getExpandedRow = (index: number): T => {
        const sourceIndex = expandedOrder[index];
        return (sourceIndex === undefined || isGroupOrderValue(sourceIndex) ? undefined : s.rows[sourceIndex]) as T;
      };
      return {
        getRow: getExpandedRow,
        startRow: 0,
        endRow: expandedOrder.length,
        columns: s.orderedColumns,
        isRowIncluded: isRowExportableProp
          ? (row: T, index: number) =>
              isRowExportableProp(row, {
                viewRowIndex: index,
                rowKey: s.resolvedRowKeyGetter(row, expandedOrder[index] ?? index),
              })
          : undefined,
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

  // 追加(合計行 3A): 合計行の出力行です。includeTotalRow かつ scope 'view'(後方互換 'all' を含む)で、合計行が
  //   有効なときだけ。'raw'(フィルター無視)/ 'rendered' / 'selection' は合計の対象行と一致しないため出しません。
  const resolveTotalLine = (
    scope: CsvExportScope,
    includeTotalRow: boolean | undefined,
    exportColumns: GridColumn<T>[],
  ): unknown[] | undefined => {
    const totalRowExport = getArgs()?.totalRowExport;
    if (includeTotalRow !== true || !totalRowExport || normalizeExportScope(scope) !== 'view') {
      return undefined;
    }
    return buildTotalRowExportLine(exportColumns, totalRowExport.cells, totalRowExport.label);
  };

  const buildCsv = (options?: CsvExportOptions): string => {
    const scope = options?.scope ?? 'view';
    const resolved = resolveExportScope(scope, options?.includeLabelRows === true);
    if (!resolved) {
      return options?.bom ? '\uFEFF' : '';
    }
    const exportColumns = stripSyntheticColumns(resolved.columns);
    return serializeRowsToCsv({
      getRow: resolved.getRow,
      startRow: resolved.startRow,
      endRow: resolved.endRow,
      columns: exportColumns,
      delimiter: options?.delimiter,
      includeHeaders: options?.includeHeaders,
      bom: options?.bom,
      escapeFormulas: options?.escapeFormulas,
      isRowIncluded: resolved.isRowIncluded,
      getLabelLine: resolved.getLabelLine,
      totalLine: resolveTotalLine(scope, options?.includeTotalRow, exportColumns),
    });
  };

  const buildExportData = (options?: GridExportOptions): GridExportData => {
    const scope = options?.scope ?? 'view';
    const resolved = resolveExportScope(scope, options?.includeLabelRows === true);
    if (!resolved) {
      return { columns: [], rows: [] };
    }
    const exportColumns = stripSyntheticColumns(resolved.columns);
    return buildGridExportData({
      getRow: resolved.getRow,
      startRow: resolved.startRow,
      endRow: resolved.endRow,
      columns: exportColumns,
      isRowIncluded: resolved.isRowIncluded,
      getLabelLine: resolved.getLabelLine,
      totalLine: resolveTotalLine(scope, options?.includeTotalRow, exportColumns),
    });
  };

  return {
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
  };
};