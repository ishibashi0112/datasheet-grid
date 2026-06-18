import { useCallback, useEffect, useRef, useState } from 'react';

import {
  canMeasureAutosize,
  createColumnWidthAccumulator,
} from '../logic/columnAutosize';
import { gridActions } from '../model/gridActions';
import type { GridColumn, RowModel } from '../model/gridTypes';
import { yieldToMain } from '../utils/scheduler';

// 1 チャンクで連続走査する時間予算(ms)です。これを超えたら yield します。
//   小さくするほど応答性が上がりますが yield 回数(オーバーヘッド)が増えます。
const CHUNK_BUDGET_MS = 10;
// 処理開始からこの時間(ms)を超えて継続したときだけ overlay を出します(遅延表示)。
//   一瞬で終わる規模では overlay が出ず、チラつきを防ぎます("重い時だけ正直に出す")。
const OVERLAY_DELAY_MS = 180;

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

// 読み取り専用 ref 形(MutableRefObject も RefObject も受けられるよう current だけを要求)。
type ReadonlyRef<V> = { readonly current: V };

type UseColumnAutosizeRunnerArgs<T> = {
  // 最新 rowModel を指す latest-ref です。run 開始時にキャプチャし、実行中に参照が
  //   変わった(= order/rows が変化した)ら中断します。
  rowModelRef: ReadonlyRef<RowModel<T>>;
  gridRootRef: ReadonlyRef<HTMLElement | null>;
  columnWidthsRef: ReadonlyRef<Record<string, number>>;
  dispatch: (action: ReturnType<typeof gridActions.syncColumnWidths>) => void;
};

// 追加(DS-4 ①-(2)): autosize 計測を「単一経路の時間分割(async)」で実行するランナーです。
//   - 走査は CHUNK_BUDGET_MS ごとに yieldToMain し、メインスレッドを塞ぎません。
//   - overlay は OVERLAY_DELAY_MS の遅延表示。小規模は overlay 無しで体感は従来同期と同じ。
//   - 実行世代 + rowModel 参照比較で、後続 run / unmount / データ変化に対し安全に中断します。
//   - 計測結果(accumulator)は logic/columnAutosize の sync 版と同一のため、刻み方が違っても
//     結果は同期一括版とバイト等価です(等価検証で確認)。
export const useColumnAutosizeRunner = <T,>({
  rowModelRef,
  gridRootRef,
  columnWidthsRef,
  dispatch,
}: UseColumnAutosizeRunnerArgs<T>) => {
  // overlay 表示状態(遅延 overlay が発火し、かつ未完了の間だけ true)。
  const [isAutosizing, setIsAutosizing] = useState(false);
  // 実行世代。run 毎にインクリメントし、後続 run / unmount で先行 run を無効化します。
  const runGenerationRef = useRef(0);
  // 遅延 overlay タイマーの ID(単一スロット。run は同時に 1 本だけ)。
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOverlayTimer = (): void => {
    if (overlayTimerRef.current !== null) {
      clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      // unmount: 実行中 run を世代で無効化し、遅延 overlay タイマーを解除します。
      runGenerationRef.current += 1;
      clearOverlayTimer();
    },
    [],
  );

  const runAutosize = useCallback(
    async (columns: GridColumn<T>[]): Promise<void> => {
      // 列 0 / 計測不可(canvas 非対応)は走査前に no-op で抜けます。
      if (columns.length === 0 || !canMeasureAutosize()) {
        return;
      }

      // 新しい run を開始。先行 run はここで世代が変わり、次の yield 後に自ら中断します。
      const myGeneration = (runGenerationRef.current += 1);
      clearOverlayTimer();

      // run 開始時点の rowModel / 計測コンテキストをキャプチャします。
      //   キャプチャした rowModel はその世代の order/rows を参照し続けます。実行中に
      //   rowModelRef.current が別参照へ変わったら、計測対象が陳腐化したとみなし中断します。
      const rowModel = rowModelRef.current;
      const viewRowCount = rowModel.getRowCount();
      const gridRoot = gridRootRef.current;
      const currentWidths = columnWidthsRef.current;

      const accumulator = createColumnWidthAccumulator(columns);

      // 遅延 overlay: OVERLAY_DELAY_MS 経過時点でまだ同一世代(未完了)なら overlay を出します。
      overlayTimerRef.current = setTimeout(() => {
        if (runGenerationRef.current === myGeneration) {
          setIsAutosizing(true);
        }
      }, OVERLAY_DELAY_MS);

      try {
        let viewIndex = 0;
        while (viewIndex < viewRowCount) {
          const sliceStart = now();
          while (
            viewIndex < viewRowCount &&
            now() - sliceStart < CHUNK_BUDGET_MS
          ) {
            const row = rowModel.getRow(viewIndex);
            // 注記(DS-3-9/3-10 と同方針): seam の OOB は実行時ガードで吸収します。
            if (row) {
              accumulator.collect(row);
            }
            viewIndex += 1;
          }

          if (viewIndex < viewRowCount) {
            await yieldToMain();
            // yield 後の中断判定:
            //   - 世代不一致: 後続 run / unmount に置き換えられた(状態はそちらが管理)。
            //   - rowModel 変化: order/rows が変わり、計測対象が陳腐化した。
            if (runGenerationRef.current !== myGeneration) {
              return;
            }
            if (rowModelRef.current !== rowModel) {
              return;
            }
          }
        }

        const nextWidths = accumulator.finalize({ gridRoot, currentWidths });
        if (Object.keys(nextWidths).length > 0) {
          dispatch(gridActions.syncColumnWidths(nextWidths));
        }
      } finally {
        // 自世代のまま終了 / 中断したときだけ後始末します。後続 run が世代を奪っている
        //   場合は、その run が overlay / タイマーを所有しているため触りません。
        if (runGenerationRef.current === myGeneration) {
          clearOverlayTimer();
          setIsAutosizing(false);
        }
      }
    },
    [columnWidthsRef, dispatch, gridRootRef, rowModelRef],
  );

  return { isAutosizing, runAutosize };
};

export default useColumnAutosizeRunner;