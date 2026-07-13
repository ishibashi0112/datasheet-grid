import { useCallback, type Dispatch, type KeyboardEvent } from 'react';
import { gridActions, type GridUiAction } from '../model/gridActions';
import type {
  CellCoord,
  GridColumn,
  GridUiState,
  RowModel,
  SpreadsheetGridProps,
} from '../model/gridTypes';
import { clamp } from '../logic/geometry';
import { isPrintableKey, shouldIgnoreGridKeydown } from '../logic/domGuards';
import { isCellEditable } from '../utils/permissions';

type UseGridKeyboardInteractionsArgs<T> = {
  uiState: GridUiState;
  // 変更(DS-3-1): filteredRows: T[] を RowModel シームへ置換しました(DS-3-0 の seam を消費)。
  //   length は getRowCount()、行取得は getRow(viewIndex) 経由に切り替えます。
  rowModel: RowModel<T>;
  visibleColumns: GridColumn<T>[];
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  // 変更(11-B6): ドラフト state の setter → 「編集開始時の初期値」setter になりました。
  //   文字キー直打ちの編集開始では、押下キー 1 文字を初期値として渡します
  //   （以後のタイピングは CellEditorLayer ローカル state が受け持ちます）。
  setEditorInitialValue: (value: string) => void;
  dispatch: Dispatch<GridUiAction>;
  handleCopy: () => Promise<void>;
  handleCellDoubleClick: (cell: CellCoord) => void;
  isWholeGridSelected: boolean;
  selectEntireGrid: () => void;
  // 追加(undo/redo): Ctrl/Cmd+Z / Shift+Z / Y で呼ぶ履歴操作です。無効条件(readOnly / serverSide /
  //   履歴なし)は history controller 側で吸収するため、ここでは常に呼び出します。
  onUndo: () => void;
  onRedo: () => void;
};

// 追加: keyboard interaction（arrow/tab/enter/copy/select-all/edit start）をまとめます。
export const useGridKeyboardInteractions = <T,>({
  uiState,
  rowModel,
  visibleColumns,
  readOnly,
  canEditCell,
  setEditorInitialValue,
  dispatch,
  handleCopy,
  handleCellDoubleClick,
  isWholeGridSelected,
  selectEntireGrid,
  onUndo,
  onRedo,
}: UseGridKeyboardInteractionsArgs<T>) => {
  // 追加(DS-3-1): 行数はシーム経由で取得します(= order.length / 旧 filteredRows.length と等価)。
  //   各 useCallback の deps はこのプリミティブ rowCount を使い、rowModel オブジェクト参照を
  //   deps に入れないことで、件数不変のソートで handler identity が変わらない 11系のメモ化を保ちます。
  const rowCount = rowModel.getRowCount();

  // 追加: 基準セルから移動先セルを計算します。
  const getMovedCell = useCallback(
    (baseCell: CellCoord, deltaRow: number, deltaCol: number): CellCoord => ({
      row: clamp(
        baseCell.row + deltaRow,
        0,
        Math.max(rowCount - 1, 0),
      ),
      col: clamp(
        baseCell.col + deltaCol,
        0,
        Math.max(visibleColumns.length - 1, 0),
      ),
    }),
    [rowCount, visibleColumns.length],
  );

  // 追加: active cell を移動します。shiftKey=true の場合は cell selection を拡張します。
  const moveActiveCell = useCallback(
    (deltaRow: number, deltaCol: number, extendSelection: boolean) => {
      if (rowCount === 0 || visibleColumns.length === 0) {
        return;
      }
      const currentCell = uiState.activeCell ?? { row: 0, col: 0 };
      const nextCell = {
        row: clamp(currentCell.row + deltaRow, 0, rowCount - 1),
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
      rowCount,
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

      // 追加(undo/redo): Ctrl/Cmd + Z = undo、Ctrl/Cmd + Shift + Z / Ctrl/Cmd + Y = redo です。
      //   編集中(editingCell)は上の早期 return で到達せず、エディタ input のネイティブ undo に
      //   委譲されます。IME 変換中(isComposing)は変換取り消し操作と衝突するため発火しません。
      if ((event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
        if (event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) {
            onRedo();
          } else {
            onUndo();
          }
          return;
        }
        if (event.key.toLowerCase() === 'y' && !event.shiftKey) {
          event.preventDefault();
          onRedo();
          return;
        }
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
        const row = rowModel.getRow(uiState.activeCell.row);
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
        setEditorInitialValue(event.key);
        dispatch(gridActions.startEdit(uiState.activeCell));
      }
    },
    [
      canEditCell,
      dispatch,
      rowModel,
      handleCellDoubleClick,
      handleCopy,
      isWholeGridSelected,
      moveActiveCell,
      onRedo,
      onUndo,
      readOnly,
      selectEntireGrid,
      setEditorInitialValue,
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