// core の外部 store(createGridStore)を Solid の signal にします。React 版の hooks/useGridStore.ts
//   (useSyncExternalStore)にあたるものです。
//   - store の購読は onSettled の中で始めます(Solid 2.0 では部品の本体や計算の中で signal に書けないため。onSettled は書ける)。
//     購読の前に store が変わっていても、始めるときに 1 回写し直すので取りこぼしません。
//   - Solid 2.0 の書き込みはマイクロタスクでまとめて反映されます。コントローラは store を直接読むので(getState)、
//     signal の反映の遅れはコントローラの判断に影響しません。
import { createSignal, onSettled } from 'solid-js';
import type { GridStore, GridUiState, GridViewState } from '@ishibashi0112/spreadsheet-grid-core';

export function createGridStoreSignals(store: GridStore) {
  const [state, setState] = createSignal<GridUiState>(store.getState());
  const [view, setView] = createSignal<GridViewState>(store.getViewState());
  onSettled(() => {
    const sync = () => {
      setState(() => store.getState());
      setView(() => store.getViewState());
    };
    sync();
    return store.subscribe(sync);
  });
  return { state, view };
}