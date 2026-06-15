import type { GridColumn, SetColumnFilterValue } from '../model/gridTypes';
import { getCellValue } from '../utils/permissions';

// 追加: filtering / sorting で共通利用しやすい最小 row model 型です。
export type GridRowModelLike<T> = {
  row: T;
  sourceIndex: number;
};

// 追加(DS-1 / index ベースパイプライン): 「ビュー順に並んだ元 rows の index 列」です。
//   オブジェクト配列({row, sourceIndex, ...})を各段で割り当て直す従来方式に代えて、
//   フィルタ/ソートはこの index 列(Int32Array)だけを生成・受け渡しします。
//   - 1,000,000 行でも 4MB(= 4byte × N)に収まり、割り当て/GC が行オブジェクト方式から桁で下がります。
//   - 将来 Web Worker へ渡す際に transferable(ゼロコピー)になります。
//   - ビュー位置 i の元行は rows[order[i]] で引きます(この対応付けが後段のシームの土台)。
//   DS-1 は純関数の追加のみで、配線(SpreadsheetGrid 側のチェーン差し替え)は DS-2 で行います。
export type RowOrder = Int32Array;

// 追加(DS-1): 恒等 order [0, 1, ..., rowCount-1] を生成します(パイプラインの起点)。
export const createSourceOrder = (rowCount: number): RowOrder => {
  const order = new Int32Array(rowCount);
  for (let i = 0; i < rowCount; i += 1) {
    order[i] = i;
  }
  return order;
};

// 追加(12-A): set フィルター値の type guard です。
export const isSetColumnFilterValue = (
  value: unknown,
): value is SetColumnFilterValue =>
  typeof value === 'object' &&
  value !== null &&
  (value as SetColumnFilterValue).kind === 'set' &&
  Array.isArray((value as SetColumnFilterValue).values);

// 追加(12-A): 列フィルター値が「有効」かを判定する共通 helper です。
// 変更理由: 従来は GridHeaderRow(フィルター済みバッジ) / gridBarHelpers(有効件数) /
//   applyColumnFilters がそれぞれ String(value).trim() で判定していました。
//   set フィルター値はオブジェクトのため String() 判定が成立しません
//   (空配列 = 全行除外でも「有効」と数える必要があります)。
//   有効判定をここへ一元化し、3 箇所すべてが同じ規則を共有します。
//   set 以外は従来どおり「非空文字列のみ有効」で挙動等価です。
export const isActiveColumnFilterValue = (value: unknown): boolean => {
  if (isSetColumnFilterValue(value)) {
    // 注記: 全選択時は reducer 側で clearColumn 済みのため、値が存在する時点で有効です。
    return true;
  }
  return String(value ?? '').trim().length > 0;
};

// 追加: number フィルターの解釈結果です。
export type ParsedNumberFilter =
  | {
      mode: 'comparison';
      operator: '>' | '>=' | '<' | '<=' | '=';
      value: number;
    }
  | {
      mode: 'range';
      min: number;
      max: number;
    };

// 追加: 行フィルターの最小実装です。初版では global filter のみをここで扱います。
export const applyGlobalFilter = <T, R extends GridRowModelLike<T>>(
  rowModels: R[],
  columns: GridColumn<T>[],
  globalText: string,
) => {
  const normalizedFilter = globalText.trim().toLowerCase();
  if (!normalizedFilter) {
    return rowModels;
  }

  return rowModels.filter((rowModel) =>
    columns.some((column) => {
      const value = getCellValue(rowModel.row, column);
      return String(value ?? '').toLowerCase().includes(normalizedFilter);
    }),
  );
};

// 追加: number フィルター式を解釈します。
export const parseNumberFilterExpression = (
  rawValue: string,
): ParsedNumberFilter | null => {
  const normalized = rawValue.trim();
  if (!normalized) {
    return null;
  }

  const rangeMatch = normalized.match(
    /^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/,
  );
  if (rangeMatch) {
    const first = Number(rangeMatch[1]);
    const second = Number(rangeMatch[2]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) {
      return null;
    }
    return {
      mode: 'range',
      min: Math.min(first, second),
      max: Math.max(first, second),
    };
  }

  const comparisonMatch = normalized.match(
    /^(<=|>=|=|<|>)?\s*(-?\d+(?:\.\d+)?)$/,
  );
  if (!comparisonMatch) {
    return null;
  }

  return {
    mode: 'comparison',
    operator: (comparisonMatch[1] ?? '=') as '>' | '>=' | '<' | '<=' | '=',
    value: Number(comparisonMatch[2]),
  };
};

