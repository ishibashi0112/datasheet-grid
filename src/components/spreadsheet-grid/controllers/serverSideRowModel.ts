// 追加(非依存化 ③-12): serverSide(SSRM)の RowModel を供給するコントローラです(React 非依存。
//   旧 hooks/useServerSideRowModel の本体を移設)。
//
// 責務:
//   - ブロック単位のスパースキャッシュ(logic/serverSideCache)と取得スケジューリング(debounce、
//     可視レンジ外の in-flight を abort、同一ブロックの重複排除、失敗ブロックの記録 / 再試行)。
//   - queryKey 変化 / refreshToken 変化 / refresh() でのキャッシュ破棄と再取得(件数は保持し、到着した
//     totalRowCount で更新)。
//   - セル編集の書き戻し(applyCellEdits): 楽観更新(pendingEdits)→ dataSource.updateRows → 成功で
//     キャッシュへ確定 / 失敗でロールバック + writeError。
//   - レンダー中に読む値(rowModel / rowCount / loadError / writeError)は ValueStore のスナップショットで
//     公開します。rowModel の参照は「データ到着 / 破棄 / 編集の決着 / rowKeyGetter 変化」で更新され、
//     下流の memo はこの参照変化で再計算します(旧 useMemo の version 依存と同じ契約)。
//   - update(args) はレンダー後に毎回呼ばれる前提(hooks/useController)。queryKey / refreshToken の変化
//     検出は旧 effect の deps と同じ規則で行います。dispose で in-flight を abort します。
import type {
  GridRowKey,
  RowModel,
  ServerSideDataSource,
  ServerSideLoadErrorParams,
  ServerSideQuery,
  ServerSideWriteErrorParams,
} from '../model/gridTypes';
import { createServerSideRowCache } from '../logic/serverSideCache';
import { computeBlockIndexes } from '../logic/serverSideBlocks';
import {
  buildServerSideRowUpdates,
  createServerSidePendingEdits,
  type ServerSideCellEditInput,
} from '../logic/serverSideEdits';
import { createValueStore } from '../logic/valueStore';

const DEFAULT_BLOCK_SIZE = 100;
const DEFAULT_MAX_CACHED_BLOCKS = 64;
const DEFAULT_DEBOUNCE_MS = 120;

export type ServerSideRowModelArgs<T> = {
  dataSource?: ServerSideDataSource<T>;
  rowKeyGetter: (row: T, index: number) => GridRowKey;
  query: ServerSideQuery;
  queryKey: string;
  refreshToken?: number;
  onLoadError?: (error: unknown, params: ServerSideLoadErrorParams) => void;
  onWriteError?: (error: unknown, params: ServerSideWriteErrorParams<T>) => void;
  debounceMs?: number;
};

export type ServerSideLoadErrorState = {
  failedBlockCount: number;
};

export type ServerSideWriteErrorState = {
  failedRowCount: number;
};

export type ServerSideRowModelSnapshot<T> = {
  rowModel: RowModel<T>;
  rowCount: number;
  loadError: ServerSideLoadErrorState | null;
  writeError: ServerSideWriteErrorState | null;
};

export type ServerSideRowModelController<T> = {
  update: (args: ServerSideRowModelArgs<T>) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ServerSideRowModelSnapshot<T>;
  isRowLoaded: (viewIndex: number) => boolean;
  requestRange: (startIndex: number, endIndex: number) => void;
  refresh: () => void;
  retryFailedBlocks: () => void;
  applyCellEdits: (edits: ServerSideCellEditInput<T>[]) => number;
  dispose: () => void;
};

