// view スライス(core の gridStore の getViewState / setViewState)の項目ごとの setter。React 版の
//   hooks/useGridStore.ts の useGridViewState が返す setter と同じ形(値か、前の値から次を作る関数を受ける)。
//   コントローラ(pointerInteractionsController など)は関数の形でも呼ぶので、同じものを渡します。
import {
  resolveUpdater,
  type GridStore,
  type GridViewState,
  type Updater,
} from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridStore';

const field =
  <K extends keyof GridViewState>(store: GridStore, key: K) =>
  (next: Updater<Exclude<GridViewState[K], undefined>>) => {
    store.setViewState((prev) => ({
      [key]: resolveUpdater(next as Updater<GridViewState[K]>, prev[key]),
    }));
  };

export function createGridViewSetters(store: GridStore) {
  return {
    setScrollTop: field(store, 'scrollTop'),
    setHoveredRowIndex: field(store, 'hoveredRowIndex'),
    setHoveredColumnIndex: field(store, 'hoveredColumnIndex'),
    setIsCornerHovered: field(store, 'isCornerHovered'),
    setCopiedRange: field(store, 'copiedRange'),
    setEditorInitialValue: (next: Updater<string>) => {
      store.setViewState((prev) => ({
        editorInitialValue: resolveUpdater(next, prev.editorInitialValue ?? ''),
      }));
    },
  };
}