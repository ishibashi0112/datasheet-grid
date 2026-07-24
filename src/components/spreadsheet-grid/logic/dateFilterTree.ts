import { toDateSetKey } from './filtering';

// 追加(filter-ext D): dateSet の年 / 月 / 日 3 階層ツリーの純ロジックです。
//   日付はユニーク値が行数に比例して増えるため、フラット列挙(SetFilterBody)では
//   1 万行 = 1 万チェックボックスになり実用になりません。Excel と同じくツリーにします。
//   view(DateSetFilterBody)は本モジュールの「平坦化された可視行」を仮想化リストへ
//   そのまま流し込みます(展開状態は view のローカル state)。

// 正規化済み候補です(value = 日付キー 'YYYY-MM-DD' / '' = 空白 / 非日付 = 生値)。
export type DateSetOption = {
  label: string;
  value: string;
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 生候補(セル生値のユニーク)を日付キーへ正規化・再集約します。
//   '2026/7/1' と '2026-07-01' は同一キーへまとまります。ソートは
//   日付キー昇順 → 非日付(文字列昇順)→ 空白('')の順です。
export const normalizeDateSetOptions = (
  rawOptions: ReadonlyArray<{ label: string; value: string }>,
): DateSetOption[] => {
  const keys = new Set<string>();
  for (const option of rawOptions) {
    keys.add(toDateSetKey(option.value));
  }
  const dateKeys: string[] = [];
  const otherKeys: string[] = [];
  let hasBlank = false;
  for (const key of keys) {
    if (key === '') {
      hasBlank = true;
    } else if (DATE_KEY_PATTERN.test(key)) {
      dateKeys.push(key);
    } else {
      otherKeys.push(key);
    }
  }
  dateKeys.sort();
  otherKeys.sort();
  const result: DateSetOption[] = dateKeys.map((key) => ({
    label: key,
    value: key,
  }));
  for (const key of otherKeys) {
    result.push({ label: key, value: key });
  }
  if (hasBlank) {
    result.push({ label: '(空白)', value: '' });
  }
  return result;
};

// ツリーの可視行です。group(年 / 月)は展開トグル + 3 状態チェック、leaf は
//   チェックボックス 1 個(day は日付キー、special は空白・非日付キー)です。
//   leafKeys は配下(自身含む)の全リーフキーで、3 状態集計と一括トグルに使います。
export type DateTreeRow = {
  type: 'group' | 'leaf';
  // group の展開状態管理キー('y:2026' / 'm:2026-07')。leaf は set 照合キーそのもの。
  key: string;
  label: string;
  depth: 0 | 1 | 2;
  leafKeys: string[];
  expanded: boolean;
};

// 正規化済み候補と展開状態から「可視行」を平坦化します(仮想化リストの入力)。
//   - 年(depth 0)→ 展開で月(depth 1)→ 展開で日(depth 2)。
//   - 空白・非日付の特殊リーフはルート直下(depth 0)の末尾に並びます。
export const buildDateTreeRows = (
  options: ReadonlyArray<DateSetOption>,
  expandedKeys: ReadonlySet<string>,
): DateTreeRow[] => {
  // 年 → 月 → 日 の階層 Map を構築します(options は normalizeDateSetOptions 済み = 昇順)。
  const years = new Map<string, Map<string, string[]>>();
  const specials: DateSetOption[] = [];
  for (const option of options) {
    if (!DATE_KEY_PATTERN.test(option.value)) {
      specials.push(option);
      continue;
    }
    const year = option.value.slice(0, 4);
    const month = option.value.slice(0, 7);
    let months = years.get(year);
    if (!months) {
      months = new Map<string, string[]>();
      years.set(year, months);
    }
    let days = months.get(month);
    if (!days) {
      days = [];
      months.set(month, days);
    }
    days.push(option.value);
  }

  const rows: DateTreeRow[] = [];
  for (const [year, months] of years) {
    const yearKey = `y:${year}`;
    const yearLeafKeys: string[] = [];
    for (const days of months.values()) {
      yearLeafKeys.push(...days);
    }
    const yearExpanded = expandedKeys.has(yearKey);
    rows.push({
      type: 'group',
      key: yearKey,
      label: `${year} 年`,
      depth: 0,
      leafKeys: yearLeafKeys,
      expanded: yearExpanded,
    });
    if (!yearExpanded) {
      continue;
    }
    for (const [month, days] of months) {
      const monthKey = `m:${month}`;
      const monthExpanded = expandedKeys.has(monthKey);
      rows.push({
        type: 'group',
        key: monthKey,
        label: `${Number(month.slice(5, 7))} 月`,
        depth: 1,
        leafKeys: [...days],
        expanded: monthExpanded,
      });
      if (!monthExpanded) {
        continue;
      }
      for (const day of days) {
        rows.push({
          type: 'leaf',
          key: day,
          label: `${Number(day.slice(8, 10))} 日`,
          depth: 2,
          leafKeys: [day],
          expanded: false,
        });
      }
    }
  }
  for (const special of specials) {
    rows.push({
      type: 'leaf',
      key: special.value,
      label: special.label,
      depth: 0,
      leafKeys: [special.value],
      expanded: false,
    });
  }
  return rows;
};