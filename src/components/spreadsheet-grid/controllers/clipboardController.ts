// 追加(非依存化 ③-8): コピー / ペーストのコントローラです(React 非依存。旧 hooks/useGridClipboardController の
//   本体を移設)。
//   - computeIsWholeGridSelected は純関数で、レンダー中に読む値(ヘッダーの全選択表示等)のため
//     アダプタが毎レンダー計算します(コントローラの update を待たない)。
//   - handleCopy / handlePaste はイベント時に最新 args を読みます(hooks/useController の update 前提)。
//     ペーストのイベントは構造的型 ClipboardEventLike で受け、React 合成イベント / ネイティブの両方に
//     対応します。
//   - 書き込み経路は clientSide(rows / columns の拡張を含む)と serverSide(applyServerSideCellEdits)。
import { gridActions, type GridUiAction } from '../model/gridActions';
import type {
  GridColumn,
  GridSelection,
  GridUiState,
  RowModel,
  SpreadsheetGridProps,
} from '../model/gridTypes';
import { clamp } from '../logic/geometry';
import { getCellValue, isCellEditable } from '../utils/permissions';
import {
  applyClipboardMatrixToRows,
  buildClipboardCellEdits,
  parseClipboardText,
  serializeSelectionToTsv,
  writeTextToClipboard,
} from '../utils/clipboard';
import type { ServerSideCellEditInput } from '../logic/serverSideEdits';

export type ClipboardEventLike = {
  clipboardData: { getData: (type: string) => string } | null;
  preventDefault: () => void;
};

export type ClipboardControllerArgs<T extends object> = {
  rows: T[];
  rowModel: RowModel<T>;
  visibleColumns: GridColumn<T>[];
  uiState: GridUiState;
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  createRow?: () => T;
  createOverflowColumn?: (columnIndex: number) => GridColumn<T>;
  onRowsChange?: (nextRows: T[]) => void;
  onColumnsChange?: (nextColumns: GridColumn<T>[]) => void;
  applyServerSideCellEdits?: (edits: ServerSideCellEditInput<T>[]) => number;
  isRowExportable?: SpreadsheetGridProps<T>['isRowExportable'];
  dispatch: (action: GridUiAction) => void;
};

export type ClipboardController<T extends object> = {
  update: (args: ClipboardControllerArgs<T>) => void;
  handleCopy: () => Promise<void>;
  handlePaste: (event: ClipboardEventLike) => void;
};

// セル範囲選択が「グリッド全体」を覆っているか(行 0..last × 列 0..last)。
export const computeIsWholeGridSelected = (
  selection: GridSelection,
  viewRowCount: number,
  columnCount: number,
): boolean => {
  if (viewRowCount === 0 || columnCount === 0 || selection?.type !== 'cell') {
    return false;
  }
  const { start, end } = selection.range;
  const startRow = Math.min(start.row, end.row);
  const startCol = Math.min(start.col, end.col);
  const endRow = Math.max(start.row, end.row);
  const endCol = Math.max(start.col, end.col);
  return (
    startRow === 0 &&
    startCol === 0 &&
    endRow === viewRowCount - 1 &&
    endCol === columnCount - 1
  );
};