// 追加: number 型フィルターの評価です。
export const applyNumberFilter = (
  cellValue: unknown,
  filterValue: unknown,
) => {
  const normalizedFilter = String(filterValue ?? '').trim();
  if (!normalizedFilter) {
    return true;
  }

  const parsedFilter = parseNumberFilterExpression(normalizedFilter);
  if (!parsedFilter) {
    // 追加: 式として解釈できない場合は contains にフォールバックします。
    return String(cellValue ?? '')
      .toLowerCase()
      .includes(normalizedFilter.toLowerCase());
  }

  const numericCellValue = Number(cellValue);
  if (!Number.isFinite(numericCellValue)) {
    return false;
  }

  if (parsedFilter.mode === 'range') {
    return (
      numericCellValue >= parsedFilter.min &&
      numericCellValue <= parsedFilter.max
    );
  }

  switch (parsedFilter.operator) {
    case '>':
      return numericCellValue > parsedFilter.value;
    case '>=':
      return numericCellValue >= parsedFilter.value;
    case '<':
      return numericCellValue < parsedFilter.value;
    case '<=':
      return numericCellValue <= parsedFilter.value;
    case '=':
    default:
      return numericCellValue === parsedFilter.value;
  }
};

// 変更(12-A): applyColumnFilters を「行ループ前の事前コンパイル方式」へ変更します。
// 変更理由:
//   1) set フィルターは候補が多い列(例: 品番 5,000 種)でも O(1) 判定にしたく、
//      行ループの外で一度だけ Set を構築する必要があります。
//   2) 旧実装は rows.filter × columns.every の内側で毎回
//      String(filterValue).trim().toLowerCase() を実行しており、フィルター未設定の列も
//      含めて「行数 × 全列数」(5,000 × 29 ≒ 14.5 万回)の正規化が毎適用で走っていました。
//      有効な列フィルターだけを predicate へ事前コンパイルすることで、行ループは
//      「有効フィルター数 × 行数」に縮小します(text / number / select の判定結果は
//      従来と等価です)。
type CompiledColumnFilterPredicate<T> = (row: T) => boolean;

// 追加(12-A): 1 列ぶんのフィルター値を predicate へコンパイルします。
//             無効(未設定)なら null を返し、行ループから除外します。
const compileSingleColumnFilter = <T,>(
  column: GridColumn<T>,
  filterValue: unknown,
): CompiledColumnFilterPredicate<T> | null => {
  if (!isActiveColumnFilterValue(filterValue)) {
    return null;
  }

  // 注記: 従来どおり column.filterFn を最優先します(set 値が渡るケースも
  //       利用側 filterFn の責務とし、挙動の優先順位は変えません)。
  if (column.filterFn) {
    const filterFn = column.filterFn;
    return (row) => filterFn(row, filterValue);
  }

  // 追加(12-A): set フィルターは「許可値の Set」を一度だけ構築し、O(1) 照合します。
  if (isSetColumnFilterValue(filterValue)) {
    const allowedValues = new Set(filterValue.values);
    return (row) => allowedValues.has(String(getCellValue(row, column) ?? ''));
  }

  const filterType = column.filterType ?? 'text';

  if (filterType === 'number') {
    return (row) => applyNumberFilter(getCellValue(row, column), filterValue);
  }

  if (filterType === 'select') {
    const expectedValue = String(filterValue ?? '');
    return (row) => String(getCellValue(row, column) ?? '') === expectedValue;
  }

  // text / date / custom(filterFn なし)は従来どおり部分一致です。
  const normalizedFilter = String(filterValue ?? '').trim().toLowerCase();
  return (row) =>
    String(getCellValue(row, column) ?? '')
      .toLowerCase()
      .includes(normalizedFilter);
};

