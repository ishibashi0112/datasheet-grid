import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Dispatch } from 'react';
import { gridActions, type GridUiAction } from '../model/gridActions';
import type {
  CellCoord,
  GridSelection,
  UndoRedoState,
} from '../model/gridTypes';
import {
  canRedoHistory,
  canUndoHistory,
  createHistoryStack,
  pushHistory,
  redoHistory,
  undoHistory,
  type HistoryStack,
} from '../logic/history';

// 追加(undo/redo): 履歴エントリです。rows スナップショットに加えて、復元用の UI 状態
//   (selection / activeCell)を同梱します。undo/redo 時に「その編集をしていた場所」へ
//   選択とアクティブセルを戻します(AG Grid の undo 後フォーカス復帰に相当)。
type GridHistoryEntry<T> = {
  rows: T[];
  selection: GridSelection;
  activeCell: CellCoord | null;
};

type UseGridHistoryControllerArgs<T> = {
  rows: T[];
  // 履歴エントリへ同梱する現在の UI 状態です(push 時 = 変更前、undo/redo 時 = 退避用)。
  selection: GridSelection;
  activeCell: CellCoord | null;
  onRowsChange?: (nextRows: T[]) => void;
  // undo/redo 時のセレクション復元(selection 系 + activateCell の dispatch)に使います。
  dispatch: Dispatch<GridUiAction>;
  // undo/redo の有効条件です(SpreadsheetGrid 側で enableUndoRedo && !readOnly && !isServerSide を
  //   解決して渡します)。false の間は履歴を積まず、undo/redo も no-op になります。既に積まれた
  //   履歴は消しません(readOnly の一時トグルで履歴が失われないように。rows が外部変更されれば
  //   下の外部変更検知が破棄します)。
  enabled: boolean;
  // 保持する undo ステップ数の上限です(超過分は最古から破棄。<= 0 は何も積まない)。
  limit: number;
  // undo/redo 可能状態が「変化したとき」だけ呼ぶ通知口です(ツールバーの disabled 表示用)。
  onUndoRedoStateChange?: (state: UndoRedoState) => void;
  // undo/redo の UI 復元後に呼ぶ後処理です(SpreadsheetGrid 側で「復元先アクティブセルへの
  //   スクロール追従」を配線します。restore の dispatch と同一イベント内で呼ばれるため、
  //   レイアウト確定を要する処理は受け手側で rAF 等へ遅延させます)。
  onAfterRestore?: (activeCell: CellCoord | null) => void;
};

