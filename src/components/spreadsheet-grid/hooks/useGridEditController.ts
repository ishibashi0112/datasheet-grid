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
  // 変更(11-B6): editorValue / setEditorValue(ドラフト state)は廃止しました。
  //              ドラフトは CellEditorLayer のローカル state へ移動し、
  //              親は「編集開始時の初期値」を設定する setter だけを持ちます。
  setEditorInitialValue: (value: string) => void;
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
  setEditorInitialValue,
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

  // 追加: 編集開始時に editor の初期値を設定する helper です。
  // 変更(11-B6): 設定先はドラフト state ではなく「初期値 state」になりました。
  //   setEditorInitialValue + startEdit は同一イベントハンドラ内で React が自動バッチ
  //   するため、編集開始時の親レンダーは従来どおり 1 回です。
  const startEditWithValue = useCallback(
    (cell: CellCoord, initialValue: string) => {
      setEditorInitialValue(initialValue);
      dispatch(gridActions.startEdit(cell));
    },
    [dispatch, setEditorInitialValue],
  );

  // 追加: 編集確定です。確定値を rows へ反映し、必要なら次セルへ移動します。
  // 変更(11-B6): (direction?) → (committedValue, direction?) に変更。
  //   ドラフト値を閉包(editorValue 依存)で読むのをやめ、CellEditorLayer から
  //   最終値を引数で受け取ります。これにより本ハンドラの参照は編集中のタイピングで
  //   変化しなくなります（旧実装は毎キーストロークで editorValue 依存が更新され、
  //   commitEdit → CellEditorLayer props の参照も毎回変わっていました）。
  const commitEdit = useCallback(
    (committedValue: string, direction?: EditorCommitDirection) => {
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
          ? column.parseClipboardValue(committedValue, row)
          : committedValue;
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
