// 追加(label-row ①): ラベル行(見出し / 区切り行)の純ロジックです。DOM / React に依存しません。
//
// 設計(合意済み):
//   - ラベル行は rows 配列の中に混在し、labelRow.isLabelRow(row) で識別します(行の型 T は変えない)。
//     Excel 由来データの形そのままで、行ドラッグ / undo / onRowsChange / SSRM(サーバーがブロック内に
//     ラベル行を返す)がそのまま動きます。
//   - 行パイプラインでは、まずラベル行を除いた「データ行だけの恒等 order」を作り(resolveLabelRowLayout /
//     createLabelFreeOrder)、フィルター / ソートはデータ行だけで行います。その後段でラベル行を差し戻して
//     表示順(LabelDisplay.displayOrder)を作ります(buildLabelDisplay)。
//   - 表示順のエンコードはグルーピング(logic/grouping.ts)と同じ Int32Array です:
//       値 >= 0 … データ行(値 = source index)
//       値 <  0 … ラベル行(-値 - 1 が LabelDisplay.labels の index)
//     RowModel ではラベル行の viewIndex で getRow / getSourceIndex が undefined、getLabelRow が記述子を
//     返します(グループ行と同じ契約 = 既存 consumer の !row ガードがそのまま効く)。
//   - 「セクション」= ラベル行から次のラベル行の直前までの区間です(先頭にラベル行が無い場合、最初の
//     ラベル行より前の行は「セクション 0(ラベル無し)」)。sortMode:
//       'section' … 安定ソート済み order をセクション別に bucket 分けし、セクション順に連結します
//                   (ソートはセクション内に閉じ、境界は動かない)。
//       'follow'  … 全体順のまま、各セクションの「最初に現れるデータ行」の直前にラベル行を差します。
//       'hide'    … ソート / フィルター適用中はラベル行を出しません。
//     ソートもフィルターも無いときは 3 モードとも出力が一致し、rows の並びそのもの(恒等)になります
//     (= 行ドラッグの恒等判定はデータ行 order と label-free order の一致で行えます)。
import type { GridLabelRow, GridRowKey, LabelRowSortMode, RowModel } from '../model/gridTypes.unbound';
import type { RowOrder } from './filtering';

// rows を 1 パスして得る、ラベル行の配置です(rows / isLabelRow が変わったときだけ再計算)。
export type LabelRowLayout = {
  // ラベル行の source index(昇順)。
  labelIndexes: Int32Array;
  // source index → セクション番号(0 = 最初のラベル行より前。k >= 1 は labelIndexes[k-1] のラベル行が
  //   率いるセクション。ラベル行自身も自分のセクション番号)。
  sectionBySource: Int32Array;
  // データ行数(= rows.length - labelIndexes.length)。
  dataRowCount: number;
};

// ラベル行の配置を解決します。ラベル行が 1 つも無ければ null(呼び出し側は機能を素通しにします)。
export const resolveLabelRowLayout = <T,>(
  rows: readonly T[],
  isLabelRow: (row: T, sourceIndex: number) => boolean,
): LabelRowLayout | null => {
  const rowCount = rows.length;
  const labels: number[] = [];
  const sectionBySource = new Int32Array(rowCount);
  let section = 0;
  for (let i = 0; i < rowCount; i += 1) {
    if (isLabelRow(rows[i], i)) {
      labels.push(i);
      section += 1;
    }
    sectionBySource[i] = section;
  }
  if (labels.length === 0) {
    return null;
  }
  return {
    labelIndexes: Int32Array.from(labels),
    sectionBySource,
    dataRowCount: rowCount - labels.length,
  };
};

// ラベル行を除いた恒等 order(データ行の source index 昇順)です。パイプラインの baseOrder に使います。
export const createLabelFreeOrder = (layout: LabelRowLayout, rowCount: number): RowOrder => {
  const out = new Int32Array(layout.dataRowCount);
  const { labelIndexes } = layout;
  let k = 0;
  let n = 0;
  for (let i = 0; i < rowCount; i += 1) {
    if (k < labelIndexes.length && labelIndexes[k] === i) {
      k += 1;
      continue;
    }
    out[n] = i;
    n += 1;
  }
  return out;
};

// order が baseOrder と同じ並びか(長さ・各要素の一致)。ラベル行あり時の行ドラッグ恒等判定に使います。
export const isSameOrder = (order: ArrayLike<number>, baseOrder: ArrayLike<number>): boolean => {
  if (order.length !== baseOrder.length) {
    return false;
  }
  for (let i = 0; i < order.length; i += 1) {
    if (order[i] !== baseOrder[i]) {
      return false;
    }
  }
  return true;
};