// 追加(undo/redo): グリッド編集の取り消し/やり直しをまとめる history controller です。
//   rows は外部 controlled のため、reducer ではなくここで「変更前 rows 配列」の参照スナップショットを
//   スタックに積み、undo/redo 時は過去のスナップショットを onRowsChange へ流し込みます。
//   grid 起点の全変更(セル編集 commit / ペースト / Delete クリア / renderCell の setValue)が
//   handleRowsChange を通ることが前提です(SpreadsheetGrid 側で生の onRowsChange の代わりに
//   各経路へ配ります)。
export const useGridHistoryController = <T,>({
  rows,
  selection,
  activeCell,
  onRowsChange,
  dispatch,
  enabled,
  limit,
  onUndoRedoStateChange,
  onAfterRestore,
}: UseGridHistoryControllerArgs<T>) => {
  const historyRef = useRef<HistoryStack<GridHistoryEntry<T>>>(
    createHistoryStack<GridHistoryEntry<T>>(),
  );
  // 直近に自分(grid 起点の編集 / undo / redo)が onRowsChange へ渡した配列参照です。
  //   rows prop の変化がこれと一致すれば「自分の変更が controlled で戻ってきた」と判定します。
  const selfEmittedRowsRef = useRef<T[] | null>(null);
  const lastRowsRef = useRef<T[]>(rows);

  // 追加(undo/redo 通知): can* の「値が変わったとき」だけ onUndoRedoStateChange を呼びます。
  //   初回は {false, false} 基準のため発火せず、毎レンダーのインライン関数が渡されても
  //   値比較が no-op を握りつぶします(onStateChange の発火規約と同趣旨)。
  const lastNotifiedRef = useRef<UndoRedoState>({
    canUndo: false,
    canRedo: false,
  });
  const notifyUndoRedoState = useCallback(() => {
    const next: UndoRedoState = {
      canUndo:
        enabled && onRowsChange != null && canUndoHistory(historyRef.current),
      canRedo:
        enabled && onRowsChange != null && canRedoHistory(historyRef.current),
    };
    if (
      next.canUndo === lastNotifiedRef.current.canUndo &&
      next.canRedo === lastNotifiedRef.current.canRedo
    ) {
      return;
    }
    lastNotifiedRef.current = next;
    onUndoRedoStateChange?.(next);
  }, [enabled, onRowsChange, onUndoRedoStateChange]);

  // enabled / onRowsChange のトグルで can* が変わるケースの同期です(スタック不変でも
  //   有効条件の変化で見かけの可否が変わる)。値比較があるため余分な発火はしません。
  useEffect(() => {
    notifyUndoRedoState();
  }, [notifyUndoRedoState]);

  // 外部変更検知: rows が「自分が emit した参照」以外へ差し替わったら(親の直接 setState 等)、
  //   履歴のスナップショットは現データと不整合(undo が外部変更ごと巻き戻してしまう)のため
  //   安全側で全破棄します。ref 更新のみで setState はしません(再レンダー不要)。
  useEffect(() => {
    if (rows === lastRowsRef.current) {
      return;
    }
    lastRowsRef.current = rows;
    if (selfEmittedRowsRef.current === rows) {
      selfEmittedRowsRef.current = null;
      return;
    }
    selfEmittedRowsRef.current = null;
    historyRef.current = createHistoryStack<GridHistoryEntry<T>>();
    notifyUndoRedoState();
  }, [rows, notifyUndoRedoState]);

  // undo/redo で取り出したエントリの UI 状態(selection / activeCell)を復元します。
  //   selection は種別ごとに start → update → end(ドラッグ相当)で再構築し、activeCell は
  //   最後に明示 dispatch で合わせます(selection 系 start が activeCell を書き換えるため)。
  //   同一イベント内の連続 dispatch は React が自動バッチするため再レンダーは 1 回です。
  const restoreUiSnapshot = useCallback(
    (entry: GridHistoryEntry<T>) => {
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
    },
    [dispatch],
  );

  // 生の onRowsChange を包む変更口です。有効時は「変更前の rows(現 prop 値)+ 現在の
  //   selection / activeCell」を積んでから委譲します。onRowsChange 未指定時は undefined を
  //   返し、各 controller の `if (!onRowsChange)` ガード挙動(paste の no-op 等)を従来どおりに
  //   保ちます。
  const handleRowsChange = useMemo(() => {
    if (!onRowsChange) {
      return undefined;
    }
    return (nextRows: T[]) => {
      if (enabled) {
        historyRef.current = pushHistory(
          historyRef.current,
          { rows, selection, activeCell },
          limit,
        );
        selfEmittedRowsRef.current = nextRows;
        notifyUndoRedoState();
      }
      onRowsChange(nextRows);
    };
  }, [
    activeCell,
    enabled,
    limit,
    notifyUndoRedoState,
    onRowsChange,
    rows,
    selection,
  ]);

  const undo = useCallback(() => {
    if (!enabled || !onRowsChange) {
      return;
    }
    const result = undoHistory(historyRef.current, {
      rows,
      selection,
      activeCell,
    });
    if (!result) {
      return;
    }
    historyRef.current = result.stack;
    selfEmittedRowsRef.current = result.snapshot.rows;
    onRowsChange(result.snapshot.rows);
    restoreUiSnapshot(result.snapshot);
    onAfterRestore?.(result.snapshot.activeCell);
    notifyUndoRedoState();
  }, [
    activeCell,
    enabled,
    notifyUndoRedoState,
    onAfterRestore,
    onRowsChange,
    restoreUiSnapshot,
    rows,
    selection,
  ]);

  const redo = useCallback(() => {
    if (!enabled || !onRowsChange) {
      return;
    }
    const result = redoHistory(historyRef.current, {
      rows,
      selection,
      activeCell,
    });
    if (!result) {
      return;
    }
    historyRef.current = result.stack;
    selfEmittedRowsRef.current = result.snapshot.rows;
    onRowsChange(result.snapshot.rows);
    restoreUiSnapshot(result.snapshot);
    onAfterRestore?.(result.snapshot.activeCell);
    notifyUndoRedoState();
  }, [
    activeCell,
    enabled,
    notifyUndoRedoState,
    onAfterRestore,
    onRowsChange,
    restoreUiSnapshot,
    rows,
    selection,
  ]);

  const canUndo = useCallback(
    () => enabled && onRowsChange != null && canUndoHistory(historyRef.current),
    [enabled, onRowsChange],
  );

  const canRedo = useCallback(
    () => enabled && onRowsChange != null && canRedoHistory(historyRef.current),
    [enabled, onRowsChange],
  );

  const clearHistory = useCallback(() => {
    historyRef.current = createHistoryStack<GridHistoryEntry<T>>();
    notifyUndoRedoState();
  }, [notifyUndoRedoState]);

  return {
    handleRowsChange,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
  };
};

export default useGridHistoryController;