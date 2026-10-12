// 追加(選択範囲の集計): 2 セル以上を選んだときに下部バーへ出す「平均 / データの個数 / 合計」の純ロジックです。
//   - 対象レンジは Delete クリアと同じ解決(resolveClearTarget: cell / row / col 選択をビューへクランプ)。
//   - 数えるのはデータ行 × データ列のセルだけです。グループ行 / ラベル行(getRow が undefined)と合成列
//     (行ドラッグ / 展開トグル / 自動グループ列)は飛ばします。SSRM の未読み込み行(getRow が undefined で
//     グループ行でもラベル行でもない)は飛ばして partial を立てます。
//   - 数値の判定はグループ集計と同じ toAggregatableNumber(audit L-10)。空(null / undefined / '')は
//     「データの個数」にも数えません。
//   - 行単位で加算できる形(アキュムレータ)にして、大きな選択は controllers/selectionAggregatesRunner が
//     時間分割で回します。
import type { GridColumn, GridSelection, GridSelectionAggregates, RowModel } from '../model/gridTypes.unbound';
import { resolveClearTarget } from './clearCells';
import { toAggregatableNumber } from './aggregation';
import { isSyntheticColumnKey } from './detailRow';
import { getCellValue } from '../utils/permissions';

export type SelectionAggregateTarget<T> = {
  startRow: number;
  endRow: number;
  // 範囲内のデータ列(合成列を除く)。
  columns: GridColumn<T>[];
};

// 選択から集計対象を求めます。選択が 2 セル未満 / データ列が無いときは null(集計しない)。
export const resolveSelectionAggregateTarget = <T,>(
  selection: GridSelection,
  viewRowCount: number,
  orderedColumns: GridColumn<T>[],
): SelectionAggregateTarget<T> | null => {
  const range = resolveClearTarget(selection, null, viewRowCount, orderedColumns.length);
  if (!range) {
    return null;
  }
  const selectedCellCount = (range.endRow - range.startRow + 1) * (range.endCol - range.startCol + 1);
  if (selectedCellCount < 2) {
    return null;
  }
  const columns = orderedColumns
    .slice(range.startCol, range.endCol + 1)
    .filter((column) => !isSyntheticColumnKey(column.key));
  if (columns.length === 0) {
    return null;
  }
  return { startRow: range.startRow, endRow: range.endRow, columns };
};

// 走査するセル数の見積もり(同期で計算するか時間分割にするかの判定用)。
export const estimateSelectionAggregateCells = <T,>(target: SelectionAggregateTarget<T>): number =>
  (target.endRow - target.startRow + 1) * target.columns.length;

export type SelectionAggregateAccumulator = {
  cellCount: number;
  count: number;
  numericCount: number;
  sum: number;
  min: number;
  max: number;
  partial: boolean;
};

export const createSelectionAggregateAccumulator = (): SelectionAggregateAccumulator => ({
  cellCount: 0,
  count: 0,
  numericCount: 0,
  sum: 0,
  min: Infinity,
  max: -Infinity,
  partial: false,
});

// ビュー行 1 行ぶんを加算します(割り当てなしの in-place 更新)。
export const accumulateSelectionAggregateRow = <T,>(
  accumulator: SelectionAggregateAccumulator,
  rowModel: RowModel<T>,
  viewIndex: number,
  columns: GridColumn<T>[],
): void => {
  const row = rowModel.getRow(viewIndex) as T | undefined;
  if (row === undefined) {
    if (!rowModel.getGroupRow?.(viewIndex) && !rowModel.getLabelRow?.(viewIndex)) {
      accumulator.partial = true;
    }
    return;
  }
  for (const column of columns) {
    accumulator.cellCount += 1;
    const value = getCellValue(row, column);
    if (value === null || value === undefined || value === '') {
      continue;
    }
    accumulator.count += 1;
    const numeric = toAggregatableNumber(value);
    if (numeric === undefined) {
      continue;
    }
    accumulator.numericCount += 1;
    accumulator.sum += numeric;
    if (numeric < accumulator.min) {
      accumulator.min = numeric;
    }
    if (numeric > accumulator.max) {
      accumulator.max = numeric;
    }
  }
};

export const finalizeSelectionAggregates = (
  accumulator: SelectionAggregateAccumulator,
): GridSelectionAggregates => {
  const hasNumber = accumulator.numericCount > 0;
  return {
    status: 'ready',
    progress: 1,
    cellCount: accumulator.cellCount,
    count: accumulator.count,
    numericCount: accumulator.numericCount,
    sum: hasNumber ? accumulator.sum : undefined,
    average: hasNumber ? accumulator.sum / accumulator.numericCount : undefined,
    min: hasNumber ? accumulator.min : undefined,
    max: hasNumber ? accumulator.max : undefined,
    partial: accumulator.partial,
  };
};

// 計算中の値(未確定)。
export const createComputingSelectionAggregates = (progress: number): GridSelectionAggregates => ({
  status: 'computing',
  progress,
  cellCount: 0,
  count: 0,
  numericCount: 0,
  sum: undefined,
  average: undefined,
  min: undefined,
  max: undefined,
  partial: false,
});

// 同期で一括計算します(小さな選択用)。
export const computeSelectionAggregates = <T,>(
  rowModel: RowModel<T>,
  target: SelectionAggregateTarget<T>,
): GridSelectionAggregates => {
  const accumulator = createSelectionAggregateAccumulator();
  for (let viewIndex = target.startRow; viewIndex <= target.endRow; viewIndex += 1) {
    accumulateSelectionAggregateRow(accumulator, rowModel, viewIndex, target.columns);
  }
  return finalizeSelectionAggregates(accumulator);
};

// 下部バー用の数値表示です(浮動小数の誤差を 1e-6 で丸め、小数は 4 桁まで。桁区切りあり)。
export const formatSelectionAggregateNumber = (value: number): string =>
  (Math.round(value * 1e6) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 4 });