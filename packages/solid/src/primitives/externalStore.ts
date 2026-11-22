// core の外部 store({ subscribe, getSnapshot }。OS の配色 / 視差効果を減らす設定)を Solid の signal にします。
//   React 版の useSyncExternalStore にあたるもの。購読は onSettled の中で始めます(Solid 2.0 は部品の本体で signal に
//   書けないため)。始めるときに 1 回読み直すので、それまでの変化も取りこぼしません。
//   変更(段階 4 の測り直し R4-1): サーバーで描いた HTML をハイドレーションしている間は、サーバーと同じ値
//   (getServerSnapshot。OS の配色はライト、視差効果を減らす設定は無し)から始めます。Solid はハイドレーションで
//   サーバーの要素の class や文字を書き直さないので、クライアントの値から始めると、購読を始めたときに読み直しても値が
//   変わらず、theme="auto" と motion の auto がサーバーの HTML のまま(ライト・動きあり)残っていました。React 版の
//   useSyncExternalStore も、ハイドレーションでは getServerSnapshot で描いてから今の値で描き直します。
import { createSignal, isHydrating } from 'solid-js';
import { onGridMounted } from './mountGate';

export type ExternalStoreLike<V> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => V;
  // サーバーで描くときの値(ハイドレーションの間もこの値から始める)。無ければ getSnapshot と同じ。
  getServerSnapshot?: () => V;
};

// 値は関数でないもの(createSignal は関数を渡すと計算の signal として扱うため。core の外部 store は真偽値)。
//   name は signal の名前(Solid の開発用の計測が console へ知らせを出すときに、どの store かが分かるように。
//   docs/solid/README.md「開発ビルドで Solid が出す知らせ」)。
export function createExternalStoreSignal<V>(store: ExternalStoreLike<V>, name?: string): () => V {
  const initial = isHydrating() && store.getServerSnapshot ? store.getServerSnapshot() : store.getSnapshot();
  const [value, setValue] = createSignal<V>(initial as never, name === undefined ? undefined : { name });
  onGridMounted(() => {
    setValue(() => store.getSnapshot());
    return store.subscribe(() => setValue(() => store.getSnapshot()));
  });
  return value;
}