// 追加(非依存化 ③-7): グリッドのキーボード操作(キー → アクション / コールバックの写像)のコントローラです
//   (React 非依存。旧 hooks/useGridKeyboardInteractions の本体を移設)。
//   - イベントは構造的型(GridKeyboardEventLike)で受けます。React アダプタは合成イベントから
//     key / 修飾キー / nativeEvent.isComposing / target / preventDefault を詰め替え、Solid 版はネイティブ
//     KeyboardEvent をほぼそのまま渡せます。
//   - update(args) はレンダー後に毎回呼ばれる前提(hooks/useController)。handleKeyDown はイベント時点の
//     最新 args(uiState / rowModel / 列 / コールバック)を読みます。
import { gridActions, type GridUiAction } from '../model/gridActions';
import type {
  CellCoord,
  GridColumn,
  GridUiState,
  RowModel,
  SpreadsheetGridProps,
} from '../model/gridTypes.unbound';
import { clamp } from '../logic/geometry';
import { isPrintableKey, shouldIgnoreGridKeydown } from '../logic/domGuards';
import { isCellEditable } from '../utils/permissions';

export type GridKeyboardEventLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  // IME 変換中(nativeEvent.isComposing)。変換中の Ctrl+Z / Y は無視します。
  isComposing: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
};

export type KeyboardControllerArgs<T> = {
  uiState: GridUiState;
  rowModel: RowModel<T>;
  visibleColumns: GridColumn<T>[];
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  setEditorInitialValue: (value: string) => void;
  dispatch: (action: GridUiAction) => void;
  handleCopy: () => Promise<void>;
  handleCellDoubleClick: (cell: CellCoord) => void;
  isWholeGridSelected: boolean;
  selectEntireGrid: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearSelection: () => void;
  enableClearOnDelete: boolean;
  onToggleCheckboxCell: (cell: CellCoord) => void;
  onToggleGroup: (groupKey: string) => void;
};

export type KeyboardController<T> = {
  update: (args: KeyboardControllerArgs<T>) => void;
  handleKeyDown: (event: GridKeyboardEventLike) => Promise<void>;
};

export const createKeyboardController = <T,>(): KeyboardController<T> => {
  let args: KeyboardControllerArgs<T> | null = null;

  const update = (next: KeyboardControllerArgs<T>) => {
    args = next;
  };

  // active cell の移動(Shift で範囲拡張)。行 / 列とも端で clamp します。
  const moveActiveCell = (
    deltaRow: number,
    deltaCol: number,
    extendSelection: boolean,
  ) => {
    if (args === null) {
      return;
    }
    const { uiState, rowModel, visibleColumns, dispatch } = args;
    const rowCount = rowModel.getRowCount();
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
  };

  const handleKeyDown = async (event: GridKeyboardEventLike) => {
    if (args === null) {
      return;
    }
    const {
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
      onClearSelection,
      enableClearOnDelete,
      onToggleCheckboxCell,
      onToggleGroup,
    } = args;

    // 入力部品(input / textarea / select / button / contenteditable)配下では発火させません。
    if (shouldIgnoreGridKeydown(event.target)) {
      return;
    }
    // 編集中はエディタがキーを扱います。
    if (uiState.editingCell) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      await handleCopy();
      return;
    }

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

    if ((event.ctrlKey || event.metaKey) && !event.isComposing) {
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
    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      enableClearOnDelete
    ) {
      event.preventDefault();
      onClearSelection();
      return;
    }
    // グループ行では Enter / Space が開閉トグル。
    if ((event.key === 'Enter' || event.key === ' ') && uiState.activeCell) {
      const groupRow = rowModel.getGroupRow?.(uiState.activeCell.row);
      if (groupRow) {
        event.preventDefault();
        onToggleGroup(groupRow.groupKey);
        return;
      }
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      if (uiState.activeCell) {
        handleCellDoubleClick(uiState.activeCell);
      }
      return;
    }
    // 印字キーは、その文字を初期値にして編集開始(checkbox 列は Space でトグルのみ)。
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
      if (column.editor?.type === 'checkbox') {
        event.preventDefault();
        if (event.key === ' ') {
          onToggleCheckboxCell(uiState.activeCell);
        }
        return;
      }
      event.preventDefault();
      setEditorInitialValue(event.key);
      dispatch(gridActions.startEdit(uiState.activeCell));
    }
  };

  return { update, handleKeyDown };
};