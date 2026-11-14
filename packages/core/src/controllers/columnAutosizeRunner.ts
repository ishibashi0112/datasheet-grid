// 追加(非依存化 ③-9): 列幅の自動調整(autosize)を時間分割で実行するランナーです(React 非依存。
//   旧 hooks/useColumnAutosizeRunner の本体を移設)。
//   - runAutosize(columns): rowModel の全行を runChunked で走査して幅を集計し、完了時に
//     syncColumnWidths を dispatch します。実行中の再実行(世代切替)や rowModel の差し替えで中断します。
//   - isAutosizing(overlay 表示用): 開始から OVERLAY_DELAY_MS 経過しても続いていれば true。
//     レンダー中に読む値なので ValueStore(subscribe / getSnapshot)で公開します。
//   - args は update(毎レンダー)で受けた値を run 開始時にキャプチャし、yield 後は最新 args と比較して
//     rowModel の差し替えを検出します(変更(本体分解 E-6c): 旧 latest-ref 渡しを値渡しへ)。
//   - createAutoSizeOnDataTrigger: prop autoSizeColumns による宣言的トリガー(データ投入時の列幅自動フィット)。
import {
  canMeasureAutosize,
  createColumnWidthAccumulator,
  type AutosizeChipOf,
  type AutosizeTotalRowTexts,
} from '../logic/columnAutosize';
import { runChunked } from '../logic/chunkedLoop';
import { createValueStore } from '../logic/valueStore';
import { gridActions } from '../model/gridActions';
import type { AutoSizeColumnsMode, GridColumn, RowModel } from '../model/gridTypes.unbound';
import { resolveAutoSizeOnData } from '../logic/autoSizeOnData';

// 計測が長引く場合にのみ overlay を出す遅延(ms)。短時間で終わる計測でちらつかせないため。
const OVERLAY_DELAY_MS = 180;

type ReadonlyRef<V> = { readonly current: V };

export type ColumnAutosizeRunnerArgs<T> = {
  rowModel: RowModel<T>;
  gridRootRef: ReadonlyRef<HTMLElement | null>;
  // 現在の解決済み列幅(flex 解決済み)。
  columnWidths: Record<string, number>;
  dispatch: (action: ReturnType<typeof gridActions.syncColumnWidths>) => void;
  // 追加(見直し): 合計行の表示(列の key → 文字列と見出し)。幅に収めます。合計行が無ければ省略(従来どおり)。
  totalRowTexts?: AutosizeTotalRowTexts;
  // 追加(1.0.2 / 2026-11-09 実アプリの総点検 D-02): 状態チップのセルの中身(条件付き書式の機能があるときだけ)。
  chipOf?: AutosizeChipOf<T> | undefined;
};

export type ColumnAutosizeRunner<T> = {
  update: (args: ColumnAutosizeRunnerArgs<T>) => void;
  runAutosize: (columns: GridColumn<T>[]) => Promise<void>;
  // isAutosizing の購読(useSyncExternalStore 互換)。
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => boolean;
  // 進行中の run を無効化し overlay タイマーを止めます(アンマウント時)。
  dispose: () => void;
};

export const createColumnAutosizeRunner = <T,>(): ColumnAutosizeRunner<T> => {
  let args: ColumnAutosizeRunnerArgs<T> | null = null;
  const isAutosizing = createValueStore(false);
  let runGeneration = 0;
  let overlayTimer: ReturnType<typeof setTimeout> | null = null;

  const clearOverlayTimer = () => {
    if (overlayTimer !== null) {
      clearTimeout(overlayTimer);
      overlayTimer = null;
    }
  };

  const update = (next: ColumnAutosizeRunnerArgs<T>) => {
    args = next;
  };

  const runAutosize = async (columns: GridColumn<T>[]): Promise<void> => {
    if (args === null || columns.length === 0 || !canMeasureAutosize()) {
      return;
    }
    const { rowModel, gridRootRef, columnWidths: currentWidths, dispatch, totalRowTexts, chipOf } = args;
    const myGeneration = (runGeneration += 1);
    clearOverlayTimer();

    const viewRowCount = rowModel.getRowCount();
    const gridRoot = gridRootRef.current;
    const accumulator = createColumnWidthAccumulator(columns);

    overlayTimer = setTimeout(() => {
      if (runGeneration === myGeneration) {
        isAutosizing.setSnapshot(true);
      }
    }, OVERLAY_DELAY_MS);

    try {
      const completed = await runChunked(
        viewRowCount,
        (viewIndex) => {
          const row = rowModel.getRow(viewIndex);
          if (row) {
            accumulator.collect(row, viewIndex);
          }
        },
        {
          // 世代が進んだ(再実行 / dispose)か rowModel が差し替わったら中断。
          isCancelled: () =>
            runGeneration !== myGeneration || args?.rowModel !== rowModel,
        },
      );
      if (!completed) {
        return;
      }
      const nextWidths = accumulator.finalize({ gridRoot, currentWidths, totalRowTexts, chipOf });
      if (Object.keys(nextWidths).length > 0) {
        dispatch(gridActions.syncColumnWidths(nextWidths));
      }
    } finally {
      if (runGeneration === myGeneration) {
        clearOverlayTimer();
        isAutosizing.setSnapshot(false);
      }
    }
  };

  return {
    update,
    runAutosize,
    subscribe: isAutosizing.subscribe,
    getSnapshot: isAutosizing.getSnapshot,
    dispose: () => {
      runGeneration += 1;
      clearOverlayTimer();
    },
  };
};

