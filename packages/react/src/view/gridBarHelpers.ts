import type { ReactNode } from 'react';
import type {
  CellCoord,
  ColumnFilterValue,
  GridSelection,
  GridColumn,
  SpreadsheetGridSlotContext,
  SpreadsheetGridDerivedSummary,
  SpreadsheetGridSelectionStats,
} from '../model/gridTypes';
import { toExcelColumnName } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/excelColumnName';
import { isSyntheticColumnKey } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/detailRow';
// 追加(dogfood DF-10): 番地と件数をラベル行を飛ばして数えます(行ヘッダーの番号と揃える)。
import { countLabelsBefore } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/labelRows';
// 追加(12-A): set フィルター対応のフィルター有効判定を共有します。
import { isActiveColumnFilterValue } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/filtering';

// 追加: Grid の slot renderer を解決します。
export const resolveGridSlot = <T,>(
  slotRenderer:
    | ((context: SpreadsheetGridSlotContext<T>) => ReactNode)
    | undefined,
  context: SpreadsheetGridSlotContext<T>,
  fallback: ReactNode,
) => {
  if (slotRenderer) {
    return slotRenderer(context);
  }
  return fallback;
};

// 追加: summary 用に長い文字列を短く丸めます。
const truncateSummaryText = (value: string, maxLength = 16) => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
};

// 追加(audit V-12): 列 index(画面の並び = 合成列込み)→ A1 の列名。合成列(行ドラッグハンドル / 展開トグル /
//   自動グループ列)を数えないため、合成列が先頭にあっても最初のデータ列が "A" になります。合成列が無ければ
//   toExcelColumnName そのもの(従来どおり)。
export type GridColumnNamer = (columnIndex: number) => string;

export const createDataColumnNamer = (orderedColumns: ReadonlyArray<{ key: string }>): GridColumnNamer => {
  const syntheticBefore: number[] = [];
  let count = 0;
  for (const column of orderedColumns) {
    syntheticBefore.push(count);
    if (isSyntheticColumnKey(column.key)) {
      count += 1;
    }
  }
  if (count === 0) {
    return toExcelColumnName;
  }
  return (columnIndex) =>
    toExcelColumnName(Math.max(columnIndex - (syntheticBefore[columnIndex] ?? count), 0));
};

// 追加(dogfood DF-10): 行の番号(行ヘッダーの番号と同じ = ラベル行を飛ばした通し番号)と、範囲の中のデータ行の数。
//   numberOf は範囲の始まり / アクティブセル向け(ラベル行なら次のデータ行の番号)、lastNumberOf は範囲の終わり向け
//   (ラベル行なら前のデータ行の番号)。ラベル行が無ければ view index + 1 と行数そのもの(従来どおり)。
export type GridRowNumberer = {
  numberOf: (viewRowIndex: number) => number;
  lastNumberOf: (viewRowIndex: number) => number;
  countRows: (startRow: number, endRow: number) => number;
};

const PLAIN_ROW_NUMBERER: GridRowNumberer = {
  numberOf: (viewRowIndex) => viewRowIndex + 1,
  lastNumberOf: (viewRowIndex) => viewRowIndex + 1,
  countRows: (startRow, endRow) => endRow - startRow + 1,
};

export const createDataRowNumberer = (labelViewIndexes: ArrayLike<number> | undefined): GridRowNumberer => {
  if (!labelViewIndexes || labelViewIndexes.length === 0) {
    return PLAIN_ROW_NUMBERER;
  }
  return {
    numberOf: (viewRowIndex) => viewRowIndex - countLabelsBefore(labelViewIndexes, viewRowIndex) + 1,
    lastNumberOf: (viewRowIndex) => viewRowIndex + 1 - countLabelsBefore(labelViewIndexes, viewRowIndex + 1),
    countRows: (startRow, endRow) =>
      endRow -
      startRow +
      1 -
      (countLabelsBefore(labelViewIndexes, endRow + 1) - countLabelsBefore(labelViewIndexes, startRow)),
  };
};

