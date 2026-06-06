import type { GridColumn } from '../model/gridTypes';
import { getCellValue } from '../utils/permissions';
import type { GridRowModelLike } from './filtering';

// 追加: 値比較を行います。数値化できるものは数値比較し、
//       それ以外は文字列比較へフォールバックします。
export const compareUnknownValues = (left: unknown, right: unknown) => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const bothNumeric =
    Number.isFinite(leftNumber) && Number.isFinite(rightNumber);

  if (bothNumeric) {
    return leftNumber - rightNumber;
  }

  return String(left ?? '').localeCompare(String(right ?? ''), 'ja', {
    numeric: true,
    sensitivity: 'base',
  });
};

// 追加: 単一列ソートを適用します。初版は 1列のみ扱います。
export const applySort = <T, R extends GridRowModelLike<T>>(
  rowModels: R[],
  columns: GridColumn<T>[],
  sort: { columnKey: string | null; direction: 'asc' | 'desc' | null },
) => {
  if (!sort.columnKey || !sort.direction) {
    return rowModels;
  }

  const column = columns.find((item) => item.key === sort.columnKey);
  if (!column) {
    return rowModels;
  }

  const multiplier = sort.direction === 'asc' ? 1 : -1;

  return [...rowModels].sort((leftRowModel, rightRowModel) => {
    const compared = compareUnknownValues(
      getCellValue(leftRowModel.row, column),
      getCellValue(rightRowModel.row, column),
    );

    if (compared !== 0) {
      return compared * multiplier;
    }

    // 追加: 安定ソートのため sourceIndex を tie-breaker にします。
    return leftRowModel.sourceIndex - rightRowModel.sourceIndex;
  });
};