// ── autoSize on data(データ投入時の列幅自動フィット)────────────
// 追加(本体分解 E-6c): prop autoSizeColumns による宣言的トリガーです(旧 SpreadsheetGrid.tsx の effect を移設)。
//   列メニュー「すべての列の幅を自動調整」と同一エンジン(runAutosize)を、rows(データ)の変化を signal に発火させる
//   だけの薄い配線です。
//   - 'onMount'      : 初回にデータが載った一度きり(hasAutoSizedOnMount で二度目以降を抑止)。
//   - 'onDataChange' : rows(参照)が変わるたび(= データ差し替えのたび)。手動リサイズは上書きされます。
//   - false(既定)   : 何もしません。
//   発火 signal は旧 effect の deps(mode / rows / isServerSide / runAutosize)のみ。列の並べ替え / 表示切替 / 固定
//   (= visibleColumns 変化)では再フィットしません(visibleColumns は最新値を読むだけ)。update は passive
//   (ペイント後)で呼ぶこと(rows 変化ぶんのパイプライン再計算済み・gridRoot mount 済みで計測する)。
export type AutoSizeOnDataArgs<T> = {
  mode: AutoSizeColumnsMode;
  isServerSide: boolean;
  rows: T[];
  visibleColumns: GridColumn<T>[];
  runAutosize: (columns: GridColumn<T>[]) => Promise<void>;
  // 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-22): グリッドが描かれていない(display: none の中)か。描かれていない間は
  //   測らずに待ち、描かれた後の update(描き直し)で測ります。隠したタブの中で作ったグリッドの 'onMount' が、
  //   幅 0 のまま測って列を約 71px に縮めていた。省略すると待ちません(従来どおり)。
  gridRootRef?: ReadonlyRef<HTMLElement | null>;
};

// 追加(1.0.1 / AP-22): 要素が描かれていないか(自分か祖先が display: none)。checkVisibility の無いブラウザは祖先の
//   display を見ます(React 非依存)。
export const isElementHidden = (element: HTMLElement | null): boolean => {
  if (element === null || !element.isConnected) {
    return true;
  }
  const withCheck = element as HTMLElement & { checkVisibility?: () => boolean };
  if (typeof withCheck.checkVisibility === 'function') {
    return !withCheck.checkVisibility();
  }
  const view = element.ownerDocument.defaultView;
  if (view === null) {
    return false;
  }
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if (view.getComputedStyle(node).display === 'none') {
      return true;
    }
  }
  return false;
};

export type AutoSizeOnDataTrigger<T> = {
  update: (args: AutoSizeOnDataArgs<T>) => void;
  // 追加(audit C-6): 前回の args を忘れ、走り切っていない 'onMount' の計測があれば「未発火」に戻します。
  dispose: () => void;
};