// 追加: ActiveCell を A1 形式へ整形します。
export const formatGridCellLabel = (
  cell: CellCoord | null,
  toColumnName: GridColumnNamer = toExcelColumnName,
  rowNumberer: GridRowNumberer = PLAIN_ROW_NUMBERER,
) => {
  if (!cell) {
    return 'なし';
  }
  return `${toColumnName(cell.col)}${rowNumberer.numberOf(cell.row)}`;
};

// 追加: selection の概要を短く整形します。
export const formatGridSelectionLabel = (
  selection: GridSelection,
  toColumnName: GridColumnNamer = toExcelColumnName,
  rowNumberer: GridRowNumberer = PLAIN_ROW_NUMBERER,
) => {
  if (!selection) {
    return 'なし';
  }

  if (selection.type === 'cell') {
    const startRow = Math.min(
      selection.range.start.row,
      selection.range.end.row,
    );
    const endRow = Math.max(
      selection.range.start.row,
      selection.range.end.row,
    );
    const startCol = Math.min(
      selection.range.start.col,
      selection.range.end.col,
    );
    const endCol = Math.max(
      selection.range.start.col,
      selection.range.end.col,
    );

    return `${toColumnName(startCol)}${rowNumberer.numberOf(startRow)} - ${toColumnName(
      endCol,
    )}${rowNumberer.lastNumberOf(endRow)}`;
  }

  if (selection.type === 'row') {
    const startRow = Math.min(selection.startRow, selection.endRow);
    const endRow = Math.max(selection.startRow, selection.endRow);
    return `Row ${rowNumberer.numberOf(startRow)} - ${rowNumberer.lastNumberOf(endRow)}`;
  }

  const startCol = Math.min(selection.startCol, selection.endCol);
  const endCol = Math.max(selection.startCol, selection.endCol);
  return `Col ${toColumnName(startCol)} - ${toColumnName(endCol)}`;
};

// 追加: rows / filteredRows の概要テキストです。
// 変更(DS-3-7): filteredRows(配列)依存をやめ、件数 filteredRowCount(数値)を引数で受けます。
//   公開 slotContext.filteredRows は遅延 getter で別途供給され、サマリは件数しか使いません。
// 変更(label-row ③): 分母は totalRowCount(未指定は rows.length。ラベル行有効時はラベル行を除いた行数)。
export const formatGridRowSummary = <T,>(
  context: Pick<SpreadsheetGridSlotContext<T>, 'rows'>,
  filteredRowCount: number,
  totalRowCount: number = context.rows.length,
) => `Rows: ${filteredRowCount} / ${totalRowCount}`;

// 追加: columns / visibleColumns の概要テキストです。
// 変更(dogfood DF-11): 表示中の列は合成列(行ドラッグのハンドル / 展開トグル / 自動グループ列)を数えません
//   (分母の columns は利用者の列だけなので、合成列があると「7 / 6」になっていた)。
const countDataColumns = <T,>(columns: ReadonlyArray<GridColumn<T>>) => {
  let count = 0;
  for (const column of columns) {
    if (!isSyntheticColumnKey(column.key)) {
      count += 1;
    }
  }
  return count;
};

export const formatGridColumnSummary = <T,>(
  context: Pick<SpreadsheetGridSlotContext<T>, 'columns' | 'visibleColumns'>,
) => `Columns: ${countDataColumns(context.visibleColumns)} / ${context.columns.length}`;