// 表示順(ラベル行込み)です。
export type LabelDisplay<T> = {
  // 値 >= 0 はデータ行の source index、値 < 0 はラベル行(-値 - 1 = labels の index)。
  displayOrder: Int32Array;
  // 表示されるラベル行の記述子(表示順)。
  labels: GridLabelRow<T>[];
  // 表示されるラベル行の view index(昇順。labels と同じ並び)。縦固定 / 行番号 / 貼り付けの読み飛ばしに使います。
  labelViewIndexes: Int32Array;
};

export const isLabelOrderValue = (value: number): boolean => value < 0;
export const labelIndexOfOrderValue = (value: number): number => -value - 1;

export type BuildLabelDisplayArgs<T> = {
  rows: readonly T[];
  // フィルター / ソート済みのデータ行 order(ラベル行を含まない)。
  order: RowOrder;
  layout: LabelRowLayout;
  sortMode: LabelRowSortMode;
  keepEmptySections: boolean;
  // ソートが 1 本以上有効か(フィルターの有無は order.length と dataRowCount の比較で判定します)。
  sortActive: boolean;
  getLabel: (row: T) => string;
};

const makeLabel = <T,>(
  rows: readonly T[],
  sourceIndex: number,
  getLabel: (row: T) => string,
  sectionRowCount: number,
): GridLabelRow<T> => ({
  kind: 'label',
  row: rows[sourceIndex],
  sourceIndex,
  label: getLabel(rows[sourceIndex]),
  sectionRowCount,
});

// データ行 order(フィルター / ソート後)にラベル行を差し戻し、表示順を作ります。
export const buildLabelDisplay = <T,>({
  rows,
  order,
  layout,
  sortMode,
  keepEmptySections,
  sortActive,
  getLabel,
}: BuildLabelDisplayArgs<T>): LabelDisplay<T> => {
  const { labelIndexes, sectionBySource, dataRowCount } = layout;
  const labelCount = labelIndexes.length;
  const sectionCount = labelCount + 1;
  const filterActive = order.length !== dataRowCount;
  const active = sortActive || filterActive;

  const out: number[] = [];
  const labels: GridLabelRow<T>[] = [];
  const labelViewIndexes: number[] = [];
  const emitLabel = (k: number, sectionRowCount: number): void => {
    labels.push(makeLabel(rows, labelIndexes[k], getLabel, sectionRowCount));
    labelViewIndexes.push(out.length);
    out.push(-labels.length);
  };
  const finish = (): LabelDisplay<T> => ({
    displayOrder: Int32Array.from(out),
    labels,
    labelViewIndexes: Int32Array.from(labelViewIndexes),
  });

  // 'hide': ソート / フィルター中はラベル行を出さず、データ行 order をそのまま表示順にします。
  if (sortMode === 'hide' && active) {
    return { displayOrder: order, labels, labelViewIndexes: new Int32Array(0) };
  }

  // セクション別の件数(フィルター後)。
  const counts = new Int32Array(sectionCount);
  for (let pos = 0; pos < order.length; pos += 1) {
    counts[sectionBySource[order[pos]]] += 1;
  }
  // ラベル行を出すか: 中身があるか、空セクションを残す設定か、そもそもフィルターされていないか。
  const showLabel = (k: number): boolean =>
    counts[k + 1] > 0 || keepEmptySections || !filterActive;

  // 'follow'(ソート / フィルター中のみ意味を持つ。非活性時はセクション方式と同じ出力 = 恒等)。
  if (sortMode === 'follow' && active) {
    // 各セクションの「order 上で最初に現れるデータ行」の位置。
    const firstPos = new Int32Array(sectionCount).fill(-1);
    for (let pos = 0; pos < order.length; pos += 1) {
      const section = sectionBySource[order[pos]];
      if (firstPos[section] === -1) {
        firstPos[section] = pos;
      }
    }
    // 「pos がどのセクションの先頭か」の逆引き。
    const sectionAtPos = new Map<number, number>();
    for (let k = 0; k < labelCount; k += 1) {
      const pos = firstPos[k + 1];
      if (pos !== -1) {
        sectionAtPos.set(pos, k);
      }
    }
    // 中身の無いセクションのラベルは(残す設定のときだけ)元の順序を保ったまま、次に現れる
    //   ラベル行の直前 / 末尾へ差します。nextEmptyK は「まだ検討していない最小のラベル index」。
    let nextEmptyK = 0;
    const flushEmptyBefore = (k: number): void => {
      while (nextEmptyK < k) {
        if (keepEmptySections && firstPos[nextEmptyK + 1] === -1) {
          emitLabel(nextEmptyK, 0);
        }
        nextEmptyK += 1;
      }
    };
    for (let pos = 0; pos < order.length; pos += 1) {
      const k = sectionAtPos.get(pos);
      if (k !== undefined) {
        flushEmptyBefore(k);
        nextEmptyK = Math.max(nextEmptyK, k + 1);
        emitLabel(k, counts[k + 1]);
      }
      out.push(order[pos]);
    }
    flushEmptyBefore(labelCount);
    return finish();
  }

  // 'section'(および非活性時の全モード): 安定な bucket 分けでセクション順に連結します。
  const offsets = new Int32Array(sectionCount + 1);
  for (let k = 0; k < sectionCount; k += 1) {
    offsets[k + 1] = offsets[k] + counts[k];
  }
  const bucketed = new Int32Array(order.length);
  const cursor = offsets.slice(0, sectionCount);
  for (let pos = 0; pos < order.length; pos += 1) {
    const section = sectionBySource[order[pos]];
    bucketed[cursor[section]] = order[pos];
    cursor[section] += 1;
  }
  for (let k = 0; k < sectionCount; k += 1) {
    if (k > 0 && !showLabel(k - 1)) {
      continue;
    }
    if (k > 0) {
      emitLabel(k - 1, counts[k]);
    }
    for (let pos = offsets[k]; pos < offsets[k + 1]; pos += 1) {
      out.push(bucketed[pos]);
    }
  }
  return finish();
};

