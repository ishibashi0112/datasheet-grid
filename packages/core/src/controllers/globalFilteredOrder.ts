// 追加(非依存化 ③-11): グローバルフィルターの行順(order)を求めるランナーです(React 非依存。
//   旧 hooks/useGlobalFilteredOrder の本体を移設)。
//   - 同期経路(フィルター無し / 閾値以下)は純関数 resolveSyncGlobalFilteredOrder で、アダプタが
//     レンダー中に(memo して)計算します。入力テキストの遅延(useDeferredValue)は React 固有なので
//     アダプタ側に残し、遅延後のテキストを受け取ります。
//   - 非同期経路(閾値超)はコントローラが runChunked で時間分割し、進捗 / 完了を ValueStore で公開
//     します。update(args) でキー(rows / baseOrder / columns / needle / needsAsync)が変わったら
//     in-flight を中断し、必要なら再開します(旧 effect の deps と cleanup に相当)。
//   - 結果の合成(同期 → 完了 → 計算中フォールバック)は純関数 selectGlobalFilteredOrderResult で、
//     計算中は「直前の完了結果(行数が同じ場合)または baseOrder」を返して order 参照を安定させます。
import type { GlobalFilterStatus, GridColumn } from '../model/gridTypes.unbound';
import { runChunked } from '../logic/chunkedLoop';
import { createValueStore } from '../logic/valueStore';
import {
  filterOrderByGlobalText,
  rowMatchesGlobalText,
  type RowOrder,
} from '../logic/filtering';

// これ以下の行数は同期一括でフィルターします(従来どおり memo で即 ready)。
export const ASYNC_GLOBAL_FILTER_ROW_THRESHOLD = 50_000;

export type GlobalFilteredOrderResult = {
  order: RowOrder;
  status: GlobalFilterStatus;
  progress: number;
};

export type GlobalFilterKey<T> = {
  rows: T[];
  baseOrder: RowOrder;
  columns: GridColumn<T>[];
  // 正規化済み(trim + 小文字)の検索語。
  needle: string;
};

// 同期経路の解決。null = 非同期が必要(フィルター有効かつ閾値超)。deferredText は遅延後の生テキスト。
export const resolveSyncGlobalFilteredOrder = <T,>(
  key: GlobalFilterKey<T>,
  deferredText: string,
  enabled: boolean,
): GlobalFilteredOrderResult | null => {
  const hasFilter = enabled && key.needle.length > 0;
  if (!hasFilter) {
    return { order: key.baseOrder, status: 'idle', progress: 1 };
  }
  if (key.rows.length <= ASYNC_GLOBAL_FILTER_ROW_THRESHOLD) {
    return {
      order: filterOrderByGlobalText(key.rows, key.baseOrder, key.columns, deferredText),
      status: 'ready',
      progress: 1,
    };
  }
  return null;
};

export type GlobalFilteredOrderArgs<T> = GlobalFilterKey<T> & {
  needsAsync: boolean;
};

type ReadyState<T> = GlobalFilterKey<T> & { order: RowOrder; rowsLength: number };
type ProgressState<T> = GlobalFilterKey<T> & { progress: number };

export type GlobalFilteredOrderSnapshot<T> = {
  ready: ReadyState<T> | null;
  progress: ProgressState<T> | null;
};

const sameKey = <T,>(a: GlobalFilterKey<T>, b: GlobalFilterKey<T>): boolean =>
  a.rows === b.rows &&
  a.baseOrder === b.baseOrder &&
  a.columns === b.columns &&
  a.needle === b.needle;

// 前の rows の行が今の rows の同じ位置にあるらしいか(末尾に足した / その場で書き換えた。先頭と末尾の行で見る)。
const isSameRowsPrefix = <T,>(ready: ReadyState<T>, key: GlobalFilterKey<T>): boolean => {
  const length = ready.rowsLength;
  if (length === 0 || length > key.rows.length) {
    return false;
  }
  return ready.rows[0] === key.rows[0] && ready.rows[length - 1] === key.rows[length - 1];
};