// 追加: selection から選択セル数 / 行数 / 列数を算出します。
export const getGridSelectionStats = <T,>(
  context: Pick<SpreadsheetGridSlotContext<T>, 'selection' | 'visibleColumns'>,
  // 変更(DS-3-7): filteredRows(配列)→ 件数 filteredRowCount(数値)を引数で受けます。
  filteredRowCount: number,
  // 追加(dogfood DF-10): 行数はラベル行を数えません(未指定は従来どおり)。
  rowNumberer: GridRowNumberer = PLAIN_ROW_NUMBERER,
): SpreadsheetGridSelectionStats => {
  const selection = context.selection;
  if (!selection) {
    return {
      selectedCellCount: 0,
      selectedRowCount: 0,
      selectedColumnCount: 0,
    };
  }

  if (selection.type === 'cell') {
    const startRow = Math.min(
      selection.range.start.row,
      selection.range.end.row,
    );
    const endRow = Math.max(
      selection.range.start.row,
      selection.range.end.row,
    );
    const startCol = Math.min(
      selection.range.start.col,
      selection.range.end.col,
    );
    const endCol = Math.max(
      selection.range.start.col,
      selection.range.end.col,
    );
    const selectedRowCount = rowNumberer.countRows(startRow, endRow);
    const selectedColumnCount = endCol - startCol + 1;
    return {
      selectedCellCount: selectedRowCount * selectedColumnCount,
      selectedRowCount,
      selectedColumnCount,
    };
  }

  if (selection.type === 'row') {
    const startRow = Math.min(selection.startRow, selection.endRow);
    const endRow = Math.max(selection.startRow, selection.endRow);
    const selectedRowCount = rowNumberer.countRows(startRow, endRow);
    // 変更(dogfood DF-11): 合成列は数えません。
    const selectedColumnCount = countDataColumns(context.visibleColumns);
    return {
      selectedCellCount: selectedRowCount * selectedColumnCount,
      selectedRowCount,
      selectedColumnCount,
    };
  }

  const startCol = Math.min(selection.startCol, selection.endCol);
  const endCol = Math.max(selection.startCol, selection.endCol);
  const selectedColumnCount = endCol - startCol + 1;
  const selectedRowCount = filteredRowCount;
  return {
    selectedCellCount: selectedRowCount * selectedColumnCount,
    selectedRowCount,
    selectedColumnCount,
  };
};

// 追加: selection 数量の要約テキストです。
export const formatGridSelectionStatsLabel = <T,>(
  context: Pick<SpreadsheetGridSlotContext<T>, 'selection' | 'visibleColumns'>,
  filteredRowCount: number,
  rowNumberer: GridRowNumberer = PLAIN_ROW_NUMBERER,
) => {
  const stats = getGridSelectionStats(context, filteredRowCount, rowNumberer);
  return `Cells: ${stats.selectedCellCount} / Rows: ${stats.selectedRowCount}`;
};

// 変更(12-A): 列フィルターの有効件数を数えます。
// 変更理由: set フィルター値はオブジェクトのため String(value).trim() 判定が
//           成立しません(空配列も「全行除外」として有効に数える必要があります)。
//           判定を logic/filtering.ts の isActiveColumnFilterValue へ一元化します。
const countActiveColumnFilters = (
  columnFilterValues: Record<string, ColumnFilterValue>,
) =>
  Object.values(columnFilterValues).filter((value) =>
    isActiveColumnFilterValue(value),
  ).length;

// 追加: フィルター状態の要約テキストです。
export const formatGridFilterSummary = <T,>(
  context: Pick<
    SpreadsheetGridSlotContext<T>,
    'globalFilterText' | 'columnFilterValues'
  >,
) => {
  const hasGlobalFilter = context.globalFilterText.trim().length > 0;
  const globalFilterPreview = hasGlobalFilter
    ? truncateSummaryText(context.globalFilterText.trim())
    : null;
  const columnFilterCount = countActiveColumnFilters(context.columnFilterValues);

  if (!hasGlobalFilter && columnFilterCount === 0) {
    return 'Filter: なし';
  }

  if (hasGlobalFilter && columnFilterCount === 0) {
    return `Filter: Global("${globalFilterPreview}")`;
  }

  if (!hasGlobalFilter && columnFilterCount > 0) {
    return `Filter: ${columnFilterCount}列`;
  }

  return `Filter: Global("${globalFilterPreview}") + ${columnFilterCount}列`;
};