// ラベル行込みの表示順から RowModel を作ります(グルーピング版と同じ契約)。
export const createLabelRowModel = <T,>(
  display: LabelDisplay<T>,
  rows: readonly T[],
  rowKeyGetter: (row: T, index: number) => GridRowKey,
): RowModel<T> => {
  const { displayOrder, labels } = display;
  return {
    getRowCount: () => displayOrder.length,
    // ラベル行では displayOrder 値が負のため rows[負値] = undefined(型は T のまま・実行時 undefined)。
    getRow: (viewIndex) => rows[displayOrder[viewIndex]],
    getSourceIndex: (viewIndex) => {
      const value = displayOrder[viewIndex];
      return value >= 0 ? value : (undefined as unknown as number);
    },
    getRowKey: (viewIndex) => {
      const value = displayOrder[viewIndex];
      if (isLabelOrderValue(value)) {
        const label = labels[labelIndexOfOrderValue(value)];
        return rowKeyGetter(label.row, label.sourceIndex);
      }
      return rowKeyGetter(rows[value], value);
    },
    getLabelRow: (viewIndex): GridLabelRow<T> | undefined => {
      const value = displayOrder[viewIndex];
      return isLabelOrderValue(value) ? labels[labelIndexOfOrderValue(value)] : undefined;
    },
  };
};

// serverSide(SSRM)用: 既存の RowModel を包み、述語でラベル行を判定します。ラベル行では getRow /
//   getSourceIndex を undefined に倒し、getLabelRow が記述子を返します(sectionRowCount は不明 = undefined)。
//   記述子は行オブジェクト単位で WeakMap にキャッシュし、同じ行なら同じ参照を返します(描画 memo 用)。
export const wrapRowModelWithLabelRows = <T,>(
  base: RowModel<T>,
  isLabelRow: (row: T, sourceIndex: number) => boolean,
  getLabel: (row: T) => string,
): RowModel<T> => {
  const cache = new WeakMap<object, GridLabelRow<T>>();
  const labelOf = (viewIndex: number): GridLabelRow<T> | undefined => {
    const row = base.getRow(viewIndex) as T | undefined;
    if (row === undefined) {
      return undefined;
    }
    const sourceIndex = base.getSourceIndex(viewIndex);
    if (!isLabelRow(row, sourceIndex)) {
      return undefined;
    }
    const cacheable = typeof row === 'object' && row !== null;
    const cached = cacheable ? cache.get(row as unknown as object) : undefined;
    if (cached) {
      return cached;
    }
    const label: GridLabelRow<T> = {
      kind: 'label',
      row,
      sourceIndex,
      label: getLabel(row),
      sectionRowCount: undefined,
    };
    if (cacheable) {
      cache.set(row as unknown as object, label);
    }
    return label;
  };
  return {
    getRowCount: base.getRowCount,
    getRow: (viewIndex) => (labelOf(viewIndex) ? (undefined as unknown as T) : base.getRow(viewIndex)),
    getSourceIndex: (viewIndex) =>
      labelOf(viewIndex) ? (undefined as unknown as number) : base.getSourceIndex(viewIndex),
    getRowKey: base.getRowKey,
    getGroupRow: base.getGroupRow,
    getLabelRow: labelOf,
  };
};

