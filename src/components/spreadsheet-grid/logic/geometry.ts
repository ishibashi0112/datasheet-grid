import type { GridColumn } from '../model/gridTypes';

// 追加: 列の座標計算を共通化するための measurement 型です。
export type ColumnMeasurement<T> = {
  index: number;
  column: GridColumn<T>;
  start: number;
  // 追加: 各列の実表示幅です。
  size: number;
  end: number;
};

// 追加: 値を min/max に収めるユーティリティです。
export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// 追加: columns + columnWidths から、列座標の measurement 一覧を生成します。
export const buildColumnMeasurements = <T,>(
  columns: GridColumn<T>[],
  columnWidths: Record<string, number>,
): ColumnMeasurement<T>[] => {
  let start = 0;

  return columns.map((column, index) => {
    const size = columnWidths[column.key] ?? column.width;
    const measurement: ColumnMeasurement<T> = {
      index,
      column,
      start,
      size,
      end: start + size,
    };
    start += size;
    return measurement;
  });
};

// 追加: x 座標から列 index を特定するための二分探索です。
export const findColumnIndexFromOffset = <T,>(
  measurements: ColumnMeasurement<T>[],
  offset: number,
) => {
  if (measurements.length === 0) {
    return -1;
  }

  if (offset <= 0) {
    return 0;
  }

  let low = 0;
  let high = measurements.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = measurements[mid];

    if (offset < current.start) {
      high = mid - 1;
      continue;
    }

    if (offset >= current.end) {
      low = mid + 1;
      continue;
    }

    return current.index;
  }

  return Math.max(0, Math.min(low, measurements.length - 1));
};