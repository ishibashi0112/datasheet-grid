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
  a.rowHeightStore === b.rowHeightStore &&
  a.rowMetrics === b.rowMetrics &&
  a.rowModel === b.rowModel &&
  a.virtualRows === b.virtualRows &&
  a.viewportHeight === b.viewportHeight &&
  a.version === b.version &&
  a.nonce === b.nonce;

export const createAutoHeightMeasurer = <T,>(): AutoHeightMeasurer<T> => {
  const snapshot = createValueStore<AutoHeightMeasureSnapshot>({ version: 0, nonce: 0 });
  const measuredHeights = new Map<GridRowKey, number>();
  // 内容変化監視の永続 ResizeObserver と現在の観測セル集合。描画窓更新ごとに作り直さず、窓差分(新規セルのみ
  //   observe / 消失セルのみ unobserve)だけを反映します。
  let observer: ResizeObserver | null = null;
  const observed = new Set<HTMLElement>();
  let last: AutoHeightMeasureArgs<T> | null = null;

  const disconnect = () => {
    observer?.disconnect();
    observer = null;
    observed.clear();
  };
  const bumpVersion = () => {
    const current = snapshot.getSnapshot();
    snapshot.setSnapshot({ ...current, version: current.version + 1 });
  };
  const bumpNonce = () => {
    const current = snapshot.getSnapshot();
    snapshot.setSnapshot({ ...current, nonce: current.nonce + 1 });
  };

  const measure = (args: AutoHeightMeasureArgs<T>) => {
    const { autoHeightActive, rowHeightStore, rowMetrics, rowModel } = args;
    const el = args.scrollContainerRef.current;
    // 無効時(toggle OFF 等)は永続 observer を破棄して終了します。
    if (!autoHeightActive || !rowHeightStore) {
      disconnect();
      return;
    }
    if (!el) {
      return;
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
        const height = Math.ceil(cell.getBoundingClientRect().height);
        const prev = perRow.get(idx);
        if (prev === undefined || height > prev) {
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
        const anchorTopAfter = rowHeightStore.prefix[anchorRow];
        // ペイント前(layout フレーム内)に同期適用してジャンプを消します。
        el.scrollTop = anchorTopAfter + offset;
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
      current.add(cell);
      if (!observed.has(cell)) {
        active.observe(cell);
        observed.add(cell);
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
    dispose: disconnect,
  };
};