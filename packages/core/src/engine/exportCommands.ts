// 追加(差し込み式 段階 2): 命令的 API のエクスポート(exportCsv / downloadCsv / getExportData)の実体です(React 非依存)。
//   gridApi.ts の中にあった scope の解決 / 合成列の除外 / 合計行の出力行 / CSV・整形済みデータの組み立て / ファイル化を
//   そのまま移したもので、gridApi は機能セット(GridCoreFeatures.export)からこの生成関数を受け取ります。機能セットに
//   無い構成では代役(空を返す)が受けます。呼び出し時点の最新の状態は getArgs で読みます(gridApi の update と同じ鮮度)。
import type {
  CsvExportOptions,
  CsvExportScope,
  GridColumn,
  GridGroupRow,
  GridExportData,
  GridExportOptions,
  SpreadsheetGridHandle,
} from '../model/gridTypes.unbound';
import { normalizeCellRange, normalizeColumnRange, normalizeRowRange } from '../model/gridSelectors';
import { isSyntheticColumnKey } from '../logic/detailRow';
import { collectGroupingColumns, flattenGroupTree, isGroupOrderValue } from '../logic/grouping';
import { createGroupSubtotalLineGetter, type GroupSubtotalLine } from '../logic/groupExport';
import { serializeRowsToCsv, type LabelExportLine } from '../logic/exportCsv';
import { buildGridExportData } from '../logic/exportData';
import { buildTotalRowExportLine } from '../logic/totalRow';
import type { GridApiArgs } from './gridApi';
import type { GroupingFeature } from './features';

// 型だけの宣言です(ブラウザに process は無く、利用側のバンドラが process.env.NODE_ENV を文字列へ置き換える)。
declare const process: { env: { NODE_ENV?: string } };

// ダウンロード用の URL を破棄するまでの猶予(FC-34)。
const DOWNLOAD_URL_REVOKE_DELAY_MS = 1000;

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
  // 追加(段階 2 DU-10): 行グルーピング中の 'view' の全展開した表示順とグループ行(小計の行を組み立てる元)と、
  //   グループ元の列の key(階層の順)。
  //   追加(段階 2 の見直し): getSourceRow はグループ元の列の値を列の formatClipboardValue で整えるときの代表の行を引く関数。
  groupDisplay?: {
    order: ArrayLike<number>;
    groups: readonly GridGroupRow[];
    groupColumnKeys: readonly string[];
    getSourceRow: (sourceIndex: number) => T | undefined;
  };
};

// エクスポート用の「全展開」開閉状態(行グルーピングの 'view' 出力で使用)。
const NO_COLLAPSED_GROUPS: ReadonlySet<string> = new Set();

// 追加(1.0.0): scope の値を 4 つに限ります。型を通さずに渡された値(JavaScript からの呼び出しや、保存した設定。
//   1.0.0 で消した 'all' / 'visible' など)は、分岐ごとにばらばらに扱われないよう 'view' として扱い、開発時だけ警告します。
const toKnownExportScope = (scope: CsvExportScope | undefined): CsvExportScope => {
  if (scope === undefined || scope === 'view' || scope === 'raw' || scope === 'rendered' || scope === 'selection') {
    return scope ?? 'view';
  }
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `SpreadsheetGrid: エクスポートの scope '${String(scope)}' はありません。'view' として扱います('all' / 'visible' は 1.0.0 で消しました。'view' / 'rendered' を使ってください)。\n` +
        `SpreadsheetGrid: The export scope '${String(scope)}' does not exist, so it is treated as 'view' ('all' / 'visible' were removed in 1.0.0; use 'view' / 'rendered').`,
    );
  }
  return 'view';
};

