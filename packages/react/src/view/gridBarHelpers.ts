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
import { DETAIL_TOGGLE_COLUMN_KEY, isSyntheticColumnKey } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/detailRow';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/rowReorder';
// 追加(段階 2 G1): 自動グループ列のセルの番地は見出しの名前で出します。
import { GROUP_AUTO_COLUMN_KEY } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/grouping';
// 追加(dogfood DF-10): 番地と件数をラベル行を飛ばして数えます(行ヘッダーの番号と揃える)。
import { countLabelsBefore } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/labelRows';
// 追加(12-A): set フィルター対応のフィルター有効判定を共有します。
import { isActiveColumnFilterValue } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/filtering';
// 追加(段階 2 DU-18): バーの文言(localeText。既定は日本語)。
import {
  DEFAULT_GRID_LOCALE_TEXT,
  formatLocaleText,
  type ResolvedGridLocaleText,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';

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
// 追加(段階 2 G1): cellNameOf は 1 つのセルの番地で、列の文字の代わりに名前を出す列(自動グループ列 = 見出しの名前)。
//   「地域 › 担当 3」のように名前と行番号を空白でつなぎます。これまでは先頭のデータ列と同じ文字(「A3」)で、
//   どのセルか分かりませんでした。範囲の番地(`A3:C5`)は従来どおり次のデータ列の文字です。
export type GridColumnNamer = ((columnIndex: number) => string) & {
  readonly cellNameOf?: (columnIndex: number) => string | undefined;
};

// 追加(英語対応 L-N1): 展開トグル列 / 行ドラッグのハンドル列のセルも名前で出します(names = 文言の表の
//   detailColumnName / rowDragColumnName。「詳細 7」「Move 7」)。これまでは次のデータ列の「A7」で、どのセルか分からなかった。
export const createDataColumnNamer = (
  orderedColumns: ReadonlyArray<{ key: string; title?: string }>,
  names: { detail: string; rowDrag: string } = {
    detail: DEFAULT_GRID_LOCALE_TEXT.detailColumnName,
    rowDrag: DEFAULT_GRID_LOCALE_TEXT.rowDragColumnName,
  },
): GridColumnNamer => {
  const syntheticBefore: number[] = [];
  const cellNames = new Map<number, string>();
  let count = 0;
  for (const [index, column] of orderedColumns.entries()) {
    syntheticBefore.push(count);
    if (isSyntheticColumnKey(column.key)) {
      count += 1;
    }
    if (column.key === GROUP_AUTO_COLUMN_KEY) {
      cellNames.set(index, column.title || column.key);
    } else if (column.key === DETAIL_TOGGLE_COLUMN_KEY) {
      cellNames.set(index, names.detail);
    } else if (column.key === ROW_DRAG_HANDLE_COLUMN_KEY) {
      cellNames.set(index, names.rowDrag);
    }
  }
  if (count === 0) {
    return toExcelColumnName;
  }
  const namer = (columnIndex: number) =>
    toExcelColumnName(Math.max(columnIndex - (syntheticBefore[columnIndex] ?? count), 0));
  return Object.assign(namer, {
    cellNameOf: (columnIndex: number) => cellNames.get(columnIndex),
  });
};

// 追加(段階 2 G1): 1 つのセルの番地。名前で出す列は「名前 行番号」、それ以外は A1 形式。
const formatSingleCell = (
  toColumnName: GridColumnNamer,
  columnIndex: number,
  rowNumber: number,
) => {
  const name = toColumnName.cellNameOf?.(columnIndex);
  return name === undefined ? `${toColumnName(columnIndex)}${rowNumber}` : `${name} ${rowNumber}`;
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
  texts: ResolvedGridLocaleText = DEFAULT_GRID_LOCALE_TEXT,
) => {
  if (!cell) {
    return texts.none;
  }
  return formatSingleCell(toColumnName, cell.col, rowNumberer.numberOf(cell.row));
};

// 追加: selection の概要を短く整形します。
// 変更(段階 2 DU-18): Excel の参照の書き方にしました(セル `B3:D5`・1 セルなら `B3` / 行 `3:5` / 列 `B:D`。これまでは
//   `B3 - D5` / `Row 3 - 5` / `Col B - D`)。
export const formatGridSelectionLabel = (
  selection: GridSelection,
  toColumnName: GridColumnNamer = toExcelColumnName,
  rowNumberer: GridRowNumberer = PLAIN_ROW_NUMBERER,
  texts: ResolvedGridLocaleText = DEFAULT_GRID_LOCALE_TEXT,
) => {
  if (!selection) {
    return texts.none;
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

    if (startRow === endRow && startCol === endCol) {
      return formatSingleCell(toColumnName, startCol, rowNumberer.numberOf(startRow));
    }
    // 追加(段階 2 の確かめ直し G-N7): 名前で出す列(自動グループ列)の中だけの範囲は「名前 行の範囲」(「地域 › 担当 4:6」)。
    //   これまでは次のデータ列の文字(「A4:A6」)で、そのデータ列まで広げた範囲と見分けられませんでした。
    const name = startCol === endCol ? toColumnName.cellNameOf?.(startCol) : undefined;
    if (name !== undefined) {
      return `${name} ${rowNumberer.numberOf(startRow)}:${rowNumberer.lastNumberOf(endRow)}`;
    }
    const start = `${toColumnName(startCol)}${rowNumberer.numberOf(startRow)}`;
    const end = `${toColumnName(endCol)}${rowNumberer.lastNumberOf(endRow)}`;
    return start === end ? start : `${start}:${end}`;
  }

  if (selection.type === 'row') {
    const startRow = Math.min(selection.startRow, selection.endRow);
    const endRow = Math.max(selection.startRow, selection.endRow);
    return `${rowNumberer.numberOf(startRow)}:${rowNumberer.lastNumberOf(endRow)}`;
  }

  const startCol = Math.min(selection.startCol, selection.endCol);
  const endCol = Math.max(selection.startCol, selection.endCol);
  return `${toColumnName(startCol)}:${toColumnName(endCol)}`;
};

// 追加: rows / filteredRows の概要テキストです。
// 変更(DS-3-7): filteredRows(配列)依存をやめ、件数 filteredRowCount(数値)を引数で受けます。
//   公開 slotContext.filteredRows は遅延 getter で別途供給され、サマリは件数しか使いません。
// 変更(label-row ③): 分母は totalRowCount(未指定は rows.length。ラベル行有効時はラベル行を除いた行数)。
export const formatGridRowSummary = <T,>(
  context: Pick<SpreadsheetGridSlotContext<T>, 'rows'>,
  filteredRowCount: number,
  totalRowCount: number = context.rows.length,
  texts: ResolvedGridLocaleText = DEFAULT_GRID_LOCALE_TEXT,
) => formatLocaleText(texts.rowCount, { shown: filteredRowCount, total: totalRowCount });

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

// 追加(アプリの再確認): 範囲(画面の並びの index。両端を含む)の中のデータ列の数(合成列を数えない)。
const countDataColumnsInRange = <T,>(columns: ReadonlyArray<GridColumn<T>>, startCol: number, endCol: number) => {
  let count = 0;
  for (let col = startCol; col <= endCol; col += 1) {
    const column = columns[col];
    if (!column || !isSyntheticColumnKey(column.key)) {
      count += 1;
    }
  }
  return count;
};

export const formatGridColumnSummary = <T,>(
  context: Pick<SpreadsheetGridSlotContext<T>, 'columns' | 'visibleColumns'>,
  texts: ResolvedGridLocaleText = DEFAULT_GRID_LOCALE_TEXT,
) => formatLocaleText(texts.columnCount, { shown: countDataColumns(context.visibleColumns), total: context.columns.length });

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
    // 変更(アプリの再確認): 範囲の中の合成列は数えません(展開トグル列などがあると Ctrl+A で列数とセル数が多く出ていた)。
    const selectedColumnCount = countDataColumnsInRange(context.visibleColumns, startCol, endCol);
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
  // 変更(アプリの再確認): 合成列は数えません。
  const selectedColumnCount = countDataColumnsInRange(context.visibleColumns, startCol, endCol);
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
  texts: ResolvedGridLocaleText = DEFAULT_GRID_LOCALE_TEXT,
) => {
  const stats = getGridSelectionStats(context, filteredRowCount, rowNumberer);
  return formatLocaleText(texts.selectionSize, { cells: stats.selectedCellCount, rows: stats.selectedRowCount });
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
  texts: ResolvedGridLocaleText = DEFAULT_GRID_LOCALE_TEXT,
) => {
  const globalFilterText = context.globalFilterText.trim();
  const columnFilterCount = countActiveColumnFilters(context.columnFilterValues);
  const parts: string[] = [];
  if (globalFilterText.length > 0) {
    parts.push(formatLocaleText(texts.filterGlobal, { text: truncateSummaryText(globalFilterText) }));
  }
  if (columnFilterCount > 0) {
    parts.push(formatLocaleText(texts.filterColumns, { count: columnFilterCount }));
  }
  return formatLocaleText(texts.filterSummary, { value: parts.length > 0 ? parts.join(' + ') : texts.none });
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
  texts: ResolvedGridLocaleText = DEFAULT_GRID_LOCALE_TEXT,
) => {
  // 変更(MS-1): 配列を優先順位順に「列名(方向)」で連結します。
  const value =
    context.sortState.length === 0
      ? texts.none
      : context.sortState
          .map((entry) =>
            formatLocaleText(texts.sortEntry, {
              column: getColumnLabelByKey(context.columns, entry.columnKey),
              direction: entry.direction === 'asc' ? texts.sortAscending : texts.sortDescending,
            }),
          )
          .join(texts.listSeparator);
  return formatLocaleText(texts.sortSummary, { value });
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
  // 追加(段階 2 DU-18): 文言(未指定は既定の日本語)。
  texts: ResolvedGridLocaleText = DEFAULT_GRID_LOCALE_TEXT,
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
    rowSummaryText: formatGridRowSummary(context, filteredRowCount, totalRowCount, texts),
    columnSummaryText: formatGridColumnSummary(context, texts),
    filterSummaryText: formatGridFilterSummary(context, texts),
    sortSummaryText: formatGridSortSummary(context, texts),
    activeCellLabel: formatGridCellLabel(context.activeCell, toColumnName, rowNumberer, texts),
    selectionLabel: formatGridSelectionLabel(context.selection, toColumnName, rowNumberer, texts),
    selectionStatsText: formatGridSelectionStatsLabel(context, filteredRowCount, rowNumberer, texts),
    selectedColumnsText: formatLocaleText(texts.selectedColumns, { count: selectionStats.selectedColumnCount }),
    selectionStats,
    hasGlobalFilter,
    globalFilterPreview,
    activeColumnFilterCount,
    hasAnyFilter,
    hasSorting,
    sortedColumnLabel,
  };
};