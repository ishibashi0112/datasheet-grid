// 追加(差し込み式 段階 5): 列フィルターの段です(React 非依存。engine/rowPipeline の resolveOrder から移設した部分)。
//   グローバルフィルター済みの order を列フィルターで絞り込みます。number(comparison / range)用の Float64 key の
//   前計算(B-2)と、結果の中身が前回と同じなら前回の参照を返すキャッシュ(監査 B-10)を含みます。挙動は移設前と同じです。
//   機能セットの filtering から行パイプラインへ渡し(createRowPipelineResolver の引数)、無い構成では行パイプラインが
//   この段を通しません(列フィルターは評価しない)。
import type { ColumnFilterValue, GridColumn } from '../model/gridTypes.unbound';
import {
  coerceNumberFilterCellValue,
  columnFilterUsesNumericKey,
  filterOrderByColumns,
  type RowOrder,
} from '../logic/filtering';
import { isSameOrder } from '../logic/labelRows';
import { getCellValue } from '../utils/permissions';
import { createMemo } from './memo';

// number 列シグネチャの区切り(NUL は列キーへの混入が実質ありえないため)。
const SIGNATURE_SEPARATOR = '\u0000';

// rows: 元の行 / globalFilteredOrder: グローバルフィルター済み order / columns: 評価対象の列(非表示列を含む)/
//   columnFilters: 列フィルターの評価値 / relativeDateKey: 相対日付プリセットの範囲のキー(無ければ '')。
export type ColumnFilterStage<T> = (
  rows: T[],
  globalFilteredOrder: RowOrder,
  columns: GridColumn<T>[],
  columnFilters: Record<string, ColumnFilterValue>,
  relativeDateKey: string,
) => RowOrder;

export const createColumnFilterStage = <T,>(): ColumnFilterStage<T> => {
  // number 記述子が当たっている可視列の「集合シグネチャ」(B-2)。値編集(>50 → >500 等)では同一列のままなので
  //   不変 → 下の numericFilterKeys を保持し、Float64 key をフィルタ値編集をまたいで再利用します。
  const memoNumberSignature = createMemo(
    (visibleColumns: GridColumn<T>[], columnFilters: Record<string, ColumnFilterValue>) => {
      const keys: string[] = [];
      for (const column of visibleColumns) {
        if (columnFilterUsesNumericKey(columnFilters[column.key])) {
          keys.push(column.key);
        }
      }
      return keys.join(SIGNATURE_SEPARATOR);
    },
  );
  // number(comparison/range)用に、列ごとの Number(セル値) を rows 全長・sourceIndex 添字の Float64Array へ
  //   前計算したキャッシュ(signature に載った列ぶんだけ。number 未使用なら空 Map = 実質ゼロコスト)。
  const memoNumericKeys = createMemo((rows: T[], visibleColumns: GridColumn<T>[], signature: string) => {
    const keyMap = new Map<string, Float64Array>();
    if (signature.length === 0) {
      return keyMap;
    }
    const targetKeys = new Set(signature.split(SIGNATURE_SEPARATOR));
    const rowCount = rows.length;
    for (const column of visibleColumns) {
      if (!targetKeys.has(column.key)) {
        continue;
      }
      const keys = new Float64Array(rowCount);
      for (let i = 0; i < rowCount; i += 1) {
        // 数値化は coerceNumberFilterCellValue(空白 = NaN)へ統一(compileSingleColumnFilter の非 key 経路と同一規則)。
        keys[i] = coerceNumberFilterCellValue(getCellValue(rows[i], column));
      }
      keyMap.set(column.key, keys);
    }
    return keyMap;
  });
  // 列フィルター済み order。入力がすべて前回と同じ参照なら前回の結果を返します(旧 createMemo と同じ)。
  // 変更(監査 L-15): 相対日付プリセットの範囲のキー(relativeDateKey)も入力に足し、範囲が変わったら評価し直します。
  // 変更(監査 B-10): 評価し直した結果の中身が前回と同じなら前回の参照を返します。1 セル編集で rows の参照が変わっても
  //   絞り込み結果が変わらなければ、下流(ソート / グルーピング / ラベル行 / RowModel の利用側)が「並びは不変」と
  //   判断できるようにするためです(中身の比較は O(n) で、絞り込み自体の O(n) に比べて十分小さい)。
  let filterCache: {
    rows: T[];
    globalFilteredOrder: RowOrder;
    columns: GridColumn<T>[];
    columnFilters: Record<string, ColumnFilterValue>;
    numericKeys: Map<string, Float64Array>;
    relativeDateKey: string;
    result: RowOrder;
  } | null = null;
  const resolveColumnFiltered = (
    rows: T[],
    globalFilteredOrder: RowOrder,
    columns: GridColumn<T>[],
    columnFilters: Record<string, ColumnFilterValue>,
    numericKeys: Map<string, Float64Array>,
    relativeDateKey: string,
  ): RowOrder => {
    const cached = filterCache;
    if (
      cached !== null &&
      cached.rows === rows &&
      cached.globalFilteredOrder === globalFilteredOrder &&
      cached.columns === columns &&
      cached.columnFilters === columnFilters &&
      cached.numericKeys === numericKeys &&
      cached.relativeDateKey === relativeDateKey
    ) {
      return cached.result;
    }
    let result = filterOrderByColumns(rows, globalFilteredOrder, columns, columnFilters, numericKeys);
    if (cached !== null && result !== cached.result && isSameOrder(result, cached.result)) {
      result = cached.result;
    }
    filterCache = { rows, globalFilteredOrder, columns, columnFilters, numericKeys, relativeDateKey, result };
    return result;
  };

  return (rows, globalFilteredOrder, columns, columnFilters, relativeDateKey) => {
    const signature = memoNumberSignature(columns, columnFilters);
    const numericKeys = memoNumericKeys(rows, columns, signature);
    return resolveColumnFiltered(rows, globalFilteredOrder, columns, columnFilters, numericKeys, relativeDateKey);
  };
};