export const createServerSideRowModel = <T,>(
  initial: ServerSideRowModelArgs<T>,
): ServerSideRowModelController<T> => {
  let args = initial;
  // キャッシュ構成は生成時の dataSource で確定します(旧 useState 初期化子と同じ)。
  const blockSize = initial.dataSource?.blockSize ?? DEFAULT_BLOCK_SIZE;
  const maxBlocks = initial.dataSource?.maxCachedBlocks ?? DEFAULT_MAX_CACHED_BLOCKS;
  const cache = createServerSideRowCache<T>({ blockSize, maxBlocks });
  const pendingEdits = createServerSidePendingEdits<T>();

  let rowCount = initial.dataSource?.initialRowCount ?? 0;
  let loadError: ServerSideLoadErrorState | null = null;
  let writeError: ServerSideWriteErrorState | null = null;
  let rowKeyGetterForModel = initial.rowKeyGetter;

  const inFlight = new Map<number, AbortController>();
  const failedBlocks = new Set<number>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latestRange = { start: 0, end: 0 };
  let writeEpoch = 0;
  let hasInitialized = false;
  let prevQueryKey: string | undefined;
  let prevRefreshToken = initial.refreshToken;

  const getDisplayRow = (viewIndex: number): T | undefined =>
    pendingEdits.getRow(viewIndex) ?? cache.getRow(viewIndex);

  const buildRowModel = (): RowModel<T> => ({
    getRowCount: () => rowCount,
    getRow: (viewIndex) => getDisplayRow(viewIndex) as T,
    getSourceIndex: (viewIndex) => viewIndex,
    getRowKey: (viewIndex) => {
      const row = getDisplayRow(viewIndex);
      return row === undefined ? viewIndex : rowKeyGetterForModel(row, viewIndex);
    },
  });
  let rowModel = buildRowModel();

  const store = createValueStore<ServerSideRowModelSnapshot<T>>({
    rowModel,
    rowCount,
    loadError,
    writeError,
  });
  // フィールドがいずれも同一参照なら通知しません(旧 setState の bail-out 相当)。
  const publish = () => {
    const prev = store.getSnapshot();
    if (
      prev.rowModel === rowModel &&
      prev.rowCount === rowCount &&
      prev.loadError === loadError &&
      prev.writeError === writeError
    ) {
      return;
    }
    store.setSnapshot({ rowModel, rowCount, loadError, writeError });
  };
  // データの到着 / 破棄 / 編集の決着で rowModel の参照を更新します(旧 version++ 相当)。
  const bumpVersion = () => {
    rowModel = buildRowModel();
    publish();
  };

  const resetWriteState = () => {
    writeEpoch += 1;
    pendingEdits.clear();
    writeError = null;
  };

  const syncLoadError = () => {
    const size = failedBlocks.size;
    if (size === 0) {
      loadError = null;
    } else {
      loadError = { failedBlockCount: size };
    }
    publish();
  };

  const abortAll = () => {
    for (const [, controller] of inFlight) {
      controller.abort();
    }
    inFlight.clear();
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const fetchBlock = (blockIndex: number): void => {
    const { dataSource, query } = args;
    if (dataSource == null) {
      return;
    }
    if (cache.hasBlock(blockIndex) || inFlight.has(blockIndex)) {
      return;
    }
    const controller = new AbortController();
    inFlight.set(blockIndex, controller);
    const startIndex = blockIndex * blockSize;
    const endIndex = startIndex + blockSize;

    dataSource
      .getRows({ startIndex, endIndex, query, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (inFlight.get(blockIndex) !== controller) {
          return;
        }
        inFlight.delete(blockIndex);
        cache.setBlock(blockIndex, result.rows);
        if (failedBlocks.delete(blockIndex)) {
          loadError = failedBlocks.size === 0 ? null : { failedBlockCount: failedBlocks.size };
        }
        if (result.totalRowCount !== rowCount) {
          rowCount = result.totalRowCount;
        }
        bumpVersion();
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (inFlight.get(blockIndex) === controller) {
          inFlight.delete(blockIndex);
          failedBlocks.add(blockIndex);
          syncLoadError();
          args.onLoadError?.(error, { startIndex, endIndex });
        }
      });
  };

  const runFetch = (): void => {
    const { start, end } = latestRange;
    const needed = computeBlockIndexes(start, end, blockSize, rowCount);
    const neededSet = new Set(needed);
    for (const [blockIndex, controller] of inFlight) {
      if (!neededSet.has(blockIndex)) {
        controller.abort();
        inFlight.delete(blockIndex);
      }
    }
    for (const blockIndex of needed) {
      fetchBlock(blockIndex);
    }
  };

  const scheduleFetch = (): void => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      runFetch();
    }, args.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  };

  const requestRange = (startIndex: number, endIndex: number): void => {
    if (args.dataSource == null) {
      return;
    }
    latestRange = { start: startIndex, end: endIndex };
    cache.touchBlocks(computeBlockIndexes(startIndex, endIndex, blockSize, rowCount));
    scheduleFetch();
  };

  // キャッシュ破棄 + 失敗 / 書き戻し状態のクリア(queryKey 変化と refresh() の共通部)。
  const resetCaches = () => {
    abortAll();
    clearTimer();
    cache.clear();
    failedBlocks.clear();
    loadError = null;
    resetWriteState();
  };

  const refresh = (): void => {
    if (args.dataSource == null) {
      return;
    }
    resetCaches();
    bumpVersion();
    const { start, end } = latestRange;
    if (computeBlockIndexes(start, end, blockSize, rowCount).length === 0) {
      fetchBlock(0);
      return;
    }
    runFetch();
  };

  const retryFailedBlocks = (): void => {
    if (args.dataSource == null || failedBlocks.size === 0) {
      return;
    }
    const blocks = Array.from(failedBlocks);
    failedBlocks.clear();
    syncLoadError();
    for (const blockIndex of blocks) {
      fetchBlock(blockIndex);
    }
  };

  const applyCellEdits = (edits: ServerSideCellEditInput<T>[]): number => {
    const updateRows = args.dataSource?.updateRows;
    if (updateRows === undefined || edits.length === 0) {
      return 0;
    }
    const updates = buildServerSideRowUpdates(edits, getDisplayRow, args.rowKeyGetter);
    if (updates.length === 0) {
      return 0;
    }
    const epoch = writeEpoch;
    const writes = updates.map((update) => ({
      viewIndex: update.rowIndex,
      row: update.row,
      writeId: pendingEdits.beginWrite(update.rowIndex, update.row),
    }));
    bumpVersion();

    updateRows({ updates })
      .then((result) => {
        if (writeEpoch !== epoch) {
          return;
        }
        const confirmedRows = result === undefined ? undefined : result.rows;
        writes.forEach((write, index) => {
          cache.updateRow(write.viewIndex, confirmedRows?.[index] ?? write.row);
          pendingEdits.settleWrite(write.viewIndex, write.writeId);
        });
        bumpVersion();
      })
      .catch((error: unknown) => {
        if (writeEpoch !== epoch) {
          return;
        }
        for (const write of writes) {
          pendingEdits.settleWrite(write.viewIndex, write.writeId);
        }
        writeError = { failedRowCount: updates.length };
        args.onWriteError?.(error, { updates });
        bumpVersion();
      });
    return updates.length;
  };

  // queryKey の変化(旧 useEffect([queryKey])): 初回も含めて実行。dataSource 未設定なら何もしない。
  const syncQueryKey = () => {
    if (prevQueryKey !== undefined && prevQueryKey === args.queryKey) {
      return;
    }
    prevQueryKey = args.queryKey;
    const { dataSource } = args;
    if (dataSource == null) {
      return;
    }
    resetCaches();
    const isFirstRun = !hasInitialized;
    hasInitialized = true;
    bumpVersion();
    if (isFirstRun) {
      if ((dataSource.initialRowCount ?? 0) <= 0) {
        fetchBlock(0);
      }
    } else {
      fetchBlock(0);
    }
  };

  // refreshToken の変化(旧 useEffect([refreshToken])): 初回マウントと undefined は no-op。
  const syncRefreshToken = () => {
    const token = args.refreshToken;
    if (args.dataSource == null || token === undefined) {
      prevRefreshToken = token;
      return;
    }
    if (prevRefreshToken === undefined) {
      prevRefreshToken = token;
      return;
    }
    if (prevRefreshToken === token) {
      return;
    }
    prevRefreshToken = token;
    refresh();
  };

  const update = (next: ServerSideRowModelArgs<T>) => {
    args = next;
    if (next.rowKeyGetter !== rowKeyGetterForModel) {
      rowKeyGetterForModel = next.rowKeyGetter;
      bumpVersion();
    }
    syncQueryKey();
    syncRefreshToken();
  };

  return {
    update,
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    isRowLoaded: (viewIndex) => getDisplayRow(viewIndex) !== undefined,
    requestRange,
    refresh,
    retryFailedBlocks,
    applyCellEdits,
    dispose: () => {
      abortAll();
      clearTimer();
      writeEpoch += 1;
      pendingEdits.clear();
    },
  };
};