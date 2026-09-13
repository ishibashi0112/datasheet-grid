// 追加(非依存化 ③-9): 単一値の購読可能ストアです(React 非依存)。コントローラが「レンダー中に読む値」
//   (autosize 中フラグ / 非同期収集の進捗など)を公開する共通形で、React は useSyncExternalStore に
//   subscribe / getSnapshot をそのまま渡し、Solid は subscribe から signal を作ります。
//   setSnapshot は Object.is で同値なら通知しません(無駄な再描画を避ける)。
export type ValueStore<S> = {
  getSnapshot: () => S;
  setSnapshot: (next: S) => void;
  subscribe: (listener: () => void) => () => void;
};

export const createValueStore = <S,>(initial: S): ValueStore<S> => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    setSnapshot: (next) => {
      if (Object.is(next, value)) {
        return;
      }
      value = next;
      for (const listener of Array.from(listeners)) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};