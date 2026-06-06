import type { GridColumn } from '../model/gridTypes';
import { getCellValue } from '../utils/permissions';

// 追加: filtering / sorting で共通利用しやすい最小 row model 型です。
export type GridRowModelLike<T> = {
  row: T;
  sourceIndex: number;
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

// 追加: 列ごとのフィルターを適用します。text / number / select の最小実装です。
//       column.filterFn がある場合はそれを優先します。
export const applyColumnFilters = <T, R extends GridRowModelLike<T>>(
  rowModels: R[],
  columns: GridColumn<T>[],
  columnFilters: Record<string, unknown>,
) => {
  return rowModels.filter((rowModel) =>
    columns.every((column) => {
      const filterValue = columnFilters[column.key];
      const normalizedFilter = String(filterValue ?? '').trim().toLowerCase();
      if (!normalizedFilter) {
        return true;
      }

      if (column.filterFn) {
        return column.filterFn(rowModel.row, filterValue);
      }

      const cellValue = getCellValue(rowModel.row, column);
      const filterType = column.filterType ?? 'text';

      if (filterType === 'number') {
        return applyNumberFilter(cellValue, filterValue);
      }

      if (filterType === 'select') {
        return String(cellValue ?? '') === String(filterValue ?? '');
      }

      return String(cellValue ?? '').toLowerCase().includes(normalizedFilter);
    }),
  );
};