const isSameOrder = (a: RowOrder, b: RowOrder): boolean => {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
};

// 結果の合成(旧 hook の render 末尾と同じ規則)。
// 変更(1.0.1 / 2026-11-09 実アプリの総点検 AP-19): 検索語と列が同じで行だけが変わった(rows がよく変わる表)ときは、
//   直前の完了結果をそのまま「済み」として出します(末尾に足した / その場で書き換えただけなら元の行の位置は変わらない。
//   先頭と末尾の行が同じ位置に無いときはこれまでどおり)。これまでは行数が変わると全行(baseOrder)の「適用中」になり、毎秒行を足す 100 万行の表では
//   絞り込まれた表がいつまでも出なかった。やり直しは行ごとの結果の控え(下の runner)で短く済みます。
export const selectGlobalFilteredOrderResult = <T,>(
  syncResult: GlobalFilteredOrderResult | null,
  snapshot: GlobalFilteredOrderSnapshot<T>,
  key: GlobalFilterKey<T>,
): GlobalFilteredOrderResult => {
  if (syncResult) {
    return syncResult;
  }
  const { ready, progress } = snapshot;
  if (ready !== null && sameKey(ready, key)) {
    return { order: ready.order, status: 'ready', progress: 1 };
  }
  if (ready !== null && ready.needle === key.needle && ready.columns === key.columns && isSameRowsPrefix(ready, key)) {
    return { order: ready.order, status: 'ready', progress: 1 };
  }
  const fallbackOrder =
    ready !== null && ready.rowsLength === key.rows.length ? ready.order : key.baseOrder;
  const progressValue =
    progress !== null && sameKey(progress, key) ? progress.progress : 0;
  return { order: fallbackOrder, status: 'filtering', progress: progressValue };
};

export type GlobalFilteredOrderRunner<T> = {
  update: (args: GlobalFilteredOrderArgs<T>) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => GlobalFilteredOrderSnapshot<T>;
  dispose: () => void;
};

