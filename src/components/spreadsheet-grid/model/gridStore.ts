// 追加(非依存化 ④-1): UI 状態の外部 store です(React 非依存)。
//   既存の純粋 reducer(gridUiReducer)をそのまま包み、getState / dispatch / subscribe の 3 つだけを
//   提供します。React 側は hooks/useGridStore(useSyncExternalStore)で購読し、従来の useReducer と
//   同じ [uiState, dispatch] を得ます(挙動不変)。
//   - dispatch は同期で reducer を適用し、参照が変わったときだけ購読者へ通知します(reducer の
//     no-op = 同一参照は通知しない。useReducer の bail-out と同じ)。
//   - 将来のコントローラ(非依存化 ③)は React state を読めないため、この store の getState を
//     直接読みます(latest-ref イディオムの置き換え先)。Solid 版は subscribe から signal を作るだけで
//     同じ store を共用できます。
import type { GridUiAction } from './gridActions';
import type { GridUiState } from './gridTypes.core';
import { gridUiReducer } from './gridReducer';

export type GridStoreListener = () => void;

export type GridStore = {
  getState: () => GridUiState;
  dispatch: (action: GridUiAction) => void;
  subscribe: (listener: GridStoreListener) => () => void;
};

export type GridUiReducer = (
  state: GridUiState,
  action: GridUiAction,
) => GridUiState;

export const createGridStore = (
  initialState: GridUiState,
  reducer: GridUiReducer = gridUiReducer,
): GridStore => {
  let state = initialState;
  const listeners = new Set<GridStoreListener>();

  const getState = () => state;

  const dispatch = (action: GridUiAction) => {
    const next = reducer(state, action);
    if (Object.is(next, state)) {
      return;
    }
    state = next;
    // 通知中の unsubscribe / subscribe に耐えるよう、配列へ写してから呼びます。
    for (const listener of Array.from(listeners)) {
      listener();
    }
  };

  const subscribe = (listener: GridStoreListener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { getState, dispatch, subscribe };
};