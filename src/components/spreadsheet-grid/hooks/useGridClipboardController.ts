import { useCallback, type Dispatch } from 'react';
import { gridActions, type GridUiAction } from '../model/gridActions';
import type {
  GridColumn,
  SpreadsheetGridProps,
  GridUiState,
  RowModel,
} from '../model/gridTypes';
import { clamp } from '../logic/geometry';
import { getCellValue, isCellEditable } from '../utils/permissions';
import {
  applyClipboardMatrixToRows,
  parseClipboardText,
  serializeSelectionToTsv,
} from '../utils/clipboard';

type UseGridClipboardControllerArgs<T extends object> = {
  rows: T[];
  // 変更(DS-3-3): filteredRows / filteredRowSourceIndexes 配列 → rowModel シームへ集約。
  //   copy 時のセル値取得は getRow(i)、paste 書き込みの source 解決は getSourceIndex(i)、
  //   範囲判定の行数は getRowCount() を使い分けます。順序契約は order と同一(viewIndex 空間)。
  rowModel: RowModel<T>;
  visibleColumns: GridColumn<T>[];
  uiState: GridUiState;
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  createRow?: () => T;
  createOverflowColumn?: (columnIndex: number) => GridColumn<T>;
  onRowsChange?: (nextRows: T[]) => void;
  onColumnsChange?: (nextColumns: GridColumn<T>[]) => void;
  dispatch: Dispatch<GridUiAction>;
};

