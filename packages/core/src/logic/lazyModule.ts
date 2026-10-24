// 追加(lazy-popups): 動的 import で読み込む部品の読み込み状態を持つ購読可能ストアです(React 非依存)。
//   開いたときにだけ要る部品(列フィルターポップオーバー / ツールパネル)を別チャンクへ分けるために使います。
//   - load(): loader を 1 回だけ呼び、解決したら値を保持して購読者へ通知します(読み込み中の重複呼び出しは
//     同じ Promise を返す)。失敗したら保留中の Promise を捨て、次の load() で読み直せるようにします
//     (チャンク取得の一時的な失敗を想定)。
//   - getSnapshot(): 読み込み済みならその値、まだなら null。React は useSyncExternalStore に
//     subscribe / getSnapshot を渡し、読み込み完了でシェルごと再描画します。
import { createValueStore } from './valueStore';

export type LazyModule<M> = {
  getSnapshot: () => M | null;
  subscribe: (listener: () => void) => () => void;
  load: () => Promise<M>;
};

export const createLazyModule = <M,>(loader: () => Promise<M>): LazyModule<M> => {
  const store = createValueStore<M | null>(null);
  let pending: Promise<M> | null = null;

  const load = (): Promise<M> => {
    const loaded = store.getSnapshot();
    if (loaded !== null) {
      return Promise.resolve(loaded);
    }
    if (pending === null) {
      pending = loader().then(
        (value) => {
          store.setSnapshot(value);
          return value;
        },
        (error: unknown) => {
          pending = null;
          throw error;
        },
      );
    }
    return pending;
  };

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    load,
  };
};