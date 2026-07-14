// 追加(editor 基盤): エディタ commit / ペースト / クリアで共有する
//   「文字列 → セル値」パース解決と、単一セル書き込みの rows 再構築の純粋ロジックです。
//   従来は各経路(useGridEditController / clipboard / clearCells / renderCell setValue)が
//   個別に parseClipboardValue 分岐と rows.map を持っていたため、ここへ集約します。
import type { GridColumn } from '../model/gridTypes';
import { setCellValue } from '../utils/permissions';

// 追加(editor: number): number エディタの既定パーサです。mark 思想(不正値も一旦受け入れて
//   表示側で警告)に合わせ、パース不可の文字列は破壊せずそのまま返します。
//   '' → null / 有限数値文字列 → number / それ以外 → 生文字列のまま。
const parseNumberEditorValue = (raw: string): unknown => {
  if (raw === '') {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : raw;
};

// 追加(editor: date): Date を 'YYYY-MM-DD'(ローカル日付)へ整形します。
const formatDateParts = (date: Date): string => {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 追加(editor: date): セル生値を <input type="date"> の value('YYYY-MM-DD' | '')へ正規化します。
//   Date インスタンス / 'YYYY-MM-DD' 先頭の文字列(ISO 日時含む)/ Date.parse 可能な文字列を
//   受け付け、解釈できない値は ''(未入力扱い)を返します。
export const toDateInputValue = (value: unknown): string => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : formatDateParts(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const isoPrefix = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (isoPrefix) {
      return isoPrefix[1];
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateParts(parsed);
    }
  }
  return '';
};

// 追加(editor: date): date エディタの既定パーサです。'' → null / 解釈可能 → 'YYYY-MM-DD' へ
//   正規化(ペースト経由の '2026/07/14' 等も揃う)/ 解釈不可 → 生文字列のまま(mark が拾う)。
const parseDateEditorValue = (raw: string): unknown => {
  if (raw === '') {
    return null;
  }
  const normalized = toDateInputValue(raw);
  return normalized !== '' ? normalized : raw;
};

// 列のパーサを解決します。明示指定の parseClipboardValue が常に勝ち、未指定なら
//   editor 種別の既定パーサ(なければ identity = 生文字列のまま)を供給します。
export const resolveCellParser = <T,>(
  column: GridColumn<T>,
): ((raw: string, row: T) => unknown) => {
  if (column.parseClipboardValue) {
    return column.parseClipboardValue;
  }
  if (column.editor?.type === 'number') {
    return parseNumberEditorValue;
  }
  if (column.editor?.type === 'date') {
    return parseDateEditorValue;
  }
  return (raw) => raw;
};

// commit 値の共通規則です: string なら列パーサを通し(組み込みエディタのドラフトは
//   常に文字列)、string 以外はドメイン値としてそのまま返します(カスタムエディタが
//   ctx.commit(123) のように型付きの値を直接確定するための経路)。
export const parseCommittedValue = <T,>(
  column: GridColumn<T>,
  committedValue: unknown,
  row: T,
): unknown =>
  typeof committedValue === 'string'
    ? resolveCellParser(column)(committedValue, row)
    : committedValue;

// 単一セルの書き込みで rows を再構築します(該当 source 行のみ setCellValue で差し替え、
//   他行は参照を維持)。
export const writeRowsCell = <T,>(
  rows: T[],
  sourceRowIndex: number,
  column: GridColumn<T>,
  value: unknown,
): T[] =>
  rows.map((currentRow, index) =>
    index === sourceRowIndex
      ? setCellValue(currentRow, column, value)
      : currentRow,
  );