export const createClipboardController = <T extends object>(): ClipboardController<T> => {
  let args: ClipboardControllerArgs<T> | null = null;

  const update = (next: ClipboardControllerArgs<T>) => {
    args = next;
  };

  // isRowExportable の行フィルタ(コピー / エクスポート対象行の判定)。
  const rowIncludedFilter = (
    current: ClipboardControllerArgs<T>,
  ): ((row: T, viewRowIndex: number) => boolean) | undefined => {
    const { isRowExportable, rowModel } = current;
    if (!isRowExportable) {
      return undefined;
    }
    return (row, viewRowIndex) =>
      isRowExportable(row, {
        viewRowIndex,
        rowKey: rowModel.getRowKey(viewRowIndex) ?? viewRowIndex,
      });
  };

  const serializeWholeGridToTsv = (current: ClipboardControllerArgs<T>): string => {
    const { rowModel, visibleColumns } = current;
    const rowCount = rowModel.getRowCount();
    if (rowCount === 0 || visibleColumns.length === 0) {
      return '';
    }
    const isRowIncluded = rowIncludedFilter(current);
    const lines: string[] = [];
    for (let viewIndex = 0; viewIndex < rowCount; viewIndex += 1) {
      const row = rowModel.getRow(viewIndex);
      if (!row) {
        continue;
      }
      if (isRowIncluded && !isRowIncluded(row, viewIndex)) {
        continue;
      }
      const cells = visibleColumns.map((column) => {
        const rawValue = getCellValue(row, column);
        return column.formatClipboardValue
          ? column.formatClipboardValue(rawValue, row)
          : String(rawValue ?? '');
      });
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  };

  const handleCopy = async () => {
    if (args === null) {
      return;
    }
    const current = args;
    const { rowModel, visibleColumns, uiState } = current;
    const wholeGrid = computeIsWholeGridSelected(
      uiState.selection,
      rowModel.getRowCount(),
      visibleColumns.length,
    );
    const text = wholeGrid
      ? serializeWholeGridToTsv(current)
      : serializeSelectionToTsv(
          rowModel.getRow,
          rowModel.getRowCount(),
          visibleColumns,
          uiState.selection,
          rowIncludedFilter(current),
        );
    if (!text) {
      return;
    }
    await writeTextToClipboard(text);
  };

  const handlePaste = (event: ClipboardEventLike) => {
    if (args === null) {
      return;
    }
    const {
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
      applyServerSideCellEdits,
      dispatch,
    } = args;
    if (
      readOnly ||
      (!onRowsChange && !applyServerSideCellEdits) ||
      !uiState.activeCell
    ) {
      return;
    }

    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!text) {
      return;
    }

    event.preventDefault();

    const matrix = parseClipboardText(text);
    if (matrix.length === 0) {
      return;
    }

    const maxPasteWidth = matrix.reduce(
      (max, currentRow) => Math.max(max, currentRow.length),
      0,
    );
    if (maxPasteWidth === 0) {
      return;
    }

    const startFilteredRowIndex = uiState.activeCell.row;
    const startColIndexForEdits = uiState.activeCell.col;

    if (applyServerSideCellEdits) {
      const edits = buildClipboardCellEdits(
        (viewIndex) => rowModel.getRow(viewIndex),
        visibleColumns,
        matrix,
        startFilteredRowIndex,
        startColIndexForEdits,
        (viewIndex, colIndex, row, column) =>
          isCellEditable({ readOnly, canEditCell }, viewIndex, colIndex, row, column),
      );
      if (edits.length > 0) {
        applyServerSideCellEdits(edits);
      }
      const serverSideEndRow = clamp(
        uiState.activeCell.row + Math.max(matrix.length - 1, 0),
        0,
        Math.max(rowModel.getRowCount() - 1, 0),
      );
      const serverSideEndCol = clamp(
        uiState.activeCell.col + Math.max(maxPasteWidth - 1, 0),
        0,
        Math.max(visibleColumns.length - 1, 0),
      );
      dispatch(gridActions.startSelection(uiState.activeCell));
      dispatch(
        gridActions.updateSelection({ row: serverSideEndRow, col: serverSideEndCol }),
      );
      dispatch(gridActions.endSelection());
      dispatch(gridActions.activateCell(uiState.activeCell));
      return;
    }
    if (!onRowsChange) {
      return;
    }

    const startOriginalRowIndex = rowModel.getSourceIndex(startFilteredRowIndex);
    if (startOriginalRowIndex === undefined) {
      return;
    }
    const startColIndex = uiState.activeCell.col;

    const workingRows = [...rows];
    const workingColumns = [...visibleColumns];
    const viewRowCountForPaste = rowModel.getRowCount();
    const appendBaseSource = workingRows.length;
    // view index → source index(ペーストで行が増える分は末尾へ追記した source index を割り当て)。
    const resolveSourceIndex = (viewIndex: number): number | undefined =>
      viewIndex < viewRowCountForPaste
        ? rowModel.getSourceIndex(viewIndex)
        : appendBaseSource + (viewIndex - viewRowCountForPaste);

    const requiredOriginalRowCount = startOriginalRowIndex + matrix.length;
    if (requiredOriginalRowCount > workingRows.length && createRow) {
      while (workingRows.length < requiredOriginalRowCount) {
        workingRows.push(createRow());
      }
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
      resolveSourceIndex,
      workingColumns,
      matrix,
      startFilteredRowIndex,
      startColIndex,
      (originalRowIndex, colIndex, row, column) =>
        isCellEditable({ readOnly, canEditCell }, originalRowIndex, colIndex, row, column),
    );

    const endRow = clamp(
      uiState.activeCell.row + Math.max(matrix.length - 1, 0),
      0,
      Math.max(
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
  };

  return { update, handleCopy, handlePaste };
};