// 変更(MS-1): ソート列名取得を「単一 key → ラベル」に一般化します
//            (配列の各エントリ・主ソート列の双方から使い回せるように)。
const getColumnLabelByKey = <T,>(
  columns: GridColumn<T>[],
  columnKey: string,
) => {
  const column = columns.find((item) => item.key === columnKey);
  return column?.title || column?.key || columnKey;
};

// 追加: ソート状態の要約テキストです。
export const formatGridSortSummary = <T,>(
  context: Pick<SpreadsheetGridSlotContext<T>, 'columns' | 'sortState'>,
) => {
  // 変更(MS-1): 配列を優先順位順に「列名 (方向)」で連結します。
  //   単一エントリのときは従来と同一の文字列(例: 'Sort: 金額 (昇順)')になります。
  if (context.sortState.length === 0) {
    return 'Sort: なし';
  }

  const parts = context.sortState.map((entry) => {
    const label = getColumnLabelByKey(context.columns, entry.columnKey);
    return `${label} (${entry.direction === 'asc' ? '昇順' : '降順'})`;
  });

  return `Sort: ${parts.join(', ')}`;
};

// 追加: slot context に載せる派生 summary を一括構築します。
export const buildGridDerivedSummary = <T,>(
  context: Pick<
    SpreadsheetGridSlotContext<T>,
    | 'rows'
    | 'columns'
    | 'visibleColumns'
    | 'globalFilterText'
    | 'columnFilterValues'
    | 'sortState'
    | 'activeCell'
    | 'selection'
  >,
  // 変更(DS-3-7): filteredRows(配列)依存を除去し、件数を引数で各 format 関数へ流します。
  filteredRowCount: number,
  // 追加(label-row ③): 総データ行数(未指定は rows.length)。
  totalRowCount?: number,
  // 追加(audit V-12): A1 の列名(未指定は合成列を考慮しない toExcelColumnName)。
  toColumnName: GridColumnNamer = toExcelColumnName,
  // 追加(dogfood DF-10): 行の番号と行数(未指定はラベル行を考慮しない)。
  rowNumberer: GridRowNumberer = PLAIN_ROW_NUMBERER,
): SpreadsheetGridDerivedSummary => {
  const selectionStats = getGridSelectionStats(context, filteredRowCount, rowNumberer);
  const hasGlobalFilter = context.globalFilterText.trim().length > 0;
  const globalFilterPreview = hasGlobalFilter
    ? truncateSummaryText(context.globalFilterText.trim())
    : null;
  const activeColumnFilterCount = countActiveColumnFilters(
    context.columnFilterValues,
  );
  const hasAnyFilter = hasGlobalFilter || activeColumnFilterCount > 0;
  // 変更(MS-1): 配列ベースの判定に置き換えます。
  //   sortedColumnLabel は後方互換のため「主ソート(先頭)列」のラベルを返します
  //   (複数ソート時は先頭。全体の要約は sortSummaryText 側が担います)。
  const hasSorting = context.sortState.length > 0;
  const sortedColumnLabel = hasSorting
    ? getColumnLabelByKey(context.columns, context.sortState[0].columnKey)
    : null;

  return {
    rowSummaryText: formatGridRowSummary(context, filteredRowCount, totalRowCount),
    columnSummaryText: formatGridColumnSummary(context),
    filterSummaryText: formatGridFilterSummary(context),
    sortSummaryText: formatGridSortSummary(context),
    activeCellLabel: formatGridCellLabel(context.activeCell, toColumnName, rowNumberer),
    selectionLabel: formatGridSelectionLabel(context.selection, toColumnName, rowNumberer),
    selectionStatsText: formatGridSelectionStatsLabel(context, filteredRowCount, rowNumberer),
    selectionStats,
    hasGlobalFilter,
    globalFilterPreview,
    activeColumnFilterCount,
    hasAnyFilter,
    hasSorting,
    sortedColumnLabel,
  };
};