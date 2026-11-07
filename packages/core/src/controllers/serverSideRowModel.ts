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
} from '../model/gridTypes.unbound';
import { createServerSideRowCache } from '../logic/serverSideCache';
import { computeBlockIndexes } from '../logic/serverSideBlocks';
import {
  buildServerSideRowUpdates,
  createServerSidePendingEdits,
  type ServerSideCellEditInput,
  type ServerSidePendingChange,
} from '../logic/serverSideEdits';
import { createValueStore } from '../logic/valueStore';
import { setCellValue } from '../utils/permissions';

const DEFAULT_BLOCK_SIZE = 100;
const DEFAULT_MAX_CACHED_BLOCKS = 64;
const DEFAULT_DEBOUNCE_MS = 120;
// 追加(dogfood DF-07): 保存中に取り直す(refresh / クエリ変化)とき、保存の決着を待つ上限(ms)。これを過ぎたら待たずに取り直します
//   (保存が返ってこないときに表がスケルトンのまま残らないように)。
export const SERVER_SIDE_WRITE_WAIT_MS = 3000;

export type ServerSideRowModelArgs<T> = {
  dataSource?: ServerSideDataSource<T>;
  rowKeyGetter: (row: T, index: number) => GridRowKey;
  query: ServerSideQuery;
  queryKey: string;
  refreshToken?: number;
  onLoadError?: (error: unknown, params: ServerSideLoadErrorParams) => void;
  onWriteError?: (error: unknown, params: ServerSideWriteErrorParams<T>) => void;
  debounceMs?: number;
  // 追加(motion-7 / M-9): 書き戻しのセル単位の状態通知(pending → ok | failed。refresh / クエリ変化で無効化された
  //   in-flight は cleared)。シェルが saveStatusController へ渡してセルに印を付けます。
  onWriteStateChange?: (event: ServerSideWriteStateEvent) => void;
};

// 追加(motion-7 / M-9): 書き戻し 1 回ぶんのセル集合と状態です。
export type ServerSideWriteStateEvent = {
  state: 'pending' | 'ok' | 'failed' | 'cleared';
  cells: ReadonlyArray<{ rowKey: GridRowKey; columnKeys: readonly string[] }>;
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
  // 変更(dogfood DF-07): 取り直し(refresh / クエリ変化)のたびに作り直します。保存中の書き込みは作ったときのものを持ち続け、
  //   決着の記録(どのセルの印を ok / failed にするか)だけに使います(行の位置は取り直しで意味が変わるので、表示には使わない)。
  let pendingEdits = createServerSidePendingEdits<T>();

  let rowCount = initial.dataSource?.initialRowCount ?? 0;
  let loadError: ServerSideLoadErrorState | null = null;
  let writeError: ServerSideWriteErrorState | null = null;
  let rowKeyGetterForModel = initial.rowKeyGetter;

  const inFlight = new Map<number, AbortController>();
  const failedBlocks = new Set<number>();
  // 追加(audit B-03): 件数が増えたときに「旧件数で末端だった部分ブロック」を入れておき、次に可視窓が
  //   求めたときに取り直します(取り直すまでは手元の行を表示し続ける)。キャッシュ済みでも fetchBlock は飛ばしません。
  const staleBlocks = new Set<number>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latestRange = { start: 0, end: 0 };
  let writeEpoch = 0;
  // 追加(dogfood DF-07): unmount(dispose)の世代。dispose の後に決着した書き込みは印を外すだけにします。
  let disposeEpoch = 0;
  // 追加(dogfood DF-07): 保存中の書き込み(updateRows の決着待ち)。取り直しはこれが決着するまで待ちます。
  const inFlightWrites = new Set<number>();
  let nextWriteToken = 1;
  // 取り直しを待っている書き込みと、待ち終わったら行う取り直し。null なら待っていない。
  let waitingWrites: Set<number> | null = null;
  let afterWrites: (() => void) | null = null;
  let writeWaitTimer: ReturnType<typeof setTimeout> | null = null;
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
    // 変更(dogfood DF-07): 保存中の書き込みは捨てずに決着を待ちます(古い位置の楽観行は表示しないので、新しく作り直す)。
    pendingEdits = createServerSidePendingEdits<T>();
    writeError = null;
  };

  // 追加(dogfood DF-07): 保存中に取り直すと、これまでは楽観値を捨て、取り直した行はサーバーへまだ反映していない古い値のまま、
  //   後で保存が成功しても無視され、失敗しても知らせていませんでした(「行を足して refreshServerSide()」の使い方で起きる)。
  //   そこで、取り直しの時点で保存中の書き込みが決着するまで(最大 SERVER_SIDE_WRITE_WAIT_MS)取得を待ちます(その間はスケルトン)。
  //   決着したら(成功ならサーバーに反映済みの)行を取り直し、失敗は保存失敗バーと onServerSideWriteError で知らせます。
  const clearWriteWait = () => {
    if (writeWaitTimer !== null) {
      clearTimeout(writeWaitTimer);
      writeWaitTimer = null;
    }
    waitingWrites = null;
    afterWrites = null;
  };
  const endWriteWait = () => {
    const run = afterWrites;
    clearWriteWait();
    run?.();
  };
  const fetchAfterWrites = (run: () => void) => {
    if (waitingWrites === null && inFlightWrites.size === 0) {
      run();
      return;
    }
    if (waitingWrites === null) {
      waitingWrites = new Set(inFlightWrites);
      writeWaitTimer = setTimeout(() => {
        writeWaitTimer = null;
        endWriteWait();
      }, SERVER_SIDE_WRITE_WAIT_MS);
    } else {
      for (const token of inFlightWrites) {
        waitingWrites.add(token);
      }
    }
    afterWrites = run;
  };
  const settleWriteToken = (token: number) => {
    inFlightWrites.delete(token);
    if (waitingWrites !== null && waitingWrites.delete(token) && waitingWrites.size === 0) {
      endWriteWait();
    }
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
    // 追加(dogfood DF-07): 保存の決着を待っている間は取りません(待ち終わったら取り直す)。
    if (waitingWrites !== null) {
      return;
    }
    if ((cache.hasBlock(blockIndex) && !staleBlocks.has(blockIndex)) || inFlight.has(blockIndex)) {
      return;
    }
    const controller = new AbortController();
    inFlight.set(blockIndex, controller);
    const startIndex = blockIndex * blockSize;
    const endIndex = startIndex + blockSize;

    // 変更(1.0 前の最終チェック FC-32): getRows が Promise を返す前に同期で throw しても、読み込みの失敗(エラーバー + 再試行)
    //   として扱います(これまでは例外がそのまま外へ出て、ブロックが取得中のまま残っていた)。
    new Promise<Awaited<ReturnType<typeof dataSource.getRows>>>((resolve) => {
      resolve(dataSource.getRows({ startIndex, endIndex, query, signal: controller.signal }));
    })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (inFlight.get(blockIndex) !== controller) {
          return;
        }
        inFlight.delete(blockIndex);
        cache.setBlock(blockIndex, result.rows);
        staleBlocks.delete(blockIndex);
        if (failedBlocks.delete(blockIndex)) {
          loadError = failedBlocks.size === 0 ? null : { failedBlockCount: failedBlocks.size };
        }
        if (result.totalRowCount !== rowCount) {
          // 修正(audit B-03): 件数が増えたら、旧件数の末端で途中までしか行の無いブロックを取り直し対象にします
          //   (キャッシュ済みのまま hasBlock で飛ばすと、伸びた後半の行がスケルトンのまま残っていた)。
          const tailBlock = Math.floor(rowCount / blockSize);
          if (
            result.totalRowCount > rowCount &&
            rowCount % blockSize !== 0 &&
            tailBlock !== blockIndex &&
            cache.hasBlock(tailBlock)
          ) {
            staleBlocks.add(tailBlock);
          }
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
      // 変更(監査 C-7): 失敗中のブロックはスクロール(可視窓の変化)では取り直しません。再取得は
      //   明示操作(エラーバーの再試行 / retryServerSideLoads() / refreshServerSide() / 条件変更)に限ります
      //   (従来は 1 行スクロールするたびに同じブロックを再要求し、onLoadError が連発していた。AG Grid と同じ方針)。
      if (failedBlocks.has(blockIndex)) {
        continue;
      }
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
    staleBlocks.clear();
    loadError = null;
    resetWriteState();
  };

  const refresh = (): void => {
    if (args.dataSource == null) {
      return;
    }
    resetCaches();
    bumpVersion();
    // 変更(dogfood DF-07): 保存中の書き込みがあれば、決着してから取り直します。
    fetchAfterWrites(() => {
      const { start, end } = latestRange;
      if (computeBlockIndexes(start, end, blockSize, rowCount).length === 0) {
        fetchBlock(0);
        return;
      }
      runFetch();
    });
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
    const lifetime = disposeEpoch;
    // 追加(dogfood DF-07): この書き込みの楽観行の置き場(取り直しで pendingEdits が作り直されても、決着はここで記録する)。
    const writeEdits = pendingEdits;
    const token = nextWriteToken;
    nextWriteToken += 1;
    inFlightWrites.add(token);
    // 変更(1.0 前の最終チェック FC-04 / FC-05): 書き込みごとにセルの変更を持たせます(確定値は変更のぶんだけ進め、失敗した
    //   変更は残りの保存中の変更を当て直して外す = serverSideEdits の settleWrite)。
    const changesByRow = new Map<number, ServerSidePendingChange<T>[]>();
    for (const edit of edits) {
      const list = changesByRow.get(edit.viewIndex);
      const change = { column: edit.column, value: edit.value };
      if (list) {
        list.push(change);
      } else {
        changesByRow.set(edit.viewIndex, [change]);
      }
    }
    const writes = updates.map((update) => ({
      viewIndex: update.rowIndex,
      rowKey: update.rowKey,
      writeId: writeEdits.beginWrite(update.rowIndex, update.row, changesByRow.get(update.rowIndex) ?? []),
    }));
    bumpVersion();
    // 追加(motion-7 / M-9): セル単位の保存状態(rowKey × 変更列)。
    const stateCells = updates.map((update) => ({
      rowKey: update.rowKey,
      columnKeys: update.changes.map((change) => change.columnKey),
    }));
    const notifyWriteState = (
      state: ServerSideWriteStateEvent['state'],
      cells: ServerSideWriteStateEvent['cells'] = stateCells,
    ) => {
      args.onWriteStateChange?.({ state, cells });
    };
    notifyWriteState('pending');

    // 変更(FC-32): updateRows が Promise を返す前に同期で throw しても、失敗(ロールバック + 失敗バー)として扱います。
    new Promise<Awaited<ReturnType<typeof updateRows>>>((resolve) => {
      resolve(updateRows({ updates }));
    })
      .then((result) => {
        if (disposeEpoch !== lifetime) {
          notifyWriteState('cleared');
          return;
        }
        // 変更(dogfood DF-07): 取り直した後に決着したとき(detached)は、行の位置が変わっているのでキャッシュへは書きません
        //   (取り直しは保存の決着を待つので、取り直した行にはサーバーの確定値が入る)。印は rowKey で付けます。
        const detached = writeEpoch !== epoch;
        const confirmedRows = result === undefined ? undefined : result.rows;
        // 変更(FC-05): 保存状態の印は、同じセルを変える新しい書き込みが保存中でないセルだけ ok にします(古い書き込みの完了で
        //   新しい書き込みの保存中の印が消えていた)。
        const settledCells = writes.map((write, index) => {
          const settlement = writeEdits.settleWrite(
            write.viewIndex,
            write.writeId,
            { ok: true, serverRow: confirmedRows?.[index] },
            detached ? undefined : cache.getRow(write.viewIndex),
          );
          if (!detached && settlement.confirmedRow !== undefined) {
            cache.updateRow(write.viewIndex, settlement.confirmedRow);
          }
          return { rowKey: write.rowKey, columnKeys: settlement.settledColumnKeys };
        });
        if (!detached) {
          bumpVersion();
        }
        notifyWriteState('ok', settledCells);
      })
      .catch((error: unknown) => {
        if (disposeEpoch !== lifetime) {
          notifyWriteState('cleared');
          return;
        }
        const detached = writeEpoch !== epoch;
        const settledCells = writes.map((write) => ({
          rowKey: write.rowKey,
          columnKeys: writeEdits.settleWrite(
            write.viewIndex,
            write.writeId,
            { ok: false },
            detached ? undefined : cache.getRow(write.viewIndex),
          ).settledColumnKeys,
        }));
        // 変更(dogfood DF-09): 同じセルを新しい書き込みが変えていた(上書き済みの)変更は、元に戻すものが無いので知らせません。
        //   これまでは値は新しいままなのに「値を元に戻しました」のバーが出て、onServerSideWriteError に古い値が渡っていました
        //   (書いてあるとおりに再送すると新しい値を古い値で上書きする)。知らせるのは、元に戻した変更だけです。
        //   変更(別視点のレビュー): 知らせる row は「今の表示の行 + 元に戻した変更」にします。この書き込みの row のままだと、
        //   上書き済みの列や同じ行の新しい書き込みで変えた列に古い値が残り、row を再送すると新しい値を巻き戻していました。
        //   取り直した後(detached)は行の位置が変わっているので、この書き込みの row のままにします。
        const rolledBack = updates.flatMap((update, index) => {
          const columnKeys = settledCells[index]?.columnKeys ?? [];
          if (columnKeys.length === 0) {
            return [];
          }
          const changes = update.changes.filter((change) => columnKeys.includes(change.columnKey));
          const current = detached ? undefined : getDisplayRow(update.rowIndex);
          if (current === undefined || args.rowKeyGetter(current, update.rowIndex) !== update.rowKey) {
            return [{ ...update, changes }];
          }
          let row: T = current;
          for (const change of changesByRow.get(update.rowIndex) ?? []) {
            if (columnKeys.includes(change.column.key)) {
              row = setCellValue(row, change.column, change.value);
            }
          }
          return [{ ...update, row, changes }];
        });
        if (rolledBack.length > 0) {
          writeError = { failedRowCount: rolledBack.length };
          args.onWriteError?.(error, { updates: rolledBack });
        }
        if (detached) {
          publish();
        } else {
          bumpVersion();
        }
        notifyWriteState('failed', settledCells);
      })
      .finally(() => {
        settleWriteToken(token);
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
      // 変更(dogfood DF-07): 保存中の書き込みがあれば、決着してから取り直します。待っている間のスクロールの要求は取らずに
      //   捨てているので、待った後は見えている範囲も取ります(block 0 だけだと、待っている間にスクロールした位置がスケルトンの
      //   まま残っていた)。runFetch は範囲外の取得中のブロックを止めるので、block 0 はその後に足します。待たないときは
      //   これまでどおり block 0 だけ(見えている範囲はこの後のスクロールの戻しで決まる)。
      const waits = waitingWrites !== null || inFlightWrites.size > 0;
      fetchAfterWrites(() => {
        if (waits && latestRange.end > latestRange.start) {
          runFetch();
        }
        fetchBlock(0);
      });
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

  // 追加(audit C-1): dispose 後に同じインスタンスへ update が来たとき(React StrictMode の
  //   effect 二重実行 = 生成 → dispose → 再接続)の取り直しです。dispose は in-flight を abort するため、
  //   initialRowCount 未指定だと初回 block 0 の取得が失われ、syncQueryKey は prevQueryKey 一致で
  //   no-op、件数 0 のため requestRange も空になり、グリッドが永久に空のままになっていました。
  let disposed = false;
  const resumeAfterDispose = () => {
    if (args.dataSource == null) {
      return;
    }
    // 件数未知で block 0 も無い = ブートストラップ取得が abort された → 取り直す。
    if (rowCount === 0 && !cache.hasBlock(0)) {
      fetchBlock(0);
    }
    // 可視レンジが確立済みなら取り直す(キャッシュ済み / in-flight のブロックは fetchBlock 側で重複排除)。
    if (latestRange.end > latestRange.start) {
      runFetch();
    }
  };

  const update = (next: ServerSideRowModelArgs<T>) => {
    args = next;
    if (next.rowKeyGetter !== rowKeyGetterForModel) {
      rowKeyGetterForModel = next.rowKeyGetter;
      bumpVersion();
    }
    syncQueryKey();
    syncRefreshToken();
    if (disposed) {
      disposed = false;
      resumeAfterDispose();
    }
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
      disposeEpoch += 1;
      pendingEdits.clear();
      // 追加(dogfood DF-07): 取り直しの待ちもやめます(保存中の書き込みは決着しても印を外すだけ)。
      clearWriteWait();
      inFlightWrites.clear();
      disposed = true;
    },
  };
};