// 追加: copy / paste と行列自動拡張をまとめる clipboard controller です。
export const useGridClipboardController = <T extends object>({
  rows,
  rowModel,
  visibleColumns,
  uiState,
  readOnly,
  canEditCell,
  createRow,
  createOverflowColumn,
  onRowsChange,
  onColumnsChange,
  dispatch,
}: UseGridClipboardControllerArgs<T>) => {
  // 追加: 現在の selection が「表全体選択」かどうかを判定します。
  // 変更(DS-3-3): filteredRows.length → rowModel.getRowCount()。
  const viewRowCount = rowModel.getRowCount();
  const isWholeGridSelected =
    viewRowCount > 0 &&
    visibleColumns.length > 0 &&
    uiState.selection?.type === 'cell' &&
    (() => {
      const start = uiState.selection.range.start;
      const end = uiState.selection.range.end;
      const startRow = Math.min(start.row, end.row);
      const startCol = Math.min(start.col, end.col);
      const endRow = Math.max(start.row, end.row);
      const endCol = Math.max(start.col, end.col);
      return (
        startRow === 0 &&
        startCol === 0 &&
        endRow === viewRowCount - 1 &&
        endCol === visibleColumns.length - 1
      );
    })();

  // 追加: 全体選択時の copy を専用経路で行います。
  // 変更(DS-3-3): filteredRows.map → getRowCount()/getRow(i) のビュー順走査へ置換。
  const serializeWholeGridToTsv = useCallback(() => {
    const rowCount = rowModel.getRowCount();
    if (rowCount === 0 || visibleColumns.length === 0) {
      return '';
    }

    const lines: string[] = [];
    for (let viewIndex = 0; viewIndex < rowCount; viewIndex += 1) {
      const row = rowModel.getRow(viewIndex);
      const cells = visibleColumns.map((column) => {
        const rawValue = getCellValue(row, column);
        return column.formatClipboardValue
          ? column.formatClipboardValue(rawValue, row)
          : String(rawValue ?? '');
      });
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  }, [rowModel, visibleColumns]);

  // 追加: copy 処理です。selection を TSV にしてクリップボードへ書き込みます。
  const handleCopy = useCallback(async () => {
    // 変更(DS-3-3): serializeSelectionToTsv は行を view index で引くため、
    //   getRow(i) でビュー順の行配列を一時 materialize して渡します(copy は稀操作)。
    //   旧 filteredRows[i] と参照値一致(getRow(i) = rows[order[i]] = filteredRows[i])。
    const text = isWholeGridSelected
      ? serializeWholeGridToTsv()
      : serializeSelectionToTsv(
          Array.from({ length: rowModel.getRowCount() }, (_, viewIndex) =>
            rowModel.getRow(viewIndex),
          ),
          visibleColumns,
          uiState.selection as
            | {
                type: 'cell';
                range: {
                  start: { row: number; col: number };
                  end: { row: number; col: number };
                };
              }
            | { type: 'row'; startRow: number; endRow: number }
            | { type: 'col'; startCol: number; endCol: number }
            | null,
        );

    if (!text) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  }, [
    isWholeGridSelected,
    rowModel,
    serializeWholeGridToTsv,
    uiState.selection,
    visibleColumns,
  ]);

  // 追加: paste 処理です。TSV を activeCell 起点に適用し、必要なら行/列を自動拡張します。
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (!onRowsChange || !uiState.activeCell) {
        return;
      }

      const text = event.clipboardData.getData('text/plain');
      if (!text) {
        return;
      }

      event.preventDefault();

      const matrix = parseClipboardText(text);
      if (matrix.length === 0) {
        return;
      }

      const startFilteredRowIndex = uiState.activeCell.row;
      // 変更(DS-3-9): レガシーの ?? startFilteredRowIndex フォールバックを撤去します。
      //   getSourceIndex(=order[i]) は OOB(activeCell が縮小後の order を超える)で undefined を
      //   返します。旧版は ?? で view index を source index に誤代入していました。撤去後は
      //   undefined をそのまま判定し、OOB の paste 起点は no-op で抜けます(下流の startOriginalRowIndex +
      //   matrix.length が NaN になるのを防ぎ、誤行 append も回避)。in-bounds 時は従来と完全一致。
      const startOriginalRowIndex =
        rowModel.getSourceIndex(startFilteredRowIndex);
      if (startOriginalRowIndex === undefined) {
        return;
      }
      const startColIndex = uiState.activeCell.col;

      let workingRows = [...rows];
      let workingColumns = [...visibleColumns];
      // 変更(DS-3-3): [...filteredRowSourceIndexes] → getSourceIndex(i) のビュー順 materialize。
      //   値は order と同一(getSourceIndex(i) = order[i])。以降の append は従来どおり末尾追加。
      const viewRowCountForPaste = rowModel.getRowCount();
      let workingSourceIndexes = Array.from(
        { length: viewRowCountForPaste },
        (_, viewIndex) => rowModel.getSourceIndex(viewIndex),
      );

      // 追加: 行不足分を createRow で自動追加します。
      const requiredOriginalRowCount = startOriginalRowIndex + matrix.length;
      if (requiredOriginalRowCount > workingRows.length && createRow) {
        while (workingRows.length < requiredOriginalRowCount) {
          workingRows.push(createRow());
          workingSourceIndexes.push(workingRows.length - 1);
        }
      }

      // 追加: 列不足分を createOverflowColumn で自動追加します。
      const maxPasteWidth = matrix.reduce(
        (max, currentRow) => Math.max(max, currentRow.length),
        0,
      );
      if (maxPasteWidth === 0) {
        return;
      }

      const requiredColumnCount = startColIndex + maxPasteWidth;
      if (requiredColumnCount > workingColumns.length) {
        if (onColumnsChange && createOverflowColumn) {
          while (workingColumns.length < requiredColumnCount) {
            workingColumns.push(createOverflowColumn(workingColumns.length));
          }
          onColumnsChange(workingColumns);
        }
      }

      const nextRows = applyClipboardMatrixToRows(
        workingRows,
        workingSourceIndexes,
        workingColumns,
        matrix,
        startFilteredRowIndex,
        startColIndex,
        (originalRowIndex, colIndex, row, column) =>
          isCellEditable(
            { readOnly, canEditCell },
            originalRowIndex,
            colIndex,
            row,
            column,
          ),
      );

      const endRow = clamp(
        uiState.activeCell.row + Math.max(matrix.length - 1, 0),
        0,
        Math.max(
          // 変更(DS-3-3): filteredRows.length - 1 → getRowCount() - 1。
          Math.max(rowModel.getRowCount() - 1, 0),
          startFilteredRowIndex + matrix.length - 1,
        ),
      );
      const endCol = clamp(
        uiState.activeCell.col + Math.max((matrix[0]?.length ?? 1) - 1, 0),
        0,
        Math.max(
          Math.max(workingColumns.length - 1, 0),
          startColIndex + maxPasteWidth - 1,
        ),
      );

      onRowsChange(nextRows);
      dispatch(gridActions.startSelection(uiState.activeCell));
      dispatch(gridActions.updateSelection({ row: endRow, col: endCol }));
      dispatch(gridActions.endSelection());
      dispatch(gridActions.activateCell(uiState.activeCell));
    },
    [
      canEditCell,
      createOverflowColumn,
      createRow,
      dispatch,
      onColumnsChange,
      onRowsChange,
      readOnly,
      rowModel,
      rows,
      uiState.activeCell,
      visibleColumns,
    ],
  );

  return {
    isWholeGridSelected,
    handleCopy,
    handlePaste,
  };
};

export default useGridClipboardController;