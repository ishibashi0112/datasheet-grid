import type { GridColumn, SetColumnFilterValue } from '../model/gridTypes';
import { getCellValue } from '../utils/permissions';

// 追加: filtering / sorting で共通利用しやすい最小 row model 型です。
export type GridRowModelLike<T> = {
  row: T;
  sourceIndex: number;
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