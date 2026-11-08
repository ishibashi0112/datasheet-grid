// 追加(段階 2 DU-10): 行グルーピング中のエクスポート(CSV / TSV / getExportData)の小計の行です。
//   includeGroupRows: true のとき、全展開した表示順のグループ行を「小計の行」として出します。グループ元の列は
//   祖先のグループの値、自分の段は「<ラベル> 小計」、それより下の段は空。集計のある列(aggFunc)はそのグループの
//   集計値(生値。合計行と同じ)、ほかの列は空です。
//   修正(段階 2 の見直し): グループ元の列の文字はデータ行と同じ規則(列の formatClipboardValue があればそれ)で
//   整えます(これまでは生の値で、同じ列のデータ行と書き方が違っていた)。formatClipboardValue の row にはそのグループの
//   最初の行を渡します(グループ元の列の値はグループの中で同じ)。空白のグループは「(空白)」のままです。
import type { GridColumn, GridGroupRow } from '../model/gridTypes.unbound';
import type { GridLocaleText } from '../model/gridTypes.core';
import { groupIndexOfOrderValue, isGroupOrderValue } from './grouping';
import { DEFAULT_GRID_LOCALE_TEXT, formatLocaleText } from './localeText';

// 追加(英語対応): 小計の行の自分の段の文字(「関東 小計」= localeText の exportSubtotal)と空白のグループの名前(blank)。
export type GroupExportLocaleText = Pick<GridLocaleText, 'exportSubtotal' | 'blank'>;

type GroupSubtotalLineParams<T> = {
  // 全展開した表示順(flattenGroupTree の displayOrder。負値がグループ行)。
  order: ArrayLike<number>;
  // displayOrder の負値の参照先(表示順 = DFS 順)。
  groups: readonly GridGroupRow[];
  // 出力する列(合成列を除いた後。グループ元の列を含む)。
  columns: readonly GridColumn<T>[];
  // グループ元の列の key(階層の順)。
  groupColumnKeys: readonly string[];
  // order の値(source index)→ 行。グループ元の列を formatClipboardValue で整えるときの row に使います。
  getSourceRow?: (sourceIndex: number) => T | undefined;
  // 追加(英語対応): 小計の文言(未指定は日本語の既定)。
  texts?: GroupExportLocaleText;
};

// 小計の行の 1 行。values は生の値(getExportData の value)、texts は文字(CSV / getExportData の text)です。
export type GroupSubtotalLine = { values: unknown[]; texts: string[] };

const cellText = (value: unknown): string => (value == null ? '' : String(value));

// 表示順の index → 小計の行(列順)。グループ行でなければ undefined。行は使うときに組み立てます。
export const createGroupSubtotalLineGetter = <T,>({
  order,
  groups,
  columns,
  groupColumnKeys,
  getSourceRow,
  texts: localeTexts = DEFAULT_GRID_LOCALE_TEXT,
}: GroupSubtotalLineParams<T>): ((index: number) => GroupSubtotalLine | undefined) => {
  // 各グループの祖先(段の順)。groups は DFS 順なので、段ごとの直近のグループを持てば祖先が分かります。
  const ancestorGroups: GridGroupRow[][] = [];
  const path: GridGroupRow[] = [];
  for (const group of groups) {
    path.length = group.level;
    ancestorGroups.push(path.slice());
    path.push(group);
  }
  const levelOfColumn = new Map(groupColumnKeys.map((key, level) => [key, level]));
  // グループの最初の行(全展開した表示順で、グループ行の後の最初のデータ行)。
  const firstRowAfter = (index: number): T | undefined => {
    for (let position = index + 1; position < order.length; position += 1) {
      const value = order[position];
      if (value !== undefined && !isGroupOrderValue(value)) {
        return getSourceRow?.(value);
      }
    }
    return undefined;
  };
  // グループ元の列の値の文字(データ行と同じ規則。列に formatClipboardValue があればそれ、無ければ String(value ?? ''))。
  const valueText = (value: unknown, column: GridColumn<T>, row: T | undefined): string =>
    column.formatClipboardValue && row !== undefined ? column.formatClipboardValue(value, row) : cellText(value);
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
    const ancestors = ancestorGroups[groupIndex] ?? [];
    let row: T | undefined;
    let rowResolved = false;
    const representativeRow = (): T | undefined => {
      if (!rowResolved) {
        row = firstRowAfter(index);
        rowResolved = true;
      }
      return row;
    };
    const values: unknown[] = [];
    const texts: string[] = [];
    for (const column of columns) {
      const level = levelOfColumn.get(column.key);
      if (level !== undefined) {
        if (level < group.level) {
          const ancestorValue = ancestors[level]?.value;
          values.push(ancestorValue);
          texts.push(valueText(ancestorValue, column, representativeRow()));
        } else if (level === group.level) {
          // 空白のグループは「(空白) 小計」(画面のグループ行と同じ)。
          const label = group.value === null ? localeTexts.blank : valueText(group.value, column, representativeRow());
          const text = formatLocaleText(localeTexts.exportSubtotal, { label });
          values.push(text);
          texts.push(text);
        } else {
          values.push(undefined);
          texts.push('');
        }
        continue;
      }
      const aggregate = Object.prototype.hasOwnProperty.call(group.aggregates, column.key)
        ? group.aggregates[column.key]
        : undefined;
      values.push(aggregate);
      texts.push(cellText(aggregate));
    }
    return { values, texts };
  };
};