// 変更(12-A): 列ごとのフィルターを適用します。text / number / select / set 対応です。
//             column.filterFn がある場合はそれを優先します。
export const applyColumnFilters = <T, R extends GridRowModelLike<T>>(
  rowModels: R[],
  columns: GridColumn<T>[],
  columnFilters: Record<string, unknown>,
) => {
  const predicates: CompiledColumnFilterPredicate<T>[] = [];
  for (const column of columns) {
    const predicate = compileSingleColumnFilter(
      column,
      columnFilters[column.key],
    );
    if (predicate) {
      predicates.push(predicate);
    }
  }

  // 追加(12-A): 有効フィルターなしのときは同一配列参照を返し、
  //             下流 useMemo(sorted 以降)のスキップを最大化します。
  if (predicates.length === 0) {
    return rowModels;
  }

  return rowModels.filter((rowModel) =>
    predicates.every((predicate) => predicate(rowModel.row)),
  );
};

// ────────────────────────────────────────────────
// 追加(DS-1 / index ベースパイプライン): order(RowOrder)を受けて order を返すフィルタ群。
//   既存の applyGlobalFilter / applyColumnFilters(オブジェクト配列版)とビュー順は
//   厳密に等価です(下記いずれも「合格行を元の相対順で詰め直す」だけ)。違いは:
//     - 入出力が {row,...}[] ではなく元 rows + index 列(Int32Array)であること。
//     - 「全件通過」のとき同一参照(引数 order)を返し、下流 useMemo のスキップを最大化すること
//       (.filter は全通過でも新配列を返すため、参照節約という点ではむしろ改善です)。
//   DS-1 では未配線。DS-2 で SpreadsheetGrid のチェーンをこちらへ差し替えます。
// ────────────────────────────────────────────────

// 追加(DS-1): グローバルフィルタの index 版です。applyGlobalFilter と等価
//   (columns.some の部分一致)。filter 文字列が空なら同一参照を返します。
export const filterOrderByGlobalText = <T,>(
  rows: T[],
  order: RowOrder,
  columns: GridColumn<T>[],
  globalText: string,
): RowOrder => {
  const normalizedFilter = globalText.trim().toLowerCase();
  if (!normalizedFilter) {
    return order;
  }

  const length = order.length;
  const columnCount = columns.length;
  const result = new Int32Array(length);
  let count = 0;

  for (let pos = 0; pos < length; pos += 1) {
    const sourceIndex = order[pos];
    const row = rows[sourceIndex];
    let matched = false;
    for (let c = 0; c < columnCount; c += 1) {
      const value = getCellValue(row, columns[c]);
      if (String(value ?? '').toLowerCase().includes(normalizedFilter)) {
        matched = true;
        break;
      }
    }
    if (matched) {
      result[count] = sourceIndex;
      count += 1;
    }
  }

  // 全件通過なら参照を変えません(no-op スキップ最大化)。
  if (count === length) {
    return order;
  }
  // 余剰バッファを抱えないよう、右サイズへ slice(コピー)します。
  return result.slice(0, count);
};

// 追加(DS-1): 列フィルタの index 版です。applyColumnFilters と等価
//   (有効フィルタの predicates.every)。事前コンパイルは既存の compileSingleColumnFilter を
//   そのまま再利用します(text / number / select / set / filterFn の判定は完全同一)。
//   有効フィルタが 0 件なら同一参照を返します。
export const filterOrderByColumns = <T,>(
  rows: T[],
  order: RowOrder,
  columns: GridColumn<T>[],
  columnFilters: Record<string, unknown>,
): RowOrder => {
  const predicates: CompiledColumnFilterPredicate<T>[] = [];
  for (const column of columns) {
    const predicate = compileSingleColumnFilter(
      column,
      columnFilters[column.key],
    );
    if (predicate) {
      predicates.push(predicate);
    }
  }

  if (predicates.length === 0) {
    return order;
  }

  const length = order.length;
  const predicateCount = predicates.length;
  const result = new Int32Array(length);
  let count = 0;

  for (let pos = 0; pos < length; pos += 1) {
    const sourceIndex = order[pos];
    const row = rows[sourceIndex];
    let ok = true;
    for (let p = 0; p < predicateCount; p += 1) {
      if (!predicates[p](row)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      result[count] = sourceIndex;
      count += 1;
    }
  }

  if (count === length) {
    return order;
  }
  return result.slice(0, count);
};
