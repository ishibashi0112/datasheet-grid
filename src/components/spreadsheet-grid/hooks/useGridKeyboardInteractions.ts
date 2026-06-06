import { useCallback, type Dispatch, type KeyboardEvent } from 'react';
import { gridActions, type GridUiAction } from '../model/gridActions';
import type {
  CellCoord,
  GridColumn,
  GridUiState,
  SpreadsheetGridProps,
} from '../model/gridTypes';
import { clamp } from '../logic/geometry';
import { isPrintableKey, shouldIgnoreGridKeydown } from '../logic/domGuards';
import { isCellEditable } from '../utils/permissions';

type UseGridKeyboardInteractionsArgs<T> = {
  uiState: GridUiState;
  filteredRows: T[];
  visibleColumns: GridColumn<T>[];
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  setEditorValue: (value: string) => void;
  dispatch: Dispatch<GridUiAction>;
  handleCopy: () => Promise<void>;
  handleCellDoubleClick: (cell: CellCoord) => void;
  isWholeGridSelected: boolean;
  selectEntireGrid: () => void;
};

// 追加: keyboard interaction（arrow/tab/enter/copy/select-all/edit start）をまとめます。
export const useGridKeyboardInteractions = <T,>({
  uiState,
  filteredRows,
  visibleColumns,
  readOnly,
  canEditCell,
  setEditorValue,
  dispatch,
  handleCopy,
  handleCellDoubleClick,
  isWholeGridSelected,
  selectEntireGrid,
}: UseGridKeyboardInteractionsArgs<T>) => {
  // 追加: 基準セルから移動先セルを計算します。
  const getMovedCell = useCallback(
    (baseCell: CellCoord, deltaRow: number, deltaCol: number): CellCoord => ({
      row: clamp(
        baseCell.row + deltaRow,
        0,
        Math.max(filteredRows.length - 1, 0),
      ),
      col: clamp(
        baseCell.col + deltaCol,
        0,
        Math.max(visibleColumns.length - 1, 0),
      ),
    }),
    [filteredRows.length, visibleColumns.length],
  );

  // 追加: active cell を移動します。shiftKey=true の場合は cell selection を拡張します。
  const moveActiveCell = useCallback(
    (deltaRow: number, deltaCol: number, extendSelection: boolean) => {
      if (filteredRows.length === 0 || visibleColumns.length === 0) {
        return;
      }
      const currentCell = uiState.activeCell ?? { row: 0, col: 0 };
      const nextCell = {
        row: clamp(currentCell.row + deltaRow, 0, filteredRows.length - 1),
        col: clamp(currentCell.col + deltaCol, 0, visibleColumns.length - 1),
      };
      if (extendSelection) {
        const anchor =
          uiState.selection?.type === 'cell'
            ? uiState.selection.range.start
            : currentCell;
        dispatch(gridActions.startSelection(anchor));
        dispatch(gridActions.updateSelection(nextCell));
        dispatch(gridActions.endSelection());
        dispatch(gridActions.activateCell(nextCell));
        return;
      }
      dispatch(gridActions.startSelection(nextCell));
      dispatch(gridActions.endSelection());
      dispatch(gridActions.activateCell(nextCell));
    },
    [
      dispatch,
      filteredRows.length,
      uiState.activeCell,
      uiState.selection,
      visibleColumns.length,
    ],
  );

  // 追加: Ctrl/Cmd + C や Arrow/Enter を捕捉します。
  const handleKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLDivElement>) => {
      // 追加: filter input / select / button 等にフォーカス中は、
      //       grid 側の keyboard 操作を無効化します。
      if (shouldIgnoreGridKeydown(event.target)) {
        return;
      }

      if (uiState.editingCell) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        await handleCopy();
        return;
      }

      // 追加: Ctrl + A / Cmd + A で全体選択、2回目で解除します。
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        if (isWholeGridSelected) {
          dispatch(gridActions.clearSelection());
          dispatch(gridActions.activateCell(null));
          return;
        }
        selectEntireGrid();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveActiveCell(-1, 0, event.shiftKey);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveActiveCell(1, 0, event.shiftKey);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveActiveCell(0, -1, event.shiftKey);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveActiveCell(0, 1, event.shiftKey);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        moveActiveCell(0, event.shiftKey ? -1 : 1, false);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        dispatch(gridActions.clearSelection());
        return;
      }
      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        if (uiState.activeCell) {
          handleCellDoubleClick(uiState.activeCell);
        }
        return;
      }
      if (isPrintableKey(event) && uiState.activeCell) {
        const row = filteredRows[uiState.activeCell.row];
        const column = visibleColumns[uiState.activeCell.col];
        if (!row || !column) {
          return;
        }
        if (
          !isCellEditable(
            { readOnly, canEditCell },
            uiState.activeCell.row,
            uiState.activeCell.col,
            row,
            column,
          )
        ) {
          return;
        }
        event.preventDefault();
        setEditorValue(event.key);
        dispatch(gridActions.startEdit(uiState.activeCell));
      }
    },
    [
      canEditCell,
      dispatch,
      filteredRows,
      handleCellDoubleClick,
      handleCopy,
      isWholeGridSelected,
      moveActiveCell,
      readOnly,
      selectEntireGrid,
      setEditorValue,
      uiState.activeCell,
      uiState.editingCell,
      visibleColumns,
    ],
  );

  return {
    getMovedCell,
    handleKeyDown,
  };
};

export default useGridKeyboardInteractions;
