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
import { revertRowsChange } from '../logic/historyRebase';
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
  // 変更の前の rows(元に戻すとこれに戻る)。
  rows: T[];
  // 追加(1.1.0 / AP-14): 変更の後の rows。外からの更新(applyRows の undoable: false)を挟んだときは、元に戻すで
  //   「rows → after の変更だけ」を今の rows から取り消す(logic/historyRebase)。
  after: T[];
  selection: GridSelection;
  activeCell: CellCoord | null;
};

// 追加(1.1.0 / AP-14): applyRows のオプション(公開の型は GridApplyRowsOptions)。
export type HistoryApplyRowsOptions = { undoable?: boolean | undefined };

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
  // 追加(1.1.0 / AP-14): 外からの更新を挟んだ元に戻すで行を対応づけるキー(未指定なら位置)。
  rowKeyGetter?: ((row: T, index: number) => unknown) | undefined;
};

export type HistoryController<T> = {
  update: (args: HistoryControllerArgs<T>) => void;
  // 行データ変更の履歴化ラッパ(有効時にスナップショットを積んでから onRowsChange へ委譲)。
  handleRowsChange: (nextRows: T[]) => void;
  // 追加(フィルハンドル 1A): 直前の handleRowsChange の結果を差し替えます(履歴は積まない = 元に戻す 1 回で
  //   変更前へ戻る)。埋めたあとのボタンで「連続データ / セルのコピー」を選び直すときに使います。
  amendRowsChange: (nextRows: T[]) => void;
  // 追加(1.1.0 / AP-14): 命令的 API の applyRows の本体。関数の形は最後に渡した rows(まだ描かれていなければそれ)を受け取る。
  //   undoable: false は履歴を消さず積みもしない(元に戻すは編集だけを今の rows から取り消す)。
  applyRows: (next: T[] | ((prev: T[]) => T[]), options?: HistoryApplyRowsOptions) => void;
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
  // 追加(1.1.0 / AP-14): 最後に onRowsChange へ渡した rows(次の描画で update が来るまで)。applyRows の関数の形の prev。
  let pendingRows: T[] | null = null;
  // 追加(1.1.0 / AP-14): 履歴を消さずに外からの更新(undoable: false)を入れたか。入れていない間の元に戻す / やり直しは
  //   これまでどおり履歴の rows をそのまま戻す(1.0 と同じ)。
  let rebaseNeeded = false;

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
    pendingRows = null;
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
        rebaseNeeded = false;
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

  const pushAndEmit = (prevRows: T[], nextRows: T[]) => {
    if (args === null || !args.onRowsChange) {
      return;
    }
    if (args.enabled) {
      stack = pushHistory(
        stack,
        { rows: prevRows, after: nextRows, selection: args.selection, activeCell: args.activeCell },
        args.limit,
      );
      selfEmittedRows = nextRows;
      notifyUndoRedoState();
    }
    pendingRows = nextRows;
    args.onRowsChange(nextRows);
  };

  const handleRowsChange = (nextRows: T[]) => {
    if (args === null || !args.onRowsChange) {
      return;
    }
    pushAndEmit(args.rows, nextRows);
  };

  const amendRowsChange = (nextRows: T[]) => {
    if (args === null || !args.onRowsChange) {
      return;
    }
    if (args.enabled) {
      selfEmittedRows = nextRows;
      const top = stack.past[stack.past.length - 1];
      if (top) {
        stack = { ...stack, past: [...stack.past.slice(0, -1), { ...top, after: nextRows }] };
      }
    }
    pendingRows = nextRows;
    args.onRowsChange(nextRows);
  };

  const applyRows = (next: T[] | ((prev: T[]) => T[]), options?: HistoryApplyRowsOptions) => {
    if (args === null || !args.onRowsChange) {
      return;
    }
    const prevRows = pendingRows ?? args.rows;
    const nextRows = Array.isArray(next) ? next : next(prevRows);
    if (options?.undoable !== false) {
      pushAndEmit(prevRows, nextRows);
      return;
    }
    if (args.enabled) {
      selfEmittedRows = nextRows;
      rebaseNeeded = true;
    }
    pendingRows = nextRows;
    args.onRowsChange(nextRows);
  };

  // 戻す先の rows。外からの更新(undoable: false)を挟んでいれば、その変更だけを今の rows から取り消す。
  const resolveTarget = (entry: GridHistoryEntry<T> | undefined, current: T[]): T[] | null => {
    if (!entry) {
      return null;
    }
    if (!rebaseNeeded || entry.after === current) {
      return entry.rows;
    }
    return revertRowsChange(entry.rows, entry.after, current, args?.rowKeyGetter ?? ((_row: T, index: number) => index));
  };

  const applyRestore = (
    result: { stack: HistoryStack<GridHistoryEntry<T>>; snapshot: GridHistoryEntry<T> } | null,
  ) => {
    if (result === null || args === null || !args.onRowsChange) {
      return;
    }
    stack = result.stack;
    selfEmittedRows = result.snapshot.rows;
    pendingRows = result.snapshot.rows;
    args.onRowsChange(result.snapshot.rows);
    restoreUiSnapshot(result.snapshot);
    args.onAfterRestore?.(result.snapshot.activeCell);
    notifyUndoRedoState();
  };

  // 今の状態(やり直し / 元に戻すの反対側へ積む)。after は戻した後の rows。
  const currentSnapshot = (after: T[]): GridHistoryEntry<T> | null =>
    args === null
      ? null
      : { rows: args.rows, after, selection: args.selection, activeCell: args.activeCell };

  const restoreWith = (
    entry: GridHistoryEntry<T> | undefined,
    move: (
      stack: HistoryStack<GridHistoryEntry<T>>,
      current: GridHistoryEntry<T>,
    ) => { stack: HistoryStack<GridHistoryEntry<T>>; snapshot: GridHistoryEntry<T> } | null,
  ) => {
    if (!isActive() || args === null) {
      return;
    }
    const target = resolveTarget(entry, args.rows);
    const snapshot = target === null ? null : currentSnapshot(target);
    if (target === null || snapshot === null) {
      return;
    }
    const result = move(stack, snapshot);
    applyRestore(result === null ? null : { stack: result.stack, snapshot: { ...result.snapshot, rows: target } });
  };

  const undo = () => {
    restoreWith(stack.past[stack.past.length - 1], undoHistory);
  };

  const redo = () => {
    restoreWith(stack.future[stack.future.length - 1], redoHistory);
  };

  const clearHistory = () => {
    stack = createHistoryStack();
    rebaseNeeded = false;
    notifyUndoRedoState();
  };

  return { update, handleRowsChange, amendRowsChange, applyRows, undo, redo, canUndo, canRedo, clearHistory };
};