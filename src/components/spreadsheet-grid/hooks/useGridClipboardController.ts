import { useCallback, type Dispatch } from 'react';
import { gridActions, type GridUiAction } from '../model/gridActions';
import type {
  GridColumn,
  SpreadsheetGridProps,
  GridUiState,
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
  filteredRows: T[];
  filteredRowSourceIndexes: number[];
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
  filteredRows,
  filteredRowSourceIndexes,
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
  const isWholeGridSelected =
    filteredRows.length > 0 &&
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
        endRow === filteredRows.length - 1 &&
        endCol === visibleColumns.length - 1
      );
    })();

  // 追加: 全体選択時の copy を専用経路で行います。
  const serializeWholeGridToTsv = useCallback(() => {
    if (filteredRows.length === 0 || visibleColumns.length === 0) {
      return '';
    }

    return filteredRows
      .map((row) =>
        visibleColumns
          .map((column) => {
            const rawValue = getCellValue(row, column);
            return column.formatClipboardValue
              ? column.formatClipboardValue(rawValue, row)
              : String(rawValue ?? '');
          })
          .join('\t'),
      )
      .join('\n');
  }, [filteredRows, visibleColumns]);

  // 追加: copy 処理です。selection を TSV にしてクリップボードへ書き込みます。
  const handleCopy = useCallback(async () => {
    const text = isWholeGridSelected
      ? serializeWholeGridToTsv()
      : serializeSelectionToTsv(
          filteredRows,
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
    filteredRows,
    isWholeGridSelected,
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
      const startOriginalRowIndex =
        filteredRowSourceIndexes[startFilteredRowIndex] ?? startFilteredRowIndex;
      const startColIndex = uiState.activeCell.col;

      let workingRows = [...rows];
      let workingColumns = [...visibleColumns];
      let workingSourceIndexes = [...filteredRowSourceIndexes];

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
          Math.max(filteredRows.length - 1, 0),
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
      filteredRowSourceIndexes,
      filteredRows.length,
      onColumnsChange,
      onRowsChange,
      readOnly,
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
