// 追加(undo/redo): logic/history.ts(編集履歴の純粋スタック)の単体テストです。
//   snapshot は不透明値のため、ここでは判別しやすい文字列/配列参照で検証します。
import { describe, it, expect } from 'vitest';
import {
  canRedoHistory,
  canUndoHistory,
  createHistoryStack,
  pushHistory,
  redoHistory,
  undoHistory,
  type HistoryStack,
} from './history';

describe('createHistoryStack', () => {
  it('空スタック(undo / redo とも不可)を返す', () => {
    const stack = createHistoryStack<string>();
    expect(stack).toEqual({ past: [], future: [] });
    expect(canUndoHistory(stack)).toBe(false);
    expect(canRedoHistory(stack)).toBe(false);
  });
});

describe('pushHistory', () => {
  it('past 末尾へ積み、undo 可能になる', () => {
    let stack = createHistoryStack<string>();
    stack = pushHistory(stack, 'v1', 10);
    stack = pushHistory(stack, 'v2', 10);
    expect(stack.past).toEqual(['v1', 'v2']);
    expect(canUndoHistory(stack)).toBe(true);
  });

  it('push で future(redo 系譜)を破棄する', () => {
    let stack: HistoryStack<string> = {
      past: ['v1'],
      future: ['v3', 'v2'],
    };
    stack = pushHistory(stack, 'v4', 10);
    expect(stack.past).toEqual(['v1', 'v4']);
    expect(stack.future).toEqual([]);
    expect(canRedoHistory(stack)).toBe(false);
  });

  it('limit 超過分を最古(past 先頭)から捨てる', () => {
    let stack = createHistoryStack<string>();
    stack = pushHistory(stack, 'v1', 2);
    stack = pushHistory(stack, 'v2', 2);
    stack = pushHistory(stack, 'v3', 2);
    expect(stack.past).toEqual(['v2', 'v3']);
  });

  it('limit <= 0 は何も積まない(実質無効)', () => {
    const stack = createHistoryStack<string>();
    expect(pushHistory(stack, 'v1', 0)).toBe(stack);
    expect(pushHistory(stack, 'v1', -1)).toBe(stack);
  });

  it('入力スタックを変異させない(immutable)', () => {
    const stack: HistoryStack<string> = { past: ['v1'], future: ['v2'] };
    pushHistory(stack, 'v3', 10);
    expect(stack).toEqual({ past: ['v1'], future: ['v2'] });
  });
});

describe('undoHistory / redoHistory', () => {
  it('undo は past 末尾を返し、current を future へ退避する', () => {
    const stack: HistoryStack<string> = { past: ['v1', 'v2'], future: [] };
    const result = undoHistory(stack, 'v3');
    expect(result).not.toBeNull();
    expect(result?.snapshot).toBe('v2');
    expect(result?.stack).toEqual({ past: ['v1'], future: ['v3'] });
  });

  it('redo は future 末尾を返し、current を past へ戻す', () => {
    const stack: HistoryStack<string> = { past: ['v1'], future: ['v3'] };
    const result = redoHistory(stack, 'v2');
    expect(result).not.toBeNull();
    expect(result?.snapshot).toBe('v3');
    expect(result?.stack).toEqual({ past: ['v1', 'v2'], future: [] });
  });

  it('空のときは null(呼び出し側で no-op)', () => {
    const empty = createHistoryStack<string>();
    expect(undoHistory(empty, 'current')).toBeNull();
    expect(redoHistory(empty, 'current')).toBeNull();
  });

  it('undo → redo の往復で元のスナップショット列に戻る', () => {
    let stack = createHistoryStack<string>();
    stack = pushHistory(stack, 'v1', 10);
    stack = pushHistory(stack, 'v2', 10);

    // 現在値 v3 から 2 回 undo して v1 へ。
    const undo1 = undoHistory(stack, 'v3');
    expect(undo1?.snapshot).toBe('v2');
    const undo2 = undoHistory(undo1!.stack, undo1!.snapshot);
    expect(undo2?.snapshot).toBe('v1');
    expect(canUndoHistory(undo2!.stack)).toBe(false);

    // 2 回 redo して v3 へ戻る。
    const redo1 = redoHistory(undo2!.stack, undo2!.snapshot);
    expect(redo1?.snapshot).toBe('v2');
    const redo2 = redoHistory(redo1!.stack, redo1!.snapshot);
    expect(redo2?.snapshot).toBe('v3');
    expect(canRedoHistory(redo2!.stack)).toBe(false);
    expect(redo2?.stack.past).toEqual(['v1', 'v2']);
  });

  it('スナップショットは参照をそのまま保持する(rows 配列の構造共有前提)', () => {
    const rowsV1 = [{ id: 1 }];
    const rowsV2 = [{ id: 2 }];
    let stack = createHistoryStack<Array<{ id: number }>>();
    stack = pushHistory(stack, rowsV1, 10);
    const result = undoHistory(stack, rowsV2);
    expect(result?.snapshot).toBe(rowsV1);
    expect(result?.stack.future[0]).toBe(rowsV2);
  });
});