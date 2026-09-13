// 追加(非依存化 ④-1): 外部 store(createGridStore)の純粋テストです(React 非依存)。
import { describe, expect, it, vi } from 'vitest';
import { createGridStore } from './gridStore';
import { createInitialGridUiState } from './gridReducer';
import { gridActions } from './gridActions';

describe('createGridStore', () => {
  it('初期 state を返し、dispatch で reducer を適用して購読者へ通知する', () => {
    const store = createGridStore(createInitialGridUiState([]));
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(store.getState().activeCell).toBeNull();

    store.dispatch(gridActions.activateCell({ row: 1, col: 2 }));
    expect(store.getState().activeCell).toEqual({ row: 1, col: 2 });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.dispatch(gridActions.activateCell({ row: 0, col: 0 }));
    expect(store.getState().activeCell).toEqual({ row: 0, col: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reducer が同一参照を返す no-op では state も購読者も変えない(useReducer の bail-out 相当)', () => {
    const initial = createInitialGridUiState([]);
    const reducer = vi.fn((state: typeof initial) => state);
    const store = createGridStore(initial, reducer);
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch(gridActions.clearSelection());
    expect(reducer).toHaveBeenCalledTimes(1);
    expect(store.getState()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();
  });

  it('通知中に unsubscribe / 再 dispatch しても残りの購読者へ届き、state は整合する', () => {
    const store = createGridStore(createInitialGridUiState([]));
    const seen: Array<number | undefined> = [];
    const unsubscribeA = store.subscribe(() => {
      seen.push(store.getState().activeCell?.row);
      unsubscribeA();
    });
    store.subscribe(() => {
      seen.push(store.getState().activeCell?.row);
    });
    store.dispatch(gridActions.activateCell({ row: 5, col: 0 }));
    store.dispatch(gridActions.activateCell({ row: 6, col: 0 }));
    // 1 回目: A(自身を解除)と B の両方、2 回目: B だけ。
    expect(seen).toEqual([5, 5, 6]);
  });
});