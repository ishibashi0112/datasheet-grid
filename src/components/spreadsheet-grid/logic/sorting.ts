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

// 追加(MS-2 / マルチソート本体): ソートエントリ配列の「次状態」を返す純関数です。
//   発火口を 1 か所に集約し、列メニュー(単一置換)とヘッダー Shift+click(トグル)で
//   同じロジックを共有します。入力配列は破壊せず、常に新しい配列を返します。
//
//   additive=false (列メニュー / 単一置換):
//     - 現在がちょうど [{columnKey, direction}] の「単一・同方向」なら [](解除)。
//     - それ以外は [{columnKey, direction}] へ置換します(他列のソートは捨てます)。
//     ⇒ MS-1 の handleColumnMenuSortChange の inline 判定と完全同値です。
//
//   additive=true (ヘッダー Shift+click / トグル):
//     - 当該列が未登録            → 末尾(最低優先)に {columnKey, direction} を追加。
//     - 登録済みで direction が別  → 位置を保ったまま direction を更新。
//     - 登録済みで direction が同じ → 当該列のエントリのみ除去。
//   呼び出し側(controller)が direction を
//     existingDir ? 'desc' : 'asc'
//   で決めることで、ユーザー体験としては none → asc → desc → none の
//   サイクルになります(desc のときは direction='desc' を渡し、上記「同方向 → 除去」で
//   消えます)。
export const nextSortEntries = (
  current: GridSortState,
  columnKey: string,
  direction: 'asc' | 'desc',
  additive: boolean,
): GridSortState => {
  if (!additive) {
    const isSameSingle =
      current.length === 1 &&
      current[0].columnKey === columnKey &&
      current[0].direction === direction;
    return isSameSingle ? [] : [{ columnKey, direction }];
  }

  const index = current.findIndex((entry) => entry.columnKey === columnKey);
  if (index === -1) {
    // 未登録 → 末尾(最低優先)に追加。
    return [...current, { columnKey, direction }];
  }
  if (current[index].direction !== direction) {
    // 別方向 → 位置を保ったまま方向だけ更新。
    return current.map((entry, i) =>
      i === index ? { columnKey, direction } : entry,
    );
  }
  // 同方向 → 当該列のみ除去(残りの優先順位は維持)。
  return current.filter((_, i) => i !== index);
};
