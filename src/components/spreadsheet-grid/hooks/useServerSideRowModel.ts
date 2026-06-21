// serverSide(SSRM)の RowModel を供給するフックです(DS-4 ②)。
//
// 責務:
//   - クライアント側スパース LRU キャッシュ(serverSideCache)を保持し、RowModel シーム
//     (getRowCount / getRow / getSourceIndex / getRowKey)を serverSide 実装で供給します。
//   - 可視レンジ(requestRange)に対し、欠落ブロックだけを getRows で都度取得します
//     (computeBlockIndexes で必要ブロックを定数サイズに限定 → 取得範囲を縛りメモリを有界化)。
//   - スクロール debounce / in-flight 重複排除 / stale リクエストの AbortSignal キャンセル /
//     件数ブートストラップ(block 0 先行 fetch) / queryKey 変化での無効化 を担います。
//
// 設計メモ:
//   - getRow は cache の純読み(recency 不変)。可視帯の MRU 化は requestRange 内の touchBlocks で
//     明示的に行い、render が evict 順序を揺らさないようにします(serverSideCache の方針に整合)。
//   - getSourceIndex は恒等(viewIndex)。serverSide は view 順が正準で、別空間の source index を
//     持ちません。getRowKey は未ロード行で viewIndex を返し、スケルトン行の React key を安定させます。
//   - rowCount は state(縦ジオメトリ駆動の単一ソース)。getRows 結果の totalRowCount で最新化します。
//     非同期コールバックは rowCountRef(setRowCount と必ず対で更新)から最新件数を読みます。
//   - ブロック到着は version(state)の bump で再描画を促し、getRow が新データを拾います。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GridRowKey,
  RowModel,
  ServerSideDataSource,
  ServerSideQuery,
} from '../model/gridTypes';
import { createServerSideRowCache } from '../logic/serverSideCache';
import { computeBlockIndexes } from '../logic/serverSideBlocks';

// dataSource 側で未指定のときの既定値です。
const DEFAULT_BLOCK_SIZE = 100;
const DEFAULT_MAX_CACHED_BLOCKS = 64;
const DEFAULT_DEBOUNCE_MS = 120;

export type UseServerSideRowModelParams<T> = {
  // 変更(①-3): dataSource を optional 化しました。SpreadsheetGrid は本フックを無条件に
  //   呼ぶ(React Hooks 規則)ため、clientSide(dataSource 不在)では inert 動作にします。
  dataSource?: ServerSideDataSource<T>;
  rowKeyGetter: (row: T, index: number) => GridRowKey;
  query: ServerSideQuery;
  // query の同一性キーです。変化でキャッシュ無効化 + 再取得します(stage ① は安定値)。
  queryKey: string;
  debounceMs?: number;
};

export type UseServerSideRowModelResult<T> = {
  rowModel: RowModel<T>;
  rowCount: number;
  isRowLoaded: (viewIndex: number) => boolean;
  requestRange: (startIndex: number, endIndex: number) => void;
};

