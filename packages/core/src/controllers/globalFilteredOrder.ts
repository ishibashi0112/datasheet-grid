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
  // 追加(1.0.1 / AP-19): 行(オブジェクト)ごとの判定の控えです(検索語と列が同じ間だけ)。rows が差し替わっても同じ行の
  //   オブジェクトは判定し直さないので、行を足しただけのやり直しは足した行の判定だけで済みます。
  let matchCache: { columns: GridColumn<T>[]; needle: string; byRow: WeakMap<object, boolean> } | null = null;
  const cacheFor = (columns: GridColumn<T>[], needle: string): WeakMap<object, boolean> => {
    if (matchCache === null || matchCache.columns !== columns || matchCache.needle !== needle) {
      matchCache = { columns, needle, byRow: new WeakMap() };
    }
    return matchCache.byRow;
  };

  const start = (args: GlobalFilteredOrderArgs<T>) => {
    const key: GlobalFilterKey<T> = {
      rows: args.rows,
      baseOrder: args.baseOrder,
      columns: args.columns,
      needle: args.needle,
    };
    const length = key.baseOrder.length;
    const buffer = new Int32Array(length);
    const byRow = cacheFor(key.columns, key.needle);
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
        let matched: boolean | undefined;
        if (typeof row === 'object' && row !== null) {
          matched = byRow.get(row);
          if (matched === undefined) {
            matched = rowMatchesGlobalText(row, key.columns, key.needle);
            byRow.set(row, matched);
          }
        } else {
          matched = rowMatchesGlobalText(row, key.columns, key.needle);
        }
        if (matched) {
          buffer[count] = sourceIndex;
          count += 1;
        }
      },
      {
        isCancelled: () => cancelled,
        onYield: (done, total) => {
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
      store.setSnapshot({
        ...store.getSnapshot(),
        ready: { ...key, order, rowsLength: key.rows.length },
      });
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