// 追加(非依存化 ④-1): model/gridStore(React 非依存の外部 store)を React から購読する薄い hook です。
//   useSyncExternalStore で store の state を読み、従来の useReducer と同じ [uiState, dispatch] を
//   返します。dispatch は store のメソッドで参照が安定しています。getServerSnapshot にも getState を
//   渡し、SSR(website の Next.js)でも初期 state で描画できるようにします。
import { useMemo, useSyncExternalStore } from 'react';
import {
  resolveUpdater,
  type GridStore,
  type GridViewState,
  type Updater,
} from '@ishibashi0112/spreadsheet-grid-core/model/gridStore';
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

// 追加(非依存化 ④-2): view スライス(ビューポート計測 / ホバー)の購読と、フィールド別の setter です。
//   setter は旧 useState の setter と同じ呼び出し形(値 or 関数)で、参照は store に対して安定です
//   (useMemo)。旧コードの `const [scrollTop, setScrollTop] = useState(0)` 等の置き換え先。
export type GridViewStateSetters = {
  [K in keyof GridViewState as `set${Capitalize<K>}`]: (
    next: Updater<GridViewState[K]>,
  ) => void;
};

export function useGridViewState(
  store: GridStore,
): [GridViewState, GridViewStateSetters] {
  const view = useSyncExternalStore(
    store.subscribe,
    store.getViewState,
    store.getViewState,
  );
  const setters = useMemo<GridViewStateSetters>(() => {
    const field =
      <K extends keyof GridViewState>(key: K) =>
      (next: Updater<GridViewState[K]>) => {
        store.setViewState((prev) => ({
          [key]: resolveUpdater(next, prev[key]),
        }));
      };
    return {
      setScrollTop: field('scrollTop'),
      setViewportWidth: field('viewportWidth'),
      setViewportHeight: field('viewportHeight'),
      setHoveredRowIndex: field('hoveredRowIndex'),
      setHoveredColumnIndex: field('hoveredColumnIndex'),
      setIsCornerHovered: field('isCornerHovered'),
    };
  }, [store]);
  return [view, setters];
}