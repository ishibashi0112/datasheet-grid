// 追加(非依存化 ④-1): model/gridStore(React 非依存の外部 store)を React から購読する薄い hook です。
//   useSyncExternalStore で store の state を読み、従来の useReducer と同じ [uiState, dispatch] を
//   返します。dispatch は store のメソッドで参照が安定しています。getServerSnapshot にも getState を
//   渡し、SSR(website の Next.js)でも初期 state で描画できるようにします。
import { useSyncExternalStore } from 'react';
import type { GridStore } from '../model/gridStore';
import type { GridUiState } from '../model/gridTypes';

export function useGridStore(
  store: GridStore,
): [GridUiState, GridStore['dispatch']] {
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  return [state, store.dispatch];
}