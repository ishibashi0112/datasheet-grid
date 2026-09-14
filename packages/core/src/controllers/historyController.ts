// 追加(非依存化 ③-5): undo / redo 履歴のコントローラです(React 非依存。旧 hooks/useGridHistoryController の
//   本体を移設)。
//   - 履歴スタック本体は logic/history.ts(純関数)。本コントローラは「いつ積むか / 自己発行した rows の
//     識別 / UI スナップショットの復元 / 状態変化の通知抑止」を担います。
//   - update(args) はレンダー後に毎回呼ばれる前提です(hooks/useController)。最新の args を保持し、
//     rows の参照変化(自己発行でない = 外部からの差し替え)を検出したら履歴をリセットして通知します。
//     undo / redo / handleRowsChange は最新 args のスナップショット(rows / selection / activeCell)を使います。
//   - onUndoRedoStateChange は canUndo / canRedo のどちらかが変わったときだけ呼びます(初期状態
//     false / false は通知しない = 従来の契約)。
import { gridActions, type GridUiAction } from '../model/gridActions';
import type {
  CellCoord,
  GridSelection,
  UndoRedoState,
} from '../model/gridTypes.unbound';
import {
  canRedoHistory,
  canUndoHistory,
  createHistoryStack,
  pushHistory,
  redoHistory,
  undoHistory,
  type HistoryStack,
} from '../logic/history';

export type GridHistoryEntry<T> = {
  rows: T[];
  selection: GridSelection;
  activeCell: CellCoord | null;
};

export type HistoryControllerArgs<T> = {
  rows: T[];
  selection: GridSelection;
  activeCell: CellCoord | null;
  onRowsChange?: (nextRows: T[]) => void;
  dispatch: (action: GridUiAction) => void;
  enabled: boolean;
  limit: number;
  onUndoRedoStateChange?: (state: UndoRedoState) => void;
  onAfterRestore?: (activeCell: CellCoord | null) => void;
};

export type HistoryController<T> = {
  update: (args: HistoryControllerArgs<T>) => void;
  // 行データ変更の履歴化ラッパ(有効時にスナップショットを積んでから onRowsChange へ委譲)。
  handleRowsChange: (nextRows: T[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
};

export const createHistoryController = <T,>(): HistoryController<T> => {
  let args: HistoryControllerArgs<T> | null = null;
  let stack: HistoryStack<GridHistoryEntry<T>> = createHistoryStack();
  // handleRowsChange / undo / redo で自分が発行した rows(親から同じ参照が戻ってきてもリセットしない)。
  let selfEmittedRows: T[] | null = null;
  let lastRows: T[] | null = null;
  let lastNotified: UndoRedoState = { canUndo: false, canRedo: false };

  const isActive = () =>
    args !== null && args.enabled && args.onRowsChange != null;

  const canUndo = () => isActive() && canUndoHistory(stack);
  const canRedo = () => isActive() && canRedoHistory(stack);

  const notifyUndoRedoState = () => {
    const next: UndoRedoState = { canUndo: canUndo(), canRedo: canRedo() };
    if (
      next.canUndo === lastNotified.canUndo &&
      next.canRedo === lastNotified.canRedo
    ) {
      return;
    }
    lastNotified = next;
    args?.onUndoRedoStateChange?.(next);
  };

  const update = (next: HistoryControllerArgs<T>) => {
    args = next;
    if (lastRows === null) {
      // 初回: 現在の rows を基準にするだけ(履歴は空のまま)。
      lastRows = next.rows;
    } else if (next.rows !== lastRows) {
      lastRows = next.rows;
      if (selfEmittedRows === next.rows) {
        // 自己発行した rows が親から戻ってきた(履歴は維持)。
        selfEmittedRows = null;
      } else {
        // 外部からの差し替え → 履歴をリセット。
        selfEmittedRows = null;
        stack = createHistoryStack();
      }
    }
    // enabled / onRowsChange / onUndoRedoStateChange の変化やリセットを反映(変化時のみ通知)。
    notifyUndoRedoState();
  };

  const restoreUiSnapshot = (entry: GridHistoryEntry<T>) => {
    if (args === null) {
      return;
    }
    const { dispatch } = args;
    const entrySelection = entry.selection;
    if (entrySelection?.type === 'cell') {
      dispatch(gridActions.startSelection(entrySelection.range.start));
      dispatch(gridActions.updateSelection(entrySelection.range.end));
      dispatch(gridActions.endSelection());
    } else if (entrySelection?.type === 'row') {
      dispatch(gridActions.startRowSelection(entrySelection.startRow));
      dispatch(gridActions.updateRowSelection(entrySelection.endRow));
      dispatch(gridActions.endSelection());
    } else if (entrySelection?.type === 'col') {
      dispatch(gridActions.startColumnSelection(entrySelection.startCol));
      dispatch(gridActions.updateColumnSelection(entrySelection.endCol));
      dispatch(gridActions.endSelection());
    } else {
      dispatch(gridActions.clearSelection());
    }
    dispatch(gridActions.activateCell(entry.activeCell));
  };

  const handleRowsChange = (nextRows: T[]) => {
    if (args === null || !args.onRowsChange) {
      return;
    }
    if (args.enabled) {
      stack = pushHistory(
        stack,
        { rows: args.rows, selection: args.selection, activeCell: args.activeCell },
        args.limit,
      );
      selfEmittedRows = nextRows;
      notifyUndoRedoState();
    }
    args.onRowsChange(nextRows);
  };

  const applyRestore = (
    result: { stack: HistoryStack<GridHistoryEntry<T>>; snapshot: GridHistoryEntry<T> } | null,
  ) => {
    if (result === null || args === null || !args.onRowsChange) {
      return;
    }
    stack = result.stack;
    selfEmittedRows = result.snapshot.rows;
    args.onRowsChange(result.snapshot.rows);
    restoreUiSnapshot(result.snapshot);
    args.onAfterRestore?.(result.snapshot.activeCell);
    notifyUndoRedoState();
  };

  const currentSnapshot = (): GridHistoryEntry<T> | null =>
    args === null
      ? null
      : { rows: args.rows, selection: args.selection, activeCell: args.activeCell };

  const undo = () => {
    const snapshot = currentSnapshot();
    if (!isActive() || snapshot === null) {
      return;
    }
    applyRestore(undoHistory(stack, snapshot));
  };

  const redo = () => {
    const snapshot = currentSnapshot();
    if (!isActive() || snapshot === null) {
      return;
    }
    applyRestore(redoHistory(stack, snapshot));
  };

  const clearHistory = () => {
    stack = createHistoryStack();
    notifyUndoRedoState();
  };

  return { update, handleRowsChange, undo, redo, canUndo, canRedo, clearHistory };
};