// 追加(F-2 / セル内検索): 表示文字列に対する部分一致検索の純粋ロジックです(React 非依存)。
//   - 走査対象は「ビュー行 × 可視列(合成列を除く)」の表示文字列(valueFormatter 適用後 = 画面に見えている文字)。
//   - 1 セル内の複数ヒットも個別のヒット(FindMatch)として数えます(順送りの単位 = ヒット)。
//   - buildFindIndex は描画側(renderCellContent)が O(1) で「このセルのヒット範囲」を引くための索引です。
import type { CellStyleContext, GridColumn } from '../model/gridTypes.unbound';
import { getCellValue } from '../utils/permissions';
import { resolveChipSpec } from './conditionalFormat';

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

// 追加(1.0.2 / G-16): チップの関数(`conditionalFormat.chips` の関数版)へ渡す、行の位置。セルの状態(アクティブ /
//   選択 / 編集中 / 読み取り専用)は検索では見ないので false で渡します。
export type FindChipPosition = Pick<CellStyleContext<unknown>, 'rowIndex' | 'sourceRowIndex' | 'rowKey' | 'colIndex'>;

// 既定セルの表示文字列(renderCellContent の既定分岐と同じ規則)。
// 変更(1.0.2 / 2026-11-09 実アプリの総点検 G-16): 状態チップ(`conditionalFormat.chips`)の `label` で文字を変えた
//   セルは、画面に出ている label を探します(これまでは label の前の値を探し、「FATAL!」と出ているのに「FATAL!」では
//   見つからなかった)。renderCell の列はチップを描かないので対象外。
export const resolveFindCellText = <T,>(column: GridColumn<T>, row: T, chipPosition?: FindChipPosition): string => {
  const value = getCellValue(row, column);
  const text = column.valueFormatter ? column.valueFormatter({ value, row, column }) : String(value ?? '');
  const chips = column.renderCell === undefined ? column.conditionalFormat?.chips : undefined;
  if (chips !== undefined && chipPosition !== undefined) {
    const label = resolveChipSpec<T>(chips, {
      ...chipPosition,
      row,
      value,
      column,
      isActive: false,
      isSelected: false,
      isEditing: false,
      readOnly: false,
    })?.label;
    if (label !== undefined) {
      return label;
    }
  }
  return text;
};

// 追加(1.0 前の最終チェック FC-26): 検索の対象にする列か。合成列のほか、文字を出さない列(チェックボックスのエディタ =
//   チェックの印だけ / データバーの showValue: false = 帯だけ)は外します(見えない "true" / 数値にヒットしていた)。
//   renderCell の列は renderCell が中身を描く(この 2 つより先に効く)ので、従来どおり対象にします。
//   変更(1.0.2 / レビュー QB-1): 条件付き書式を描かない構成(`/lite` で機能が無い)では、データバーの showValue: false の
//   列も値の文字を出すので対象にします(conditionalFormatShown = false)。
export const isFindableColumn = <T,>(column: GridColumn<T>, conditionalFormatShown = true): boolean =>
  column.renderCell !== undefined ||
  (column.editor?.type !== 'checkbox' &&
    (!conditionalFormatShown || column.conditionalFormat?.dataBar?.showValue !== false));

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