export const createGlobalFilteredOrderRunner = <T,>(): GlobalFilteredOrderRunner<T> => {
  const store = createValueStore<GlobalFilteredOrderSnapshot<T>>({ ready: null, progress: null });
  let current: GlobalFilteredOrderArgs<T> | null = null;
  let cancelCurrent: (() => void) | null = null;
  // 追加(1.0.1 / AP-19): 行ごとの判定の控えです(検索語と列が同じ間だけ)。rows が差し替わっても、同じ位置に同じ行
  //   (オブジェクト)があれば判定し直さないので、行を足しただけのやり直しは足した行の判定だけで済みます。
  //   変更(1.0.1 の確かめ直し G): 控えを WeakMap から「rows の位置ごとの結果」(Uint8Array。0 = まだ、1 = 外れ、2 = 当たり)に
  //   しました。WeakMap へ 100 万行を書くと、初めての絞り込みが 1.0.0 より 3〜5 割遅くなっていたため。走りの途中で
  //   止められても(rows がよく変わる表)、そこまでの結果を次の走りで使えるように、走り始めに控えを差し替えます。
  type MatchMemo = { rows: readonly unknown[]; results: Uint8Array };
  let matchCache: { columns: GridColumn<T>[]; needle: string; memo: MatchMemo } | null = null;

  // 変更(1.0.1 のレビュー RB-3): 控えから返した行があった走査(fresh でない)の後は、控えを使わずに 1 回走査し直して確かめます
  //   (fresh)。行のオブジェクトをその場で書き換えて新しい配列を渡す使い方では、同じオブジェクトの控えが古く、検索語を
  //   変えるまで古い結果のままだった。控えの結果はすぐ「済み」で出し、確かめた結果が違えば差し替えます(確かめの走査は進捗を
  //   出しません)。確かめた走査の控えを次の控えにします。
  const start = (args: GlobalFilteredOrderArgs<T>, fresh = false) => {
    const key: GlobalFilterKey<T> = {
      rows: args.rows,
      baseOrder: args.baseOrder,
      columns: args.columns,
      needle: args.needle,
    };
    const length = key.baseOrder.length;
    const buffer = new Int32Array(length);
    const previous =
      !fresh && matchCache !== null && matchCache.columns === key.columns && matchCache.needle === key.needle
        ? matchCache.memo
        : null;
    const previousRows = previous?.rows;
    const previousResults = previous?.results;
    // 控えの結果の数まで(同じ配列をその場で伸ばした場合も、控えの無い位置は調べ直す)。
    const previousLength = previousResults?.length ?? 0;
    const memo: MatchMemo = { rows: key.rows, results: new Uint8Array(key.rows.length) };
    const results = memo.results;
    if (!fresh) {
      matchCache = { columns: key.columns, needle: key.needle, memo };
    }
    let cacheHits = 0;
    let count = 0;
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
    };
    cancelCurrent = cancel;
    void runChunked(
      length,
      (pos) => {
        const sourceIndex = key.baseOrder[pos];
        const row = key.rows[sourceIndex];
        let result = 0;
        if (sourceIndex < previousLength && previousRows![sourceIndex] === row) {
          result = previousResults![sourceIndex];
        }
        if (result === 0) {
          result = rowMatchesGlobalText(row, key.columns, key.needle) ? 2 : 1;
        } else {
          cacheHits += 1;
        }
        results[sourceIndex] = result;
        if (result === 2) {
          buffer[count] = sourceIndex;
          count += 1;
        }
      },
      {
        isCancelled: () => cancelled,
        onYield: (done, total) => {
          if (fresh) {
            return;
          }
          store.setSnapshot({
            ...store.getSnapshot(),
            progress: { ...key, progress: done / total },
          });
        },
      },
    ).then((completed) => {
      // 追加(audit C-11): 走り切った run は「走っている run」から外します(dispose で current を忘れる判定に使う)。
      if (cancelCurrent === cancel) {
        cancelCurrent = null;
      }
      if (!completed) {
        return;
      }
      const order = count === length ? key.baseOrder : buffer.slice(0, count);
      const ready = store.getSnapshot().ready;
      if (fresh) {
        matchCache = { columns: key.columns, needle: key.needle, memo };
      }
      // 確かめた結果が控えの結果と同じなら、参照を変えずに済ませます(描き直さない)。
      if (!(fresh && ready !== null && sameKey(ready, key) && isSameOrder(ready.order, order))) {
        store.setSnapshot({
          ...store.getSnapshot(),
          ready: { ...key, order, rowsLength: key.rows.length },
        });
      }
      if (!fresh && cacheHits > 0 && current !== null && current.needsAsync && sameKey(current, key)) {
        start(current, true);
      }
    });
  };

  const update = (args: GlobalFilteredOrderArgs<T>) => {
    const keyChanged =
      current === null ||
      current.needsAsync !== args.needsAsync ||
      !sameKey(current, args);
    current = args;
    if (!keyChanged) {
      return;
    }
    cancelCurrent?.();
    cancelCurrent = null;
    if (args.needsAsync) {
      start(args);
      return;
    }
    // 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-20): 同期の経路(検索語を消した / 閾値以下)の結果を出している間は、
    //   前の完了結果を忘れます。「A → 消す → B」で B の計算中に、消した A の結果が出ていた(計算中は直前の結果を出すため)。
    matchCache = null;
    const snapshot = store.getSnapshot();
    if (snapshot.ready !== null) {
      store.setSnapshot({ ...snapshot, ready: null });
    }
  };

  return {
    update,
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    // 修正(audit C-11): 走っている run を中断したときは前回の args も忘れます。StrictMode の擬似アンマウント →
    //   再マウントで同じ args の update が来たとき、keyChanged=false で再開されず進捗が固着するのを防ぎます。
    //   走り切った後の dispose では args を保持します(同じ args で計算し直さない)。
    dispose: () => {
      if (cancelCurrent !== null) {
        cancelCurrent();
        cancelCurrent = null;
        current = null;
      }
    },
  };
};