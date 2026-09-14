// 追加(undo/redo): 編集履歴の純粋スタックです。snapshot は不透明な値(S)として扱います
//   (SpreadsheetGrid では「変更前の rows 配列」の参照を積みます。rows.map 由来の新配列は
//   未変更行オブジェクトを構造共有するため、スナップショット保持のコストは配列 1 本分です)。
//   すべて immutable(入力を変異させず新しいスタックを返す)で、React の ref に載せて使います。
export type HistoryStack<S> = {
  // 過去のスナップショット(古い → 新しい)。undo は末尾から取り出します。
  past: S[];
  // undo で退避した未来のスナップショット(新しい → 古い)。redo は末尾から取り出します。
  future: S[];
};

export const createHistoryStack = <S,>(): HistoryStack<S> => ({
  past: [],
  future: [],
});

export const canUndoHistory = <S,>(stack: HistoryStack<S>): boolean =>
  stack.past.length > 0;

export const canRedoHistory = <S,>(stack: HistoryStack<S>): boolean =>
  stack.future.length > 0;

// 変更を確定する直前に「変更前のスナップショット」を積みます。新しい変更が入った時点で
//   redo 系譜(future)は破棄します(一般的な undo/redo のセマンティクス)。
//   limit 超過分は最古(past 先頭)から捨てます。limit <= 0 は「何も積まない」= 実質無効です。
//   ※ future は undo でしか増えず、undo は past からの移し替えのため、future 長も limit を
//     超えません(future 側の個別 trim は不要)。
export const pushHistory = <S,>(
  stack: HistoryStack<S>,
  snapshot: S,
  limit: number,
): HistoryStack<S> => {
  if (limit <= 0) {
    return stack;
  }
  const past = [...stack.past, snapshot];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    future: [],
  };
};

// 直前のスナップショットを取り出します。current(現在のスナップショット)は redo 用に
//   future へ退避します。履歴が空なら null(呼び出し側で no-op)です。
export const undoHistory = <S,>(
  stack: HistoryStack<S>,
  current: S,
): { stack: HistoryStack<S>; snapshot: S } | null => {
  if (stack.past.length === 0) {
    return null;
  }
  const snapshot = stack.past[stack.past.length - 1];
  return {
    stack: {
      past: stack.past.slice(0, -1),
      future: [...stack.future, current],
    },
    snapshot,
  };
};

// undo で退避したスナップショットを取り出します。current は undo 用に past へ戻します。
//   future が空なら null(呼び出し側で no-op)です。
export const redoHistory = <S,>(
  stack: HistoryStack<S>,
  current: S,
): { stack: HistoryStack<S>; snapshot: S } | null => {
  if (stack.future.length === 0) {
    return null;
  }
  const snapshot = stack.future[stack.future.length - 1];
  return {
    stack: {
      past: [...stack.past, current],
      future: stack.future.slice(0, -1),
    },
    snapshot,
  };
};