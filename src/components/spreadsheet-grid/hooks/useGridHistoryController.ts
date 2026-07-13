import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  canRedoHistory,
  canUndoHistory,
  createHistoryStack,
  pushHistory,
  redoHistory,
  undoHistory,
  type HistoryStack,
} from '../logic/history';

type UseGridHistoryControllerArgs<T> = {
  rows: T[];
  onRowsChange?: (nextRows: T[]) => void;
  // undo/redo の有効条件です(SpreadsheetGrid 側で enableUndoRedo && !readOnly && !isServerSide を
  //   解決して渡します)。false の間は履歴を積まず、undo/redo も no-op になります。既に積まれた
  //   履歴は消しません(readOnly の一時トグルで履歴が失われないように。rows が外部変更されれば
  //   下の外部変更検知が破棄します)。
  enabled: boolean;
  // 保持する undo ステップ数の上限です(超過分は最古から破棄。<= 0 は何も積まない)。
  limit: number;
};

// 追加(undo/redo): グリッド編集の取り消し/やり直しをまとめる history controller です。
//   rows は外部 controlled のため、reducer ではなくここで「変更前 rows 配列」の参照スナップショットを
//   スタックに積み、undo/redo 時は過去のスナップショットを onRowsChange へ流し込みます。
//   grid 起点の全変更(セル編集 commit / ペースト / renderCell の setValue)が handleRowsChange を
//   通ることが前提です(SpreadsheetGrid 側で生の onRowsChange の代わりに各経路へ配ります)。
export const useGridHistoryController = <T,>({
  rows,
  onRowsChange,
  enabled,
  limit,
}: UseGridHistoryControllerArgs<T>) => {
  const historyRef = useRef<HistoryStack<T[]>>(createHistoryStack<T[]>());
  // 直近に自分(grid 起点の編集 / undo / redo)が onRowsChange へ渡した配列参照です。
  //   rows prop の変化がこれと一致すれば「自分の変更が controlled で戻ってきた」と判定します。
  const selfEmittedRowsRef = useRef<T[] | null>(null);
  const lastRowsRef = useRef<T[]>(rows);

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
    historyRef.current = createHistoryStack<T[]>();
  }, [rows]);

  // 生の onRowsChange を包む変更口です。有効時は「変更前の rows(現 prop 値)」を積んでから委譲します。
  //   onRowsChange 未指定時は undefined を返し、各 controller の `if (!onRowsChange)` ガード挙動
  //   (paste の no-op 等)を従来どおりに保ちます。
  const handleRowsChange = useMemo(() => {
    if (!onRowsChange) {
      return undefined;
    }
    return (nextRows: T[]) => {
      if (enabled) {
        historyRef.current = pushHistory(historyRef.current, rows, limit);
        selfEmittedRowsRef.current = nextRows;
      }
      onRowsChange(nextRows);
    };
  }, [enabled, limit, onRowsChange, rows]);

  const undo = useCallback(() => {
    if (!enabled || !onRowsChange) {
      return;
    }
    const result = undoHistory(historyRef.current, rows);
    if (!result) {
      return;
    }
    historyRef.current = result.stack;
    selfEmittedRowsRef.current = result.snapshot;
    onRowsChange(result.snapshot);
  }, [enabled, onRowsChange, rows]);

  const redo = useCallback(() => {
    if (!enabled || !onRowsChange) {
      return;
    }
    const result = redoHistory(historyRef.current, rows);
    if (!result) {
      return;
    }
    historyRef.current = result.stack;
    selfEmittedRowsRef.current = result.snapshot;
    onRowsChange(result.snapshot);
  }, [enabled, onRowsChange, rows]);

  const canUndo = useCallback(
    () => enabled && onRowsChange != null && canUndoHistory(historyRef.current),
    [enabled, onRowsChange],
  );

  const canRedo = useCallback(
    () => enabled && onRowsChange != null && canRedoHistory(historyRef.current),
    [enabled, onRowsChange],
  );

  const clearHistory = useCallback(() => {
    historyRef.current = createHistoryStack<T[]>();
  }, []);

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