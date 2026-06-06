import { useCallback, type Dispatch, type RefObject } from 'react';
import { gridActions, type GridUiAction } from '../model/gridActions';
import type { CellCoord, GridColumn, GridUiState } from '../model/gridTypes';
import type { EditorCommitDirection } from '../CellEditorLayer';
import { setCellValue } from '../utils/permissions';

type UseGridEditControllerArgs<T extends object> = {
  uiState: GridUiState;
  rows: T[];
  visibleColumns: GridColumn<T>[];
  filteredRowSourceIndexes: number[];
  editorValue: string;
  setEditorValue: (value: string) => void;
  onRowsChange?: (nextRows: T[]) => void;
  dispatch: Dispatch<GridUiAction>;
  getMovedCell: (baseCell: CellCoord, deltaRow: number, deltaCol: number) => CellCoord;
  gridRootRef: RefObject<HTMLDivElement | null>;
  editorActionGuardRef: RefObject<boolean>;
};

// 追加: edit 確定 / cancel / active cell 復帰をまとめる controller です。
export const useGridEditController = <T extends object>({
  uiState,
  rows,
  visibleColumns,
  filteredRowSourceIndexes,
  editorValue,
  setEditorValue,
  onRowsChange,
  dispatch,
  getMovedCell,
  gridRootRef,
  editorActionGuardRef,
}: UseGridEditControllerArgs<T>) => {
  // 追加: 単一セルを active + selection へ反映するユーティリティです。
  const activateSingleCell = useCallback(
    (cell: CellCoord) => {
      dispatch(gridActions.startSelection(cell));
      dispatch(gridActions.endSelection());
      dispatch(gridActions.activateCell(cell));
    },
    [dispatch],
  );

  // 追加: 編集開始時に editorValue を初期化する helper です。
  const startEditWithValue = useCallback(
    (cell: CellCoord, initialValue: string) => {
      setEditorValue(initialValue);
      dispatch(gridActions.startEdit(cell));
    },
    [dispatch, setEditorValue],
  );

  // 追加: 編集確定です。editorValue を rows へ反映し、必要なら次セルへ移動します。
  const commitEdit = useCallback(
    (direction?: EditorCommitDirection) => {
      if (editorActionGuardRef.current || !uiState.editingCell) {
        return;
      }

      const editingCell = uiState.editingCell;
      const nextCell =
        direction === 'down'
          ? getMovedCell(editingCell, 1, 0)
          : direction === 'right'
            ? getMovedCell(editingCell, 0, 1)
            : direction === 'left'
              ? getMovedCell(editingCell, 0, -1)
              : editingCell;

      const column = visibleColumns[editingCell.col];
      const originalRowIndex =
        filteredRowSourceIndexes[editingCell.row] ?? editingCell.row;
      const row = rows[originalRowIndex];
      if (!column || !row) {
        dispatch(gridActions.stopEdit());
        return;
      }

      if (onRowsChange) {
        const parsedValue = column.parseClipboardValue
          ? column.parseClipboardValue(editorValue, row)
          : editorValue;
        const nextRows = rows.map((currentRow, index) =>
          index === originalRowIndex
            ? setCellValue(currentRow, column, parsedValue)
            : currentRow,
        );
        onRowsChange(nextRows);
      }

      editorActionGuardRef.current = true;
      requestAnimationFrame(() => {
        gridRootRef.current?.focus();
        activateSingleCell(nextCell);
        editorActionGuardRef.current = false;
      });

      dispatch(gridActions.stopEdit());
    },
    [
      activateSingleCell,
      dispatch,
      editorActionGuardRef,
      editorValue,
      filteredRowSourceIndexes,
      getMovedCell,
      gridRootRef,
      onRowsChange,
      rows,
      uiState.editingCell,
      visibleColumns,
    ],
  );

  // 追加: 編集キャンセルです。editor を閉じるだけです。
  const cancelEdit = useCallback(() => {
    if (editorActionGuardRef.current) {
      return;
    }

    editorActionGuardRef.current = true;
    dispatch(gridActions.stopEdit());

    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
      editorActionGuardRef.current = false;
    });
  }, [dispatch, editorActionGuardRef, gridRootRef]);

  return {
    activateSingleCell,
    startEditWithValue,
    commitEdit,
    cancelEdit,
  };
};

export default useGridEditController;