export const createExportCommands = <T,>(
  getArgs: () => GridApiArgs<T> | null,
  // 機能セットの行グルーピング(小計の行を出力する行だけで組み直すときの buildGroupTree。/lite で行グルーピングの
  //   機能が無い構成ではグループツリー自体が無いので使わない。エクスポートの部品へ直接 import すると、行グルーピングを
  //   使わない構成にも集計の処理が入るため、機能セットから受け取ります)。
  grouping?: GroupingFeature,
): ExportCommands<T> => {
  // scope('view' / 'raw' / 'rendered' / 'selection')から、出力対象の行アクセサ /
  //   行レンジ [startRow, endRow) / 列集合を解決します(exportCsv と getExportData で共有)。
  //   scope='selection' で選択が無いときは null。
  const resolveExportScope = (
    scope: CsvExportScope,
    includeLabelRows = false,
    includeGroupRows = false,
  ): ExportResolution<T> | null => {
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
    // 追加(段階 2 DU-10): 行グルーピング中は、表示から外れているグループ元の列(地域・区分など)を先頭に入れます
    //   (入れないと、どの行がどのグループか分からない平らな表になっていた)。行の全体を出す scope('view' / 'raw' /
    //   'rendered' / 行の選択)だけで、セル / 列の選択は選んだ列のままです。
    const groupColumns = s.groupTree ? collectGroupingColumns(s.columns).groupColumns : [];
    const withGroupColumns = (columns: GridColumn<T>[]): GridColumn<T>[] =>
      groupColumns.length > 0 ? [...groupColumns, ...columns.filter((column) => !groupColumns.includes(column))] : columns;
    if (scope === 'raw') {
      // serverSide はソース行配列を持たない(未ロード行が存在する)ため 'view' 相当へフォールバックし警告。
      if (s.isServerSide) {
        // 変更(英語対応): 開発時だけ警告します(本番の JS から文を除く)。
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            "SpreadsheetGrid: scope 'raw' は serverSide では未ロード行を取得できないため、'view'(ロード済みビュー行)として扱います。全件エクスポートはサーバ側での実施を推奨します。\n" +
              "SpreadsheetGrid: scope 'raw' cannot read rows that are not loaded with serverSide, so it is treated as 'view' (the loaded rows). Export all rows on the server instead.",
          );
        }
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
        columns: withGroupColumns(s.orderedColumns),
        isRowIncluded: isRowIncludedRaw,
        getLabelLine:
          includeLabelRows && labelExport
            ? (index: number) => (isRawLabel(index) ? toLabelLine(s.rows[index]) : undefined)
            : undefined,
      };
    }
    if (scope === 'rendered') {
      return {
        getRow: getViewRow,
        startRow: s.windowFirstRow,
        endRow: s.windowLastRow >= s.windowFirstRow ? s.windowLastRow + 1 : s.windowFirstRow,
        columns: withGroupColumns(s.orderedColumns),
        isRowIncluded: isRowIncludedView,
        getLabelLine: getViewLabelLine,
      };
    }
    if (scope === 'selection') {
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
          columns: withGroupColumns(s.orderedColumns),
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
      const expanded = flattenGroupTree(s.groupTree, NO_COLLAPSED_GROUPS);
      let expandedOrder = expanded.displayOrder;
      let expandedGroups = expanded.groups;
      const isExpandedRowIncluded = isRowExportableProp
        ? (row: T, index: number) =>
            isRowExportableProp(row, {
              viewRowIndex: index,
              rowKey: s.resolvedRowKeyGetter(row, expandedOrder[index] ?? index),
            })
        : undefined;
      let isRowIncluded = isExpandedRowIncluded;
      // 修正(段階 2 の見直し): 小計の行を出すときは、出力しない行(isRowExportable が false)を先に除き、残る行だけで
      //   グループを組み直します(小計は出力する行だけで数え、行が 1 つも残らないグループは小計の行も出さない。
      //   これまでは除いた行も小計に数え、行が無いグループの小計の行も出ていた)。isRowExportable の viewRowIndex は
      //   これまでどおり全展開時のビュー行 index で、各行 1 回だけ呼びます。グループの並びは画面のまま(集計値の
      //   並べ替えをやり直さない)。
      if (includeGroupRows && isExpandedRowIncluded && grouping) {
        const kept: number[] = [];
        let excluded = false;
        for (let index = 0; index < expandedOrder.length; index += 1) {
          const sourceIndex = expandedOrder[index];
          if (sourceIndex === undefined || isGroupOrderValue(sourceIndex)) {
            continue;
          }
          if (isExpandedRowIncluded(s.rows[sourceIndex], index)) {
            kept.push(sourceIndex);
          } else {
            excluded = true;
          }
        }
        if (excluded) {
          const { aggColumns } = collectGroupingColumns(s.columns);
          const rebuilt = flattenGroupTree(
            grouping.buildGroupTree(s.rows, Int32Array.from(kept), groupColumns, aggColumns),
            NO_COLLAPSED_GROUPS,
          );
          expandedOrder = rebuilt.displayOrder;
          expandedGroups = rebuilt.groups;
        }
        isRowIncluded = undefined;
      }
      const order = expandedOrder;
      const getExpandedRow = (index: number): T => {
        const sourceIndex = order[index];
        return (sourceIndex === undefined || isGroupOrderValue(sourceIndex) ? undefined : s.rows[sourceIndex]) as T;
      };
      return {
        getRow: getExpandedRow,
        startRow: 0,
        endRow: order.length,
        columns: withGroupColumns(s.orderedColumns),
        groupDisplay: {
          order,
          groups: expandedGroups,
          groupColumnKeys: groupColumns.map((column) => column.key),
          getSourceRow: (sourceIndex: number) => s.rows[sourceIndex],
        },
        isRowIncluded,
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

  // 追加(合計行 3A): 合計行の出力行です。includeTotalRow かつ scope 'view' で、合計行が
  //   有効なときだけ。'raw'(フィルター無視)/ 'rendered' / 'selection' は合計の対象行と一致しないため出しません。
  const resolveTotalLine = (
    scope: CsvExportScope,
    includeTotalRow: boolean | undefined,
    exportColumns: GridColumn<T>[],
  ): unknown[] | undefined => {
    const totalRowExport = getArgs()?.totalRowExport;
    if (includeTotalRow !== true || !totalRowExport || scope !== 'view') {
      return undefined;
    }
    return buildTotalRowExportLine(exportColumns, totalRowExport.cells, totalRowExport.label);
  };

  // 追加(段階 2 DU-10): 小計の行(includeGroupRows かつ行グルーピング中の 'view')。列は合成列を除いた後の出力列。
  const resolveGroupLine = (
    resolved: ExportResolution<T>,
    includeGroupRows: boolean | undefined,
    exportColumns: GridColumn<T>[],
  ): ((index: number) => GroupSubtotalLine | undefined) | undefined =>
    includeGroupRows === true && resolved.groupDisplay
      ? createGroupSubtotalLineGetter({ ...resolved.groupDisplay, columns: exportColumns, texts: getArgs()?.localeTexts })
      : undefined;

  const buildCsv = (options?: CsvExportOptions): string => {
    const scope = toKnownExportScope(options?.scope);
    const resolved = resolveExportScope(scope, options?.includeLabelRows === true, options?.includeGroupRows === true);
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
      getGroupLine: resolveGroupLine(resolved, options?.includeGroupRows, exportColumns),
    });
  };

  const buildExportData = (options?: GridExportOptions): GridExportData => {
    const scope = toKnownExportScope(options?.scope);
    const resolved = resolveExportScope(scope, options?.includeLabelRows === true, options?.includeGroupRows === true);
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
      getGroupLine: resolveGroupLine(resolved, options?.includeGroupRows, exportColumns),
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
      // 変更(1.0 前の最終チェック FC-34): URL の破棄はダウンロードが始まってからにします(click の直後に同期で破棄すると、
      //   一部のブラウザ(古い Safari 等)でダウンロードが失敗する)。
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, DOWNLOAD_URL_REVOKE_DELAY_MS);
    },


    getExportData: (options) => buildExportData(options),
  };
};