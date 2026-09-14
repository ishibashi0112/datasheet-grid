// 追加(本体分解 E-2): 「live 値を静止後に一度だけ反映する」購読可能ストアです(React 非依存)。
//   旧 SpreadsheetGrid.tsx の serverSide query debounce(useState × 2 + setTimeout effect)の置き換えで、
//   update({ value, enabled }) は旧 effect の deps(値 / enabled)が変わったときだけタイマーを張り直します。
//   enabled=false(clientSide)では反映しません(snapshot は初期値のまま)。dispose でタイマーを止めます。
import { createValueStore } from '../logic/valueStore';

export type DebouncedValueArgs<V> = { value: V; enabled: boolean };

export type DebouncedValueStore<V> = {
  update: (args: DebouncedValueArgs<V>) => void;
  getSnapshot: () => V;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
};

export const createDebouncedValueStore = <V,>(initial: V, delayMs: number): DebouncedValueStore<V> => {
  const store = createValueStore(initial);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last: DebouncedValueArgs<V> | null = null;
  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    update: ({ value, enabled }) => {
      if (last !== null && Object.is(last.value, value) && last.enabled === enabled) {
        return;
      }
      last = { value, enabled };
      clear();
      if (!enabled) {
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        store.setSnapshot(value);
      }, delayMs);
    },
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    dispose: clear,
  };
};