export const createAutoSizeOnDataTrigger = <T,>(): AutoSizeOnDataTrigger<T> => {
  let last: AutoSizeOnDataArgs<T> | null = null;
  let hasAutoSizedOnMount = false;
  // 追加(audit C-6): 'onMount' の計測が走っている間は true。StrictMode の擬似アンマウントでランナーが計測を
  //   打ち切る(dispose で世代を進める)ため、走り切る前に dispose されたら再マウントの update で計測し直します。
  //   世代(token)は打ち切られた計測の後始末が新しい計測のフラグを下ろさないためのものです。
  let mountRunPending = false;
  let mountRunToken = 0;
  // 追加(1.0.1 / AP-22): 描かれていなかったので待っている計測があるか。
  let deferred = false;
  // 追加(1.0.1 のレビュー RB-6): 待っている計測が 'onMount' の 1 回目か(行が無くなって待つのをやめたら、まだ測っていない
  //   ので、次に行が載ったときに測る)。
  let deferredMount = false;
  // 追加(1.0.1 のレビュー RB-6): 待っている間はグリッドのルートの大きさを見張り、描かれたら測ります。隠れている間に rows が
  //   変わり、隠す前と同じ大きさで出し直すと、ビューの大きさが変わらないので描き直されず、次に何かで描き直されるまで
  //   測らなかった(そのとき列幅が飛んだ)。
  let visibilityObserver: ResizeObserver | null = null;
  let visibilityFrame: number | null = null;
  const stopWatching = () => {
    visibilityObserver?.disconnect();
    visibilityObserver = null;
    if (visibilityFrame !== null) {
      cancelAnimationFrame(visibilityFrame);
      visibilityFrame = null;
    }
  };
  const watchUntilVisible = (root: HTMLElement | null) => {
    if (root === null || visibilityObserver !== null || typeof ResizeObserver === 'undefined') {
      return;
    }
    visibilityObserver = new ResizeObserver(() => {
      if (visibilityFrame !== null || isElementHidden(root)) {
        return;
      }
      // ResizeObserver のコールバックの中では書かず、次のフレームで測ります(BR-1 と同じ)。
      visibilityFrame = requestAnimationFrame(() => {
        visibilityFrame = null;
        const current = last;
        if (!deferred || current === null || current.mode === false || current.isServerSide) {
          stopWatching();
          return;
        }
        if (!isElementHidden(current.gridRootRef?.current ?? null)) {
          run(current);
        }
      });
    });
    visibilityObserver.observe(root);
  };

  const run = (next: AutoSizeOnDataArgs<T>) => {
    if (next.gridRootRef !== undefined && isElementHidden(next.gridRootRef.current)) {
      deferred = true;
      deferredMount = next.mode === 'onMount';
      watchUntilVisible(next.gridRootRef.current);
      return;
    }
    deferred = false;
    deferredMount = false;
    stopWatching();
    if (next.mode !== 'onMount') {
      void next.runAutosize(next.visibleColumns);
      return;
    }
    mountRunPending = true;
    const token = mountRunToken;
    void next.runAutosize(next.visibleColumns).finally(() => {
      if (token === mountRunToken) {
        mountRunPending = false;
      }
    });
  };

  return {
    dispose: () => {
      last = null;
      mountRunToken += 1;
      if (mountRunPending || (deferred && hasAutoSizedOnMount)) {
        mountRunPending = false;
        hasAutoSizedOnMount = false;
      }
      deferred = false;
      deferredMount = false;
      stopWatching();
    },
    update: (next) => {
      if (
        last !== null &&
        last.mode === next.mode &&
        last.isServerSide === next.isServerSide &&
        last.rows === next.rows &&
        last.runAutosize === next.runAutosize
      ) {
        last = next;
        // 待っていた計測は、描かれたら測ります(描かれると本体の幅が書かれて描き直され、ここへ来る)。
        if (deferred && next.mode !== false && !next.isServerSide) {
          run(next);
        }
        return;
      }
      last = next;
      const { shouldRun, nextHasAutoSizedOnMount } = resolveAutoSizeOnData({
        mode: next.mode,
        isServerSide: next.isServerSide,
        rowCount: next.rows.length,
        hasAutoSizedOnMount,
      });
      hasAutoSizedOnMount = nextHasAutoSizedOnMount;
      if (shouldRun) {
        run(next);
      } else if (next.mode === false || next.isServerSide || next.rows.length === 0) {
        // 変更(1.0.1 のレビュー RB-6): 'onMount' の 1 回目を待っている間に行が無くなった(隠したタブで「読み込み → 取り直し」)
        //   ときは、まだ測っていないので、次に行が載ったときに測ります(これまでは二度と測らなかった)。
        if (deferred && deferredMount) {
          hasAutoSizedOnMount = false;
        }
        deferred = false;
        deferredMount = false;
        stopWatching();
      }
    },
  };
};