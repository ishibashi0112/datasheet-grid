// 追加(本体分解 E-3): auto-height の測定フローです(React 非依存。旧 SpreadsheetGrid.tsx の
//   「auto-height 測定フロー(ResizeObserver + アンカー補正)(C1)」useLayoutEffect を移設)。
//   描画済みの [data-autoheight-cell] を実測し、行ごと(同一 rowKey の 3 ペイン分は max)に行高ストアへ反映 →
//   最小変更 index から prefix を 1 回前方再構築 → version bump でジオメトリを更新します。
//   ★アンカー補正: 測定で上方の行高が変わると基準行の論理 top がずれて画面がジャンプするため、viewport 上端の
//     行を anchor とし、prefix 再構築と同じ layout フレーム内(ペイント前)で scrollTop を同量ずらします。
//     → update はレイアウト effect(コミット後・ペイント前)から呼ぶこと(useController がそう接続する)。
//   再測定トリガー: 描画窓(virtualRows)変化 / version / nonce(ResizeObserver = 内容変化)/ viewport。
//     update は旧 effect の deps と同じ組を Object.is で比較し、変わったときだけ測定します。高さが収束すると
//     setMeasuredRowHeight が false を返し version が動かず、ループは止まります。
//   公開する snapshot { version, nonce } は描画側が購読し、version は縦レイアウトの再計算トリガー、両方を
//   update の args へ戻して再測定トリガーにします。measuredHeights(rowKey 単位の永続キャッシュ)も本体が持ちます。
import type { GridRowKey, RowModel } from '../model/gridTypes.unbound';
import { rebuildPrefixFrom, setMeasuredRowHeight, type RowHeightStore } from '../logic/rowHeightStore';
import type { RowMetrics, VerticalGeometry } from '../logic/verticalGeometry';
import { isInsideDetailCardOf } from '../logic/detailRow';
import { createValueStore } from '../logic/valueStore';

type ReadonlyRef<V> = { readonly current: V };

export type AutoHeightMeasureArgs<T> = {
  // 共有スクロールコンテナ(update 時に読む。レンダー中に ref を読ませないため ref で受ける)。
  scrollContainerRef: ReadonlyRef<HTMLElement | null>;
  autoHeightActive: boolean;
  // 追加(段階 2 DU-32): 測った高さの下限(基準の行の高さ)。器の中身が 1 行でも、行はこれより低くしません。
  minRowHeight?: number;
  rowHeightStore: RowHeightStore | null;
  rowMetrics: RowMetrics;
  rowModel: RowModel<T>;
  virtualRows: VerticalGeometry['rows'];
  viewportHeight: number;
  version: number;
  nonce: number;
};

export type AutoHeightMeasureSnapshot = { version: number; nonce: number };

export type AutoHeightMeasurer<T> = {
  update: (args: AutoHeightMeasureArgs<T>) => void;
  getSnapshot: () => AutoHeightMeasureSnapshot;
  subscribe: (listener: () => void) => () => void;
  // 実測高さの永続キャッシュ(rowKey 単位)。store を作り直しても引き継ぎます。
  measuredHeights: Map<GridRowKey, number>;
  dispose: () => void;
};

const sameDeps = <T,>(a: AutoHeightMeasureArgs<T>, b: AutoHeightMeasureArgs<T>): boolean =>
  a.autoHeightActive === b.autoHeightActive &&
  a.minRowHeight === b.minRowHeight &&
  a.rowHeightStore === b.rowHeightStore &&
  a.rowMetrics === b.rowMetrics &&
  a.rowModel === b.rowModel &&
  a.virtualRows === b.virtualRows &&
  a.viewportHeight === b.viewportHeight &&
  a.version === b.version &&
  a.nonce === b.nonce;

// 追加(段階 2 DU-32): auto-height のセル 1 つの高さです。セルの箱は行の高さなので、中の器(data-autoheight-content)の
//   高さにセルの上下の枠線と余白を足します(器が無ければ従来どおりセルの箱)。下限は基準の行の高さ。
//   隠れている間(器の高さ 0)は 0 を返します(記録しない。BR-1 見直し)。
const measureAutoHeightCell = (cell: HTMLElement, minRowHeight: number): number => {
  const content = cell.querySelector<HTMLElement>('[data-autoheight-content]');
  if (!content) {
    return Math.ceil(cell.getBoundingClientRect().height);
  }
  const contentHeight = content.getBoundingClientRect().height;
  if (contentHeight === 0 && cell.getBoundingClientRect().height === 0) {
    return 0;
  }
  const style = getComputedStyle(cell);
  const chrome =
    (parseFloat(style.borderTopWidth) || 0) +
    (parseFloat(style.borderBottomWidth) || 0) +
    (parseFloat(style.paddingTop) || 0) +
    (parseFloat(style.paddingBottom) || 0);
  return Math.max(Math.ceil(contentHeight + chrome), minRowHeight);
};

export const createAutoHeightMeasurer = <T,>(): AutoHeightMeasurer<T> => {
  const snapshot = createValueStore<AutoHeightMeasureSnapshot>({ version: 0, nonce: 0 });
  const measuredHeights = new Map<GridRowKey, number>();
  // 内容変化監視の永続 ResizeObserver と現在の観測セル集合。描画窓更新ごとに作り直さず、窓差分(新規セルのみ
  //   observe / 消失セルのみ unobserve)だけを反映します。
  let observer: ResizeObserver | null = null;
  const observed = new Set<HTMLElement>();
  let last: AutoHeightMeasureArgs<T> | null = null;
  // 変更(BR-1 2026-10-28): ResizeObserver の通知は次のフレームで nonce を進めます(測り直しの合図)。コールバックの中で
  //   進めると、同じフレームの測り直しで行の高さとスクロール領域が変わり、ブラウザが「ResizeObserver loop completed
  //   with undelivered notifications」を window の error に出すためです(列幅の変更などで起きた)。
  let nonceFrameId: number | null = null;
  // 追加(段階 2 DF-24): アンカー補正で合わせたい scrollTop が、まだ古い全高のスクロールの上限を超えていて止められた
  //   ときの目標です。新しい全高で描き直した後の測定(次の update。ペイント前)で 1 回だけ合わせ直します。短い表の下の方を
  //   見ているときに幅を狭めて行が伸びると、見ていた行がずれてアクティブセルが画面外へ出ていました。
  let pendingScrollTop: number | null = null;

  const disconnect = () => {
    observer?.disconnect();
    observer = null;
    observed.clear();
    if (nonceFrameId !== null) {
      cancelAnimationFrame(nonceFrameId);
      nonceFrameId = null;
    }
  };
  const bumpVersion = () => {
    const current = snapshot.getSnapshot();
    snapshot.setSnapshot({ ...current, version: current.version + 1 });
  };
  const bumpNonce = () => {
    nonceFrameId ??= requestAnimationFrame(() => {
      nonceFrameId = null;
      const current = snapshot.getSnapshot();
      snapshot.setSnapshot({ ...current, nonce: current.nonce + 1 });
    });
  };

  const measure = (args: AutoHeightMeasureArgs<T>) => {
    const { autoHeightActive, rowHeightStore, rowMetrics, rowModel } = args;
    const el = args.scrollContainerRef.current;
    // 無効時(toggle OFF 等)は永続 observer を破棄して終了します。
    if (!autoHeightActive || !rowHeightStore) {
      disconnect();
      pendingScrollTop = null;
      return;
    }
    if (!el) {
      return;
    }
    if (pendingScrollTop !== null) {
      el.scrollTop = pendingScrollTop;
      pendingScrollTop = null;
    }
    const cells = el.querySelectorAll<HTMLElement>('[data-autoheight-cell]');

    // 行ごとの実測 max 高さ(3 ペイン分)を store へ反映します(セルがある場合のみ)。
    if (cells.length > 0) {
      const perRow = new Map<number, number>();
      cells.forEach((cell) => {
        // 展開行カード内にネストしたグリッドのセルは、このグリッドの行高に混ぜません。
        if (isInsideDetailCardOf(el, cell)) {
          return;
        }
        const rowEl = cell.closest<HTMLElement>('[data-row-index]');
        if (!rowEl) {
          return;
        }
        const idx = Number(rowEl.dataset.rowIndex);
        if (!Number.isFinite(idx)) {
          return;
        }
        const height = measureAutoHeightCell(cell, args.minRowHeight ?? 0);
        const prev = perRow.get(idx);
        // 変更(BR-1 見直し 2026-10-28): 高さ 0(隠れている間)は記録しません。行の高さが 0 になると窓に入る行が増え、
        //   新しく描いた行もまた 0 で測られて、描き直しが止まらなくなる(Maximum update depth exceeded でグリッドが外れる)
        //   ためです(スクロールした状態で隠したとき。0.58.0 から)。
        if (height && (prev === undefined || height > prev)) {
          perRow.set(idx, height);
        }
      });

      let changed = false;
      let minChanged = Number.POSITIVE_INFINITY;
      perRow.forEach((height, idx) => {
        const key = rowModel.getRowKey(idx) ?? idx;
        if (setMeasuredRowHeight(rowHeightStore, idx, key, height)) {
          changed = true;
          if (idx < minChanged) {
            minChanged = idx;
          }
        }
      });

      if (changed) {
        // 旧 prefix のまま anchor(viewport 上端行)と offset を数値で捕捉してから再構築します。
        const beforeScrollTop = el.scrollTop;
        const anchorRow = rowMetrics.rowAtContentY(beforeScrollTop);
        const anchorTopBefore = rowMetrics.rowTop(anchorRow);
        const offset = beforeScrollTop - anchorTopBefore;
        rebuildPrefixFrom(rowHeightStore, minChanged);
        // 修正(audit B-01): 再構築後の位置も捕捉時と同じ装飾済み rowMetrics で読みます(展開行帯 / ラベル行高の
        //   上書きを含む)。未装飾の store.prefix を読むと、アンカーより上の帯の高さぶん scrollTop が上へ飛びます。
        //   装飾は base の prefix を参照で読むため、ここで再構築後の値が返ります。
        const anchorTopAfter = rowMetrics.rowTop(anchorRow);
        // ペイント前(layout フレーム内)に同期適用してジャンプを消します。
        const targetScrollTop = anchorTopAfter + offset;
        el.scrollTop = targetScrollTop;
        // 古い全高の上限で止められたら(1px より大きくずれたら)、描き直した後に合わせ直します(DF-24)。
        pendingScrollTop = Math.abs(el.scrollTop - targetScrollTop) > 1 ? targetScrollTop : null;
        // 測定収束のための version bump(ペイント前にジオメトリを更新)。
        bumpVersion();
      }
    }

    // 内容変化(編集等)を拾う永続 ResizeObserver。初回 active 時に遅延生成。
    if (observer === null) {
      observer = new ResizeObserver(bumpNonce);
    }
    const active = observer;
    const current = new Set<HTMLElement>();
    cells.forEach((cell) => {
      // 変更(段階 2 DU-32): セルの箱は行の高さなので、中身の変化は器で見ます(器が無ければセル)。
      const target = cell.querySelector<HTMLElement>('[data-autoheight-content]') ?? cell;
      current.add(target);
      if (!observed.has(target)) {
        active.observe(target);
        observed.add(target);
      }
    });
    // 描画窓から外れた(= DOM から消えた)セルは監視解除して参照を手放します。
    const goneCells: HTMLElement[] = [];
    observed.forEach((cell) => {
      if (!current.has(cell)) {
        goneCells.push(cell);
      }
    });
    goneCells.forEach((cell) => {
      active.unobserve(cell);
      observed.delete(cell);
    });
  };

  return {
    update: (args) => {
      if (last !== null && sameDeps(last, args)) {
        return;
      }
      last = args;
      measure(args);
    },
    getSnapshot: snapshot.getSnapshot,
    subscribe: snapshot.subscribe,
    measuredHeights,
    // 修正(audit C-11): dispose 後に同じ args で update されたとき(StrictMode の擬似アンマウント → 再マウント)も
    //   測り直して ResizeObserver を作り直せるよう、前回の args を忘れます(測り直しは高さが収束していれば no-op)。
    dispose: () => {
      disconnect();
      last = null;
      pendingScrollTop = null;
    },
  };
};