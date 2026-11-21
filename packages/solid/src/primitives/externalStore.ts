// core の外部 store({ subscribe, getSnapshot }。OS の配色 / 視差効果を減らす設定)を Solid の signal にします。
//   React 版の useSyncExternalStore にあたるもの。購読は onSettled の中で始めます(Solid 2.0 は部品の本体で signal に
//   書けないため)。始めるときに 1 回読み直すので、それまでの変化も取りこぼしません。
import { createSignal, onSettled } from 'solid-js';

export type ExternalStoreLike<V> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => V;
};

// 値は関数でないもの(createSignal は関数を渡すと計算の signal として扱うため。core の外部 store は真偽値)。
//   name は signal の名前(Solid の開発用の計測が console へ知らせを出すときに、どの store かが分かるように。
//   docs/solid/README.md「開発ビルドで Solid が出す知らせ」)。
export function createExternalStoreSignal<V>(store: ExternalStoreLike<V>, name?: string): () => V {
  const [value, setValue] = createSignal<V>(store.getSnapshot() as never, name === undefined ? undefined : { name });
  onSettled(() => {
    setValue(() => store.getSnapshot());
    return store.subscribe(() => setValue(() => store.getSnapshot()));
  });
  return value;
}