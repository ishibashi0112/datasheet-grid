import type { GridColumn, GridSortState } from '../model/gridTypes';
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

// 変更(MS-1 / マルチソート): エントリ配列を優先順位順に適用する多列ソートにしました。
//   - sort[0] が最優先。compared が 0 のときだけ次のエントリへフォールバックします。
//   - 未知/非表示などで列が見つからないエントリはスキップします
//     (列を隠してもクラッシュせず、残りのキーで安定して並びます)。
//   - 解決後に有効キーが 0 件なら元配列をそのまま返します。
//   - 最後の tie-breaker は従来どおり sourceIndex(安定ソート)。
// 単一列ソート(長さ 1)のときは旧実装と同一の結果になります。
export const applySort = <T, R extends GridRowModelLike<T>>(
  rowModels: R[],
  columns: GridColumn<T>[],
  sort: GridSortState,
) => {
  if (sort.length === 0) {
    return rowModels;
  }

  // 列解決はソート前に 1 回だけ(比較関数内で find を毎回呼ばない)。
  const resolved = sort
    .map((entry) => {
      const column = columns.find((item) => item.key === entry.columnKey);
      return column
        ? { column, multiplier: entry.direction === 'asc' ? 1 : -1 }
        : null;
    })
    .filter(
      (item): item is { column: GridColumn<T>; multiplier: number } =>
        item !== null,
    );

  if (resolved.length === 0) {
    return rowModels;
  }

  return [...rowModels].sort((leftRowModel, rightRowModel) => {
    for (const { column, multiplier } of resolved) {
      const compared = compareUnknownValues(
        getCellValue(leftRowModel.row, column),
        getCellValue(rightRowModel.row, column),
      );

      if (compared !== 0) {
        return compared * multiplier;
      }
    }

    // 追加: 安定ソートのため sourceIndex を tie-breaker にします。
    return leftRowModel.sourceIndex - rightRowModel.sourceIndex;
  });
};