// index 未満のラベル行 view index の個数(= 二分探索 lower_bound)。
export const countLabelsBefore = (labelViewIndexes: ArrayLike<number>, viewIndex: number): number => {
  let lo = 0;
  let hi = labelViewIndexes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (labelViewIndexes[mid] < viewIndex) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
};

// データ行の通し番号(1 始まり。ラベル行を飛ばして数える)。viewIndex がラベル行のときは
//   「その直前までのデータ行数 + 1」= 次のデータ行の番号を返します(呼び出し側はラベル行では使わない想定)。
export const resolveDataRowNumber = (labelViewIndexes: ArrayLike<number>, viewIndex: number): number =>
  viewIndex - countLabelsBefore(labelViewIndexes, viewIndex) + 1;

// viewIndex が属するセクションのラベル行(view index)を返します。viewIndex より前(同じ index を含む)に
//   ラベル行が無ければ -1(セクション 0)。縦固定(sticky)の現在セクション判定に使います。
export const resolveSectionLabelViewIndex = (
  labelViewIndexes: ArrayLike<number>,
  viewIndex: number,
): number => {
  const k = countLabelsBefore(labelViewIndexes, viewIndex + 1);
  return k > 0 ? labelViewIndexes[k - 1] : -1;
};

// 貼り付け先の view index 列を解決します。startViewIndex から count 行ぶん、ラベル行を読み飛ばして
//   データ行の view index を集めます。viewRowCount 以降(末尾追記ぶん)はラベル行が無いものとして
//   連番で埋めます(clipboardController の appendBase 計算と同じ index 空間)。
export const resolvePasteTargetViewIndexes = <T,>(
  rowModel: RowModel<T>,
  startViewIndex: number,
  count: number,
): number[] => {
  const targets: number[] = [];
  const viewRowCount = rowModel.getRowCount();
  let viewIndex = startViewIndex;
  while (targets.length < count) {
    if (viewIndex >= viewRowCount || !rowModel.getLabelRow?.(viewIndex)) {
      targets.push(viewIndex);
    }
    viewIndex += 1;
  }
  return targets;
};

// 追加(label-row ③.5): 縦スクロール固定(labelRow.sticky)の解決です。
//   「現在のセクション」= 可視域の先頭行が属するセクション。そのラベル行が可視域より上へ隠れている
//   ときだけ固定表示し、次のラベル行の上端が固定帯の下端へ到達したら押し上げます(pushOffset)。
//   rowMetrics / scrollTop は論理座標(content-top 基準)です。
export type StickyLabelResolution = {
  // 固定表示するラベル行の view index。
  labelViewIndex: number;
  // 固定帯の高さ(= そのラベル行のセル行高)。
  height: number;
  // 次のラベル行に押し上げられている量(px, >= 0)。translateY(-pushOffset) で描きます。
  pushOffset: number;
};

export type StickyLabelMetrics = {
  rowCount: number;
  rowTop: (index: number) => number;
  cellHeight: (index: number) => number;
  rowAtContentY: (y: number) => number;
};

export const resolveStickyLabel = (
  labelViewIndexes: ArrayLike<number>,
  rowMetrics: StickyLabelMetrics,
  logicalScrollTop: number,
): StickyLabelResolution | null => {
  if (labelViewIndexes.length === 0 || rowMetrics.rowCount <= 0 || logicalScrollTop <= 0) {
    return null;
  }
  const topRow = rowMetrics.rowAtContentY(logicalScrollTop);
  const k = countLabelsBefore(labelViewIndexes, topRow + 1);
  if (k === 0) {
    return null;
  }
  const labelViewIndex = labelViewIndexes[k - 1];
  // ラベル行自身が可視域の先頭に(自然な位置で)見えているなら固定不要。
  if (rowMetrics.rowTop(labelViewIndex) >= logicalScrollTop) {
    return null;
  }
  const height = rowMetrics.cellHeight(labelViewIndex);
  let pushOffset = 0;
  if (k < labelViewIndexes.length) {
    const nextTop = rowMetrics.rowTop(labelViewIndexes[k]) - logicalScrollTop;
    if (nextTop < height) {
      pushOffset = Math.min(height, Math.max(height - nextTop, 0));
    }
  }
  return { labelViewIndex, height, pushOffset };
};
