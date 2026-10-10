// 追加(F-2 / セル内検索): 表示文字列に対する部分一致検索の純粋ロジックです(React 非依存)。
//   - 走査対象は「ビュー行 × 可視列(合成列を除く)」の表示文字列(valueFormatter 適用後 = 画面に見えている文字)。
//   - 1 セル内の複数ヒットも個別のヒット(FindMatch)として数えます(順送りの単位 = ヒット)。
//   - buildFindIndex は描画側(renderCellContent)が O(1) で「このセルのヒット範囲」を引くための索引です。
import type { GridColumn } from '../model/gridTypes.unbound';
import { getCellValue } from '../utils/permissions';

export type FindMatch = {
  rowIndex: number;
  colIndex: number;
  columnKey: string;
  // 表示文字列内の位置(文字単位)。
  start: number;
  length: number;
};

export type FindRange = { start: number; length: number; matchIndex: number };

// rowIndex → colIndex → そのセル内のヒット範囲(表示順)。
export type FindIndex = ReadonlyMap<number, ReadonlyMap<number, readonly FindRange[]>>;

// 既定セルの表示文字列(renderCellContent の既定分岐と同じ規則)。
export const resolveFindCellText = <T,>(column: GridColumn<T>, row: T): string => {
  const value = getCellValue(row, column);
  return column.valueFormatter ? column.valueFormatter({ value, row, column }) : String(value ?? '');
};

// text 内の query の出現位置(重ならない範囲)を返します。query が空なら空配列。
export const findRangesInText = (
  text: string,
  query: string,
  caseSensitive: boolean,
): Array<{ start: number; length: number }> => {
  if (query.length === 0 || text.length === 0) {
    return [];
  }
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const ranges: Array<{ start: number; length: number }> = [];
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) {
      break;
    }
    ranges.push({ start: index, length: needle.length });
    from = index + needle.length;
  }
  return ranges;
};

export const buildFindIndex = (matches: readonly FindMatch[]): FindIndex => {
  const index = new Map<number, Map<number, FindRange[]>>();
  matches.forEach((match, matchIndex) => {
    let row = index.get(match.rowIndex);
    if (!row) {
      row = new Map();
      index.set(match.rowIndex, row);
    }
    let ranges = row.get(match.colIndex);
    if (!ranges) {
      ranges = [];
      row.set(match.colIndex, ranges);
    }
    ranges.push({ start: match.start, length: match.length, matchIndex });
  });
  return index;
};

// 表示文字列をヒット範囲で分割します(描画側が <mark> を差し込むため)。
export type FindTextSegment = { text: string; range: FindRange | null };
export const splitTextByFindRanges = (text: string, ranges: readonly FindRange[]): FindTextSegment[] => {
  const segments: FindTextSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), range: null });
    }
    segments.push({ text: text.slice(range.start, range.start + range.length), range });
    cursor = range.start + range.length;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), range: null });
  }
  return segments;
};

// 直前のカレントヒットと同じセル・位置が新しい結果にあればその index、なければ 0(結果が空なら null)。
export const resolveCurrentAfterRescan = (
  matches: readonly FindMatch[],
  previous: FindMatch | null,
): number | null => {
  if (matches.length === 0) {
    return null;
  }
  if (previous) {
    const found = matches.findIndex(
      (m) =>
        m.rowIndex === previous.rowIndex &&
        m.colIndex === previous.colIndex &&
        m.start === previous.start,
    );
    if (found >= 0) {
      return found;
    }
  }
  return 0;
};

export const stepFindIndex = (current: number | null, count: number, delta: 1 | -1): number | null => {
  if (count === 0) {
    return null;
  }
  if (current === null) {
    return delta > 0 ? 0 : count - 1;
  }
  return (current + delta + count) % count;
};
