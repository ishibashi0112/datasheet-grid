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
import type { GridUiState } from './gridTypes.unbound';
import { gridUiReducer } from './gridReducer';

export type GridStoreListener = () => void;

// 追加(非依存化 ④-2): reducer 管轄外の「一時状態(view スライス)」です。ビューポート計測
//   (scroll / resize リスナーが書く)とホバー(ポインタ系が書く)で、旧 SpreadsheetGrid の
//   useState 6 個に対応します。公開 API(getState / applyState の GridState)には含みません。
export type GridViewState = {
  // スクロールコンテナの物理 scrollTop / clientWidth / clientHeight(0 = 未計測)。
  scrollTop: number;
  viewportWidth: number;
  viewportHeight: number;
  // ポインタ由来のホバー行 / 列(view index。null = なし)とコーナーセルのホバー。
  hoveredRowIndex: number | null;
  hoveredColumnIndex: number | null;
  isCornerHovered: boolean;
};

export const createInitialGridViewState = (): GridViewState => ({
  scrollTop: 0,
  viewportWidth: 0,
  viewportHeight: 0,
  hoveredRowIndex: null,
  hoveredColumnIndex: null,
  isCornerHovered: false,
});

// 値または「前の値から次の値を作る関数」(React の SetStateAction と同形。React 非依存)。
export type Updater<T> = T | ((prev: T) => T);

export const resolveUpdater = <T,>(updater: Updater<T>, prev: T): T =>
  typeof updater === 'function' ? (updater as (prev: T) => T)(prev) : updater;

// view スライスの部分更新(値、または「現在の view 全体」から部分更新を作る関数)。
export type GridViewStatePatch =
  | Partial<GridViewState>
  | ((prev: GridViewState) => Partial<GridViewState>);

export type GridStore = {
  getState: () => GridUiState;
  dispatch: (action: GridUiAction) => void;
  // 追加(④-2): view スライス。setViewState は部分更新(値 or 関数)で、いずれかのフィールドが
  //   変わったときだけ新しいオブジェクトを作って通知します(全フィールド同値なら何もしない)。
  getViewState: () => GridViewState;
  setViewState: (patch: GridViewStatePatch) => void;
  subscribe: (listener: GridStoreListener) => () => void;
};

export type GridUiReducer = (
  state: GridUiState,
  action: GridUiAction,
) => GridUiState;

export const createGridStore = (
  initialState: GridUiState,
  reducer: GridUiReducer = gridUiReducer,
  initialViewState: GridViewState = createInitialGridViewState(),
): GridStore => {
  let state = initialState;
  let viewState = initialViewState;
  const listeners = new Set<GridStoreListener>();

  const notify = () => {
    // 通知中の unsubscribe / subscribe に耐えるよう、配列へ写してから呼びます。
    for (const listener of Array.from(listeners)) {
      listener();
    }
  };

  const getState = () => state;

  const dispatch = (action: GridUiAction) => {
    const next = reducer(state, action);
    if (Object.is(next, state)) {
      return;
    }
    state = next;
    notify();
  };

  const getViewState = () => viewState;

  const setViewState = (patch: GridViewStatePatch) => {
    const resolved = typeof patch === 'function' ? patch(viewState) : patch;
    let changed = false;
    for (const key of Object.keys(resolved) as Array<keyof GridViewState>) {
      if (!Object.is(resolved[key], viewState[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      return;
    }
    viewState = { ...viewState, ...resolved };
    notify();
  };

  const subscribe = (listener: GridStoreListener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { getState, dispatch, getViewState, setViewState, subscribe };
};