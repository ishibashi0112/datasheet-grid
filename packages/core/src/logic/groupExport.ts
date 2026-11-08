// 追加(段階 2 DU-10): 行グルーピング中のエクスポート(CSV / TSV / getExportData)の小計の行です。
//   includeGroupRows: true のとき、全展開した表示順のグループ行を「小計の行」として出します。グループ元の列は
//   祖先のグループの値、自分の段は「<ラベル> 小計」、それより下の段は空。集計のある列(aggFunc)はそのグループの
//   集計値(生値。合計行と同じ)、ほかの列は空です。
import type { GridColumn, GridGroupRow } from '../model/gridTypes.unbound';
import { groupIndexOfOrderValue, isGroupOrderValue } from './grouping';

// 小計の行の自分の段の文字(「関東 小計」)。
export const GROUP_SUBTOTAL_SUFFIX = ' 小計';

type GroupSubtotalLineParams<T> = {
  // 全展開した表示順(flattenGroupTree の displayOrder。負値がグループ行)。
  order: ArrayLike<number>;
  // displayOrder の負値の参照先(表示順 = DFS 順)。
  groups: readonly GridGroupRow[];
  // 出力する列(合成列を除いた後。グループ元の列を含む)。
  columns: readonly GridColumn<T>[];
  // グループ元の列の key(階層の順)。
  groupColumnKeys: readonly string[];
};

// 表示順の index → 小計の行の値(列順)。グループ行でなければ undefined。行は使うときに組み立てます。
export const createGroupSubtotalLineGetter = <T,>({
  order,
  groups,
  columns,
  groupColumnKeys,
}: GroupSubtotalLineParams<T>): ((index: number) => unknown[] | undefined) => {
  // 各グループの祖先の値(段の順)。groups は DFS 順なので、段ごとの直近の値を持てば祖先が分かります。
  const ancestorValues: unknown[][] = [];
  const path: unknown[] = [];
  for (const group of groups) {
    path.length = group.level;
    ancestorValues.push(path.slice());
    path.push(group.value);
  }
  const levelOfColumn = new Map(groupColumnKeys.map((key, level) => [key, level]));
  return (index) => {
    const value = order[index];
    if (value === undefined || !isGroupOrderValue(value)) {
      return undefined;
    }
    const groupIndex = groupIndexOfOrderValue(value);
    const group = groups[groupIndex];
    if (!group) {
      return undefined;
    }
    const ancestors = ancestorValues[groupIndex] ?? [];
    return columns.map((column) => {
      const level = levelOfColumn.get(column.key);
      if (level !== undefined) {
        if (level < group.level) {
          return ancestors[level];
        }
        return level === group.level ? `${group.label}${GROUP_SUBTOTAL_SUFFIX}` : undefined;
      }
      return Object.prototype.hasOwnProperty.call(group.aggregates, column.key) ? group.aggregates[column.key] : undefined;
    });
  };
};