export function useServerSideRowModel<T>(
  params: UseServerSideRowModelParams<T>,
): UseServerSideRowModelResult<T> {
  const { dataSource, rowKeyGetter, query, queryKey } = params;
  // 変更(①-3): dataSource 不在(clientSide)でも安全に評価できるよう optional-chain します。
  //   inert 時は既定値で空キャッシュを作るだけで、書き込みも fetch も発生しません。
  const blockSize = dataSource?.blockSize ?? DEFAULT_BLOCK_SIZE;
  const maxBlocks = dataSource?.maxCachedBlocks ?? DEFAULT_MAX_CACHED_BLOCKS;
  const debounceMs = params.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  // スパース LRU キャッシュです。useState の遅延初期化で render をまたいで安定させます
  //   (blockSize / maxBlocks はフックの生存中は固定の想定)。
  const [cache] = useState(() =>
    createServerSideRowCache<T>({ blockSize, maxBlocks }),
  );

  const [rowCount, setRowCount] = useState<number>(
    dataSource?.initialRowCount ?? 0,
  );
  // ブロック到着を rowModel / consumer に伝える再描画トリガーです(値自体は読みません)。
  const [version, setVersion] = useState<number>(0);

  // 非同期コールバック(timer / promise)が最新 rowCount を読むための latest-ref です。
  //   setRowCount を呼ぶ箇所(下記 2 箇所)で必ず対で更新するため、render 中の書き込みは不要です。
  const rowCountRef = useRef<number>(rowCount);

  // in-flight な block fetch(blockIndex -> AbortController)です。重複排除とキャンセルに使います。
  const inFlightRef = useRef<Map<number, AbortController>>(new Map());
  // debounce タイマーと最新の要求レンジです。
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRangeRef = useRef<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });

  const fetchBlock = useCallback(
    (blockIndex: number): void => {
      // 追加(①-3): clientSide(inert)では取得しません。
      if (dataSource == null) {
        return;
      }
      if (cache.hasBlock(blockIndex) || inFlightRef.current.has(blockIndex)) {
        return;
      }
      const controller = new AbortController();
      inFlightRef.current.set(blockIndex, controller);

      const knownRowCount = rowCountRef.current;
      const startIndex = blockIndex * blockSize;
      const rawEnd = startIndex + blockSize;
      // 件数既知なら末端をクランプします。未知(ブートストラップ)なら blockSize まで投げ、
      //   結果の totalRowCount で件数を確定します。
      const endIndex =
        knownRowCount > 0 ? Math.min(rawEnd, knownRowCount) : rawEnd;

      dataSource
        .getRows({
          startIndex,
          endIndex,
          query,
          signal: controller.signal,
        })
        .then((result) => {
          if (controller.signal.aborted) {
            return;
          }
          // 自分が登録した controller でなければ(別世代に置換)結果を捨てます。
          if (inFlightRef.current.get(blockIndex) !== controller) {
            return;
          }
          inFlightRef.current.delete(blockIndex);
          cache.setBlock(blockIndex, result.rows);
          if (result.totalRowCount !== rowCountRef.current) {
            rowCountRef.current = result.totalRowCount;
            setRowCount(result.totalRowCount);
          }
          setVersion((value) => value + 1);
        })
        .catch(() => {
          // abort は無視します。その他エラーは in-flight を解放し、次の requestRange で再試行します。
          if (inFlightRef.current.get(blockIndex) === controller) {
            inFlightRef.current.delete(blockIndex);
          }
        });
    },
    [cache, blockSize, dataSource, query],
  );

  const runFetch = useCallback((): void => {
    const { start, end } = latestRangeRef.current;
    const needed = computeBlockIndexes(
      start,
      end,
      blockSize,
      rowCountRef.current,
    );
    const neededSet = new Set(needed);
    // 最新の必要集合に含まれない in-flight を中断します(スクロールで通り過ぎた帯の破棄)。
    for (const [blockIndex, controller] of inFlightRef.current) {
      if (!neededSet.has(blockIndex)) {
        controller.abort();
        inFlightRef.current.delete(blockIndex);
      }
    }
    for (const blockIndex of needed) {
      fetchBlock(blockIndex);
    }
  }, [blockSize, fetchBlock]);

  const scheduleFetch = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      runFetch();
    }, debounceMs);
  }, [debounceMs, runFetch]);

  const requestRange = useCallback(
    (startIndex: number, endIndex: number): void => {
      // 追加(①-3): clientSide(inert)では no-op です。
      if (dataSource == null) {
        return;
      }
      latestRangeRef.current = { start: startIndex, end: endIndex };
      // 可視帯を即時 MRU 化して退避から保護します(fetch は debounce 経由)。
      cache.touchBlocks(
        computeBlockIndexes(startIndex, endIndex, blockSize, rowCountRef.current),
      );
      scheduleFetch();
    },
    [cache, blockSize, dataSource, scheduleFetch],
  );

  // queryKey 変化(stage ② の filter/sort 変更)でキャッシュを無効化し、件数をリセットして
  //   再ブートストラップします。mount 時も走り、件数未知なら block 0 を先行 fetch します。
  useEffect(() => {
    // 追加(①-3): clientSide(inert)では何もしません(ブートストラップ/件数リセットを抑止し、
    //   clientSide 経路を完全不変に保ちます)。
    if (dataSource == null) {
      return;
    }
    // 進行中の取得を全て中断します。
    for (const [, controller] of inFlightRef.current) {
      controller.abort();
    }
    inFlightRef.current.clear();
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    cache.clear();
    const initial = dataSource.initialRowCount ?? 0;
    rowCountRef.current = initial;
    // queryKey 変化時に件数を初期値へ戻します(古い total を引きずらない)。mount 時は useState
    //   初期値と同値のため React が再描画を省きます。意図的な state リセットのため局所抑止します。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRowCount(initial);
    setVersion((value) => value + 1);
    // 件数未知なら block 0 を先行 fetch して totalRowCount を確定します(ブートストラップ)。
    //   既知(initialRowCount 指定)なら requestRange 駆動に委ねます。
    if (initial <= 0) {
      fetchBlock(0);
    }
    // queryKey 変化のみを再実行トリガーにします(fetchBlock/cache/dataSource は同 render で最新)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  // unmount クリーンアップ: in-flight abort + timer クリアです。
  useEffect(() => {
    // cleanup 実行時に ref が指し替わっている可能性を避けるため、Map 参照を退避します
    //   (inFlightRef.current は再代入されず .clear/.set/.delete のみのため退避で十分)。
    const inFlight = inFlightRef.current;
    const timer = timerRef;
    return () => {
      for (const [, controller] of inFlight) {
        controller.abort();
      }
      inFlight.clear();
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, []);

  const isRowLoaded = useCallback(
    (viewIndex: number): boolean => cache.getRow(viewIndex) !== undefined,
    [cache],
  );

  // RowModel シームの serverSide 実装です。order/rows ではなく cache を読みます。
  //   version を deps に含め、ブロック到着で参照を更新して consumer の再評価を促します。
  const rowModel = useMemo<RowModel<T>>(
    () => ({
      getRowCount: () => rowCountRef.current,
      // 未ロードは undefined(シーム契約どおり=clientSide の OOB と同じ)。型は T 固定のため
      //   キャストします(strictNullChecks 下で cache.getRow の | undefined を吸収)。
      getRow: (viewIndex) => cache.getRow(viewIndex) as T,
      getSourceIndex: (viewIndex) => viewIndex,
      getRowKey: (viewIndex) => {
        const row = cache.getRow(viewIndex);
        return row === undefined ? viewIndex : rowKeyGetter(row, viewIndex);
      },
    }),
    // version はブロック到着での再計算トリガーです(memo 本体は読まないため lint は不要と判定)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cache, rowKeyGetter, version],
  );

  return { rowModel, rowCount, isRowLoaded, requestRange };
}