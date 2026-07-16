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
  // 追加(stage ③): ソフトリフレッシュ用トークン。値の変化で「query 不変のまま」キャッシュを
  //   破棄し可視レンジを取り直します(queryKey 無効化とは独立。未指定/clientSide では inert)。
  refreshToken?: number;
  // 追加(batch 9): getRows 失敗(abort 以外の reject)の通知です。latest-ref 経由で読むため
  //   毎レンダーで新しい関数が渡されても fetch 系 callback は再生成されません。
  onLoadError?: (error: unknown, params: ServerSideLoadErrorParams) => void;
  // 追加(書き戻し): updateRows 失敗(グリッド側はロールバック済み)の通知です。latest-ref 経由。
  onWriteError?: (error: unknown, params: ServerSideWriteErrorParams<T>) => void;
  debounceMs?: number;
};

// 追加(batch 9): getRows 失敗の集約状態です(グリッド内蔵エラーバーの表示用)。
//   failedBlockCount は現在失敗中(未回復)のブロック数。失敗集合が変わるたびに新しい
//   オブジェクト参照になります(UI 側は参照比較で「閉じる」後の再表示を判定します)。
export type ServerSideLoadErrorState = {
  failedBlockCount: number;
};

// 追加(書き戻し): updateRows 失敗の状態です(グリッド内蔵の失敗バー表示用)。
//   failedRowCount は直近の失敗イベントで失敗した行数(ロールバック済み)です。失敗のたびに
//   新しい参照を発行します(UI 側は参照比較で「閉じる」後の再表示を判定 = loadError と同じ契約)。
export type ServerSideWriteErrorState = {
  failedRowCount: number;
};

export type UseServerSideRowModelResult<T> = {
  rowModel: RowModel<T>;
  rowCount: number;
  isRowLoaded: (viewIndex: number) => boolean;
  requestRange: (startIndex: number, endIndex: number) => void;
  // 追加(batch 8): ソフトリフレッシュの命令的口です。refreshToken 変化と同一の挙動
  //   (クエリ不変のままキャッシュ破棄 + 可視レンジ即時取り直し)を、ハンドル
  //   refreshServerSide() から直接呼べるようにします。clientSide(inert)では no-op。
  refresh: () => void;
  // 追加(batch 9): 現在失敗中のブロックがあるときの集約状態です(なければ null)。
  loadError: ServerSideLoadErrorState | null;
  // 追加(batch 9): 失敗中ブロックだけを再取得します(キャッシュ済みブロックは触りません =
  //   refresh() のような全破棄はしない)。失敗が無ければ no-op。
  retryFailedBlocks: () => void;
  // 追加(書き戻し): dataSource.updateRows が指定されているか(SSRM でのセル編集の有効判定)。
  canUpdateRows: boolean;
  // 追加(書き戻し): セル編集の書き戻し(楽観更新つき)です。edits はパース済みドメイン値で渡し、
  //   未ロード行(スケルトン)はスキップします。発行した行更新の件数を返します。
  applyCellEdits: (edits: ServerSideCellEditInput<T>[]) => number;
  // 追加(書き戻し): 直近の updateRows 失敗です(なければ null / clientSide では常に null)。
  writeError: ServerSideWriteErrorState | null;
};

export function useServerSideRowModel<T>(
  params: UseServerSideRowModelParams<T>,
): UseServerSideRowModelResult<T> {
  const {
    dataSource,
    rowKeyGetter,
    query,
    queryKey,
    refreshToken,
    onLoadError,
    onWriteError,
  } = params;
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
  //   setRowCount を呼ぶ箇所(fetchBlock の .then)で必ず対で更新するため、render 中の書き込みは不要です。
  const rowCountRef = useRef<number>(rowCount);

  // 追加(stage ②): 初回 mount を識別するフラグです。queryKey effect は mount でも走るため、
  //   initialRowCount(即時スクロールバー)を初回だけ適用し、再クエリ時は前回件数を保持して
  //   block 0 到着で件数を更新する分岐に使います(下の queryKey effect 参照)。
  const hasInitializedRef = useRef(false);

  // in-flight な block fetch(blockIndex -> AbortController)です。重複排除とキャンセルに使います。
  const inFlightRef = useRef<Map<number, AbortController>>(new Map());
  // 追加(batch 9): 失敗中(未回復)のブロック index 集合です。abort 以外の reject で追加し、
  //   成功到着 / retry / クエリ変化 / refresh で解除します。UI へは loadError state(集約)で
  //   伝えます(集合の変化時のみ新参照を発行 = 「閉じる」後の再表示判定に使う契約)。
  const failedBlocksRef = useRef<Set<number>>(new Set());
  const [loadError, setLoadError] = useState<ServerSideLoadErrorState | null>(
    null,
  );
  // onLoadError は latest-ref 経由で読みます(RS-AS 方式: render 中代入ではなく effect で同期し、
  //   毎レンダーの新しいインライン関数が fetchBlock 系の再生成連鎖を起こさないようにします)。
  const onLoadErrorRef = useRef(onLoadError);
  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  // 追加(書き戻し): 確定前(updateRows の in-flight 中)の楽観行オーバーレイです。getRow は
  //   キャッシュより先にここを引くため、書き込み中のブロック再取得・退避でも楽観値が消えません
  //   (キャッシュは常に「最後に確定した値」だけを持つ、が不変条件。logic/serverSideEdits 参照)。
  const [pendingEdits] = useState(() => createServerSidePendingEdits<T>());
  // 追加(書き戻し): 書き込み世代です。クエリ変化 / refresh / unmount で進め、旧世代の in-flight
  //   updateRows の決着(成功・失敗とも)を丸ごと無視します(view 空間の行対応がずれるため)。
  const writeEpochRef = useRef(0);
  const [writeError, setWriteError] = useState<ServerSideWriteErrorState | null>(
    null,
  );
  // onWriteError も latest-ref 経由です(onLoadError と同じ理由)。
  const onWriteErrorRef = useRef(onWriteError);
  useEffect(() => {
    onWriteErrorRef.current = onWriteError;
  }, [onWriteError]);

  // 追加(書き戻し): 「いま表示されている行」を返します(楽観 overlay ?? キャッシュ確定値)。
  //   rowModel.getRow / isRowLoaded / 書き戻しの base 行解決が共有します。
  const getDisplayRow = useCallback(
    (viewIndex: number): T | undefined =>
      pendingEdits.getRow(viewIndex) ?? cache.getRow(viewIndex),
    [cache, pendingEdits],
  );

  // 追加(書き戻し): 書き込み状態のリセットです(クエリ変化 / refresh から呼びます)。
  //   epoch を進めて in-flight の決着を無効化し、楽観 overlay と失敗表示を破棄します。
  const resetWriteState = useCallback((): void => {
    writeEpochRef.current += 1;
    pendingEdits.clear();
    setWriteError(null);
  }, [pendingEdits]);

  // 失敗集合 → loadError state の同期です。集合が実際に変わった時だけ呼びます
  //   (成功のたびに無条件で新参照を発行すると、「閉じる」判定が毎回無効化されるため)。
  const syncLoadError = useCallback((): void => {
    const size = failedBlocksRef.current.size;
    setLoadError((prev) => {
      if (size === 0) {
        return prev === null ? prev : null;
      }
      return { failedBlockCount: size };
    });
  }, []);
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

      const startIndex = blockIndex * blockSize;
      // 変更(stage ②): endIndex は常に blockSize 全幅で要求します(knownRowCount クランプ撤去)。
      //   理由: queryKey 変化直後は前回件数が stale になり得ます。stale 件数で末端を切り詰めると
      //   ブロックが部分長で確定し、以降 hasBlock=true により再フェッチされず未ロード行が残ります。
      //   末端の部分ブロックはサーバが範囲内の存在ぶんだけ返す契約で吸収します(rows.length は要求幅と
      //   不一致でも可)。ブートストラップ(件数未知)時も全幅要求で従来と一致します。
      const endIndex = startIndex + blockSize;

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
          // 追加(batch 9): 失敗中だったブロックの成功到着は失敗解除です(retry を経ない自然回復
          //   = スクロール離脱→再訪の再 fetch 成功でもエラーバーが消えます)。
          if (failedBlocksRef.current.delete(blockIndex)) {
            syncLoadError();
          }
          if (result.totalRowCount !== rowCountRef.current) {
            rowCountRef.current = result.totalRowCount;
            setRowCount(result.totalRowCount);
          }
          setVersion((value) => value + 1);
        })
        .catch((error: unknown) => {
          // abort は失敗扱いにしません(スクロール通過 / クエリ変化 / unmount の正常キャンセル)。
          //   abort 時は必ず呼び出し元が in-flight から削除済みのため、下の同一性チェックで弾かれます。
          if (controller.signal.aborted) {
            return;
          }
          // その他エラーは in-flight を解放して失敗として記録します(スケルトンは残り、次の
          //   requestRange = スクロールでの自然再試行は従来どおり)。同じブロックの再失敗でも
          //   新参照を発行します(新しい失敗イベントとして「閉じた」エラーバーを再表示するため)。
          if (inFlightRef.current.get(blockIndex) === controller) {
            inFlightRef.current.delete(blockIndex);
            failedBlocksRef.current.add(blockIndex);
            syncLoadError();
            onLoadErrorRef.current?.(error, { startIndex, endIndex });
          }
        });
    },
    [cache, blockSize, dataSource, query, syncLoadError],
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

  // queryKey 変化(stage ② の filter/sort 変更)でキャッシュを無効化し、block 0 を取り直します。
  //   件数はここでは戻さず、block 0 到着の totalRowCount で一度だけ更新します(再クエリ時の
  //   スクロールバーの巻き戻し=一瞬の振れを避けるため)。mount 時も走ります。
  useEffect(() => {
    // 追加(①-3): clientSide(inert)では何もしません(ブートストラップ/無効化を抑止し、
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
    // 追加(batch 9): クエリが変われば旧クエリの失敗は無効です(エラーバーも下ろします)。
    failedBlocksRef.current.clear();
    syncLoadError();
    // 追加(書き戻し): 旧クエリの楽観 overlay / in-flight 書き込みも無効です(view 対応がずれる
    //   ため)。内包する setWriteError は意図的なリセットです(rule は effect 内の先頭 setState
    //   のみ報告するため、局所抑止はこの呼び出しに付けます — 下の setVersion 側は報告されません)。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetWriteState();

    // 変更(stage ②): 件数をここでリセットしません。
    //   - 初回 mount: rowCount は useState 初期値(initialRowCount ?? 0)のまま。initialRowCount 既知なら
    //     即時に正しい総高さ/スクロールバーが出ます(従来どおり)。
    //   - 再クエリ(queryKey 変化): 前回件数を保持したまま下記で block 0 を取り直し、到着した
    //     totalRowCount で一度だけ更新します(initialRowCount への巻き戻しを避け件数遷移を単一化)。
    //     stale 件数でも endIndex は全幅要求のためブロック切り詰めは起きません(fetchBlock 参照)。
    const isFirstRun = !hasInitializedRef.current;
    hasInitializedRef.current = true;

    // クリア済みキャッシュをスケルトンとして再描画させるための意図的な再描画トリガーです
    //   (version の bump。rule は effect 内の先頭 setState = 上の resetWriteState のみ報告する
    //   ため、ここへの disable は Unused directive になります — 付けません)。
    setVersion((value) => value + 1);

    // block 0 先行 fetch:
    //   - 初回 mount: 件数未知(initialRowCount 未指定 = 0)のときだけブートストラップします
    //     (既知なら requestRange 駆動に委ね、初回から余計な block 0 を投げません)。
    //   - 再クエリ: キャッシュ破棄したため常に block 0 を取り直します(件数追従の起点)。
    if (isFirstRun) {
      if ((dataSource.initialRowCount ?? 0) <= 0) {
        fetchBlock(0);
      }
    } else {
      fetchBlock(0);
    }
    // queryKey 変化のみを再実行トリガーにします(fetchBlock/cache/dataSource は同 render で最新)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  // 追加(stage ③ / batch 8 で関数化): ソフトリフレッシュの本体です。refreshToken effect と
  //   命令的ハンドル(refreshServerSide())の両方から呼びます。
  //   queryKey 変化(結果セット総入れ替え→先頭リセット)とは別物で、クエリは変えずにキャッシュを
  //   破棄し「現在の可視レンジ」を即時取り直します。スクロール位置は SpreadsheetGrid 側が
  //   serverSideQueryKey 不変のため自動的に保持し、件数はここではリセットせず到着ブロックの
  //   totalRowCount で更新します(外部更新で件数が変わっていれば追従)。block 0 ではなく latestRange を
  //   取り直すのは、scroll 保持時に「今見えている行」を最優先で更新するためです。
  const refresh = useCallback((): void => {
    // clientSide(inert)では何もしません。
    if (dataSource == null) {
      return;
    }
    // 進行中の取得を全て中断し、debounce タイマーを破棄してキャッシュを破棄します。
    for (const [, controller] of inFlightRef.current) {
      controller.abort();
    }
    inFlightRef.current.clear();
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    cache.clear();
    // 追加(batch 9): 明示的な取り直しなので失敗状態もリセットします(エラーバーを下ろす)。
    failedBlocksRef.current.clear();
    syncLoadError();
    // 追加(書き戻し): 楽観 overlay / in-flight 書き込みも破棄します(サーバー正本を取り直すため、
    //   確定前の編集は失われます — refresh はそういう操作、という契約です)。
    resetWriteState();

    // 破棄済みキャッシュをスケルトンとして即時再描画させます(件数は保持)。
    setVersion((value) => value + 1);

    // 現在の可視レンジを即時取り直します(debounce を介さず、明示操作に即応)。
    //   追加(batch 8): 可視レンジ未確立(requestRange 未到達)や件数 0(空結果からの復帰)では
    //   対象ブロック集合が空になり従来は何も取得されなかったため、block 0 をブートストラップとして
    //   取り直します(件数追従の起点を常に確保。空になったテーブルがサーバ側でデータを得た後の
    //   refresh で復帰できます)。
    const { start, end } = latestRangeRef.current;
    if (
      computeBlockIndexes(start, end, blockSize, rowCountRef.current).length ===
      0
    ) {
      fetchBlock(0);
      return;
    }
    runFetch();
  }, [cache, dataSource, blockSize, fetchBlock, runFetch, syncLoadError, resetWriteState]);

  // 追加(batch 9): 失敗中ブロックだけを再取得します(エラーバーの「再試行」)。
  //   先に失敗集合をクリアして loadError を下ろし(バーは即時消え、スケルトンがローディングを
  //   表現)、各ブロックを debounce なしで再 fetch します(再び失敗すれば catch が失敗を
  //   積み直してバーが再表示されます)。キャッシュ済みブロックには触りません。
  const retryFailedBlocks = useCallback((): void => {
    if (dataSource == null || failedBlocksRef.current.size === 0) {
      return;
    }
    const blocks = Array.from(failedBlocksRef.current);
    failedBlocksRef.current.clear();
    syncLoadError();
    for (const blockIndex of blocks) {
      fetchBlock(blockIndex);
    }
  }, [dataSource, fetchBlock, syncLoadError]);

  // 追加(書き戻し): セル編集の書き戻し(楽観更新つき)の本体です。
  //   edits は「いま表示されている行」基準のパース済みドメイン値で渡します(文字列パースと
  //   バリデーションは呼び出し側 = 各編集経路の責務。clientSide の onRowsChange 経路と対称)。
  //   流れ: 行単位へ集約(未ロード行はスキップ)→ overlay へ楽観行を登録し即時再描画 →
  //   dataSource.updateRows → 成功: キャッシュへ確定書き込み(結果 rows があればサーバー確定行、
  //   なければ楽観行)して overlay を外す / 失敗: overlay を外すだけ(= 最後の確定値へロールバック)。
  //   同一行への連続編集は writeId 世代ガード(古い決着が新しい楽観値を巻き戻さない)、クエリ変化・
  //   refresh をまたいだ遅延決着は epoch ガードで丸ごと無視します。
  const applyCellEdits = useCallback(
    (edits: ServerSideCellEditInput<T>[]): number => {
      const updateRows = dataSource?.updateRows;
      if (updateRows === undefined || edits.length === 0) {
        return 0;
      }
      const updates = buildServerSideRowUpdates(edits, getDisplayRow, rowKeyGetter);
      if (updates.length === 0) {
        return 0;
      }
      const epoch = writeEpochRef.current;
      const writes = updates.map((update) => ({
        viewIndex: update.rowIndex,
        row: update.row,
        writeId: pendingEdits.beginWrite(update.rowIndex, update.row),
      }));
      // 楽観値を即時反映します(rowModel 再生成のトリガー)。
      setVersion((value) => value + 1);

      updateRows({ updates })
        .then((result) => {
          if (writeEpochRef.current !== epoch) {
            return;
          }
          const confirmedRows = result === undefined ? undefined : result.rows;
          writes.forEach((write, index) => {
            // 「最後に確定した値」としてキャッシュへ書きます(ブロックが退避済みなら no-op =
            //   次の fetch がサーバー正本を取り直します)。settleWrite は最新 writeId のときだけ
            //   overlay を外します(古い決着はキャッシュ更新のみ行い、新しい楽観値を保ちます)。
            cache.updateRow(write.viewIndex, confirmedRows?.[index] ?? write.row);
            pendingEdits.settleWrite(write.viewIndex, write.writeId);
          });
          setVersion((value) => value + 1);
        })
        .catch((error: unknown) => {
          if (writeEpochRef.current !== epoch) {
            return;
          }
          // overlay を外すだけでロールバックになります(キャッシュは最後の確定値のまま)。
          for (const write of writes) {
            pendingEdits.settleWrite(write.viewIndex, write.writeId);
          }
          // 失敗のたびに新参照を発行します(「閉じる」後の再表示判定は loadError と同じ契約)。
          setWriteError({ failedRowCount: updates.length });
          onWriteErrorRef.current?.(error, { updates });
          setVersion((value) => value + 1);
        });
      return updates.length;
    },
    [cache, dataSource, getDisplayRow, pendingEdits, rowKeyGetter],
  );

  // 追加(stage ③): refreshToken 変化でのソフトリフレッシュ effect です(本体は上の refresh)。
  //   マウント時の no-op は前回値比較で実現し、dev StrictMode の二重実行でも余計な再取得を
  //   出しません。
  const prevRefreshTokenRef = useRef<number | undefined>(refreshToken);
  useEffect(() => {
    // clientSide(inert)/ refreshToken 未指定では取得しません(基準値だけ追従させます)。
    if (dataSource == null || refreshToken === undefined) {
      prevRefreshTokenRef.current = refreshToken;
      return;
    }
    // 初めて defined な値を観測したケース(初期化 or undefined→number)は基準化のみで取得しません。
    if (prevRefreshTokenRef.current === undefined) {
      prevRefreshTokenRef.current = refreshToken;
      return;
    }
    // 値が変わっていなければ(mount 含む)何もしません。
    if (prevRefreshTokenRef.current === refreshToken) {
      return;
    }
    prevRefreshTokenRef.current = refreshToken;

    // refresh 内の setState(version bump)は前回値比較ガードによりマウント時(初回 effect 実行)
    //   には到達しないため、react-hooks/set-state-in-effect は報告せず disable は不要です。
    refresh();
    // refreshToken のみを再実行トリガーにします(refresh は同 render で最新)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  // unmount クリーンアップ: in-flight abort + timer クリアです。
  useEffect(() => {
    // cleanup 実行時に ref が指し替わっている可能性を避けるため、Map 参照を退避します
    //   (inFlightRef.current は再代入されず .clear/.set/.delete のみのため退避で十分)。
    const inFlight = inFlightRef.current;
    const timer = timerRef;
    const epoch = writeEpochRef;
    return () => {
      for (const [, controller] of inFlight) {
        controller.abort();
      }
      inFlight.clear();
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      // 追加(書き戻し): in-flight な updateRows の決着を無効化し、楽観 overlay を破棄します
      //   (unmount 後の setState / キャッシュ書き込みを epoch ガードで止めます)。
      epoch.current += 1;
      pendingEdits.clear();
    };
  }, [pendingEdits]);

  const isRowLoaded = useCallback(
    (viewIndex: number): boolean => getDisplayRow(viewIndex) !== undefined,
    [getDisplayRow],
  );

  // RowModel シームの serverSide 実装です。order/rows ではなく overlay ?? cache を読みます
  //   (getDisplayRow。確定前の楽観値が常に優先)。
  //   version を deps に含め、ブロック到着 / 楽観更新で参照を更新して consumer の再評価を促します。
  const rowModel = useMemo<RowModel<T>>(
    () => ({
      getRowCount: () => rowCountRef.current,
      // 未ロードは undefined(シーム契約どおり=clientSide の OOB と同じ)。型は T 固定のため
      //   キャストします(strictNullChecks 下で getDisplayRow の | undefined を吸収)。
      getRow: (viewIndex) => getDisplayRow(viewIndex) as T,
      getSourceIndex: (viewIndex) => viewIndex,
      getRowKey: (viewIndex) => {
        const row = getDisplayRow(viewIndex);
        return row === undefined ? viewIndex : rowKeyGetter(row, viewIndex);
      },
    }),
    // version はブロック到着での再計算トリガーです(memo 本体は読まないため lint は不要と判定)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getDisplayRow, rowKeyGetter, version],
  );

  return {
    rowModel,
    rowCount,
    isRowLoaded,
    requestRange,
    refresh,
    loadError,
    retryFailedBlocks,
    canUpdateRows: dataSource?.updateRows !== undefined,
    applyCellEdits,
    writeError,
  };
}