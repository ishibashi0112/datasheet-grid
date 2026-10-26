// 追加(editor 基盤): エディタ commit / ペースト / クリアで共有する
//   「文字列 → セル値」パース解決と、単一セル書き込みの rows 再構築の純粋ロジックです。
//   従来は各経路(useGridEditController / clipboard / clearCells / renderCell setValue)が
//   個別に parseClipboardValue 分岐と rows.map を持っていたため、ここへ集約します。
import type { GridColumn } from '../model/gridTypes.unbound';
import { setCellValue } from '../utils/permissions';
import { parseCheckboxEditorValue } from './checkboxEditor';

// 追加(全角数値): 数値として読む前に、全角の数字・符号・小数点・スペース(全角の英数字・記号 U+FF01〜U+FF5E と
//   U+3000 を半角へ)、IME のひらがな入力で「-」キーから入る長音「ー」やマイナス記号「−」、句読点の設定が「、。」の
//   IME で「.」「,」キーから入る「。」「、」、3 桁区切りのカンマ(「1,234」「１，２３４」)を半角の数値表記へ寄せます。
//   NFKC は使いません(「①」→ 1、「10⁵」→ 105 のように別の数に化けるため)。数値として読めるかは呼び出し側(Number)が
//   判定します(寄せた結果が数値でなければ元の文字列を使う)。3 桁区切りは先頭が 0 でないときだけ(「0,500」は欧州式の
//   小数かコードの可能性があるため数値にしない)。
const FULL_WIDTH_ASCII_PATTERN = /[\uFF01-\uFF5E]/g;
const NUMBER_DASH_PATTERN = /[ー−‐‑ｰ]/g;
const THOUSANDS_SEPARATED_PATTERN = /^[+-]?[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?$/;

export const normalizeNumberText = (raw: string): string => {
  const text = raw
    .replace(FULL_WIDTH_ASCII_PATTERN, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/。/g, '.')
    .replace(/、/g, ',')
    .trim()
    .replace(NUMBER_DASH_PATTERN, '-');
  return THOUSANDS_SEPARATED_PATTERN.test(text) ? text.replace(/,/g, '') : text;
};

// 追加(全角数値): 文字列を数値として読みます(normalizeNumberText を通す)。読めない / 空白だけ / 非有限は null。
export const parseNumberText = (raw: string): number | null => {
  const text = normalizeNumberText(raw);
  if (text === '') {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

// 追加(全角数値): number エディタ(<input type="number">)の初期値に渡す半角の文字列です。数値として読めなければ
//   null。type="number" が受け付けない書き方("1." / ".5" / "+5" / "0x1F" など。value に入れると空になる)は
//   読んだ数値を文字列に戻して渡します。
const HTML_FLOAT_PATTERN = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

export const toNumberInputText = (raw: string): string | null => {
  const parsed = parseNumberText(raw);
  if (parsed === null) {
    return null;
  }
  const text = normalizeNumberText(raw);
  return HTML_FLOAT_PATTERN.test(text) ? text : String(parsed);
};

// 追加(数値の打ち始め): 数値の書き始めだが、まだ数値ではない文字列("-" / "+" / "." / "-." / "+.")か。印字キーの
//   「-」「.」で number エディタを開いたときの初期値がこれです。type="number" の input は value に入れると空にする
//   (続けて「5」と打つと「5」になり、マイナスが落ちる)ため、number エディタはこのときだけ type="text" で開きます。
const NUMBER_PREFIX_PATTERN = /^[+-]?\.?$/;

export const isNumberInputPrefix = (text: string): boolean => text !== '' && NUMBER_PREFIX_PATTERN.test(text);

// 追加(editor: number): number エディタの既定パーサです。mark 思想(不正値も一旦受け入れて
//   表示側で警告)に合わせ、パース不可の文字列は破壊せずそのまま返します。
//   '' → null / 有限数値文字列 → number / それ以外 → 生文字列のまま。
// 変更(全角数値): 全角の数字・符号・小数点と 3 桁区切りも数値として読みます(normalizeNumberText)。空白だけの
//   文字列は null(従来は Number('  ') = 0 で 0 になっていた)。
const parseNumberEditorValue = (raw: string): unknown => {
  if (raw.trim() === '') {
    return null;
  }
  return parseNumberText(raw) ?? raw;
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
  if (column.editor?.type === 'checkbox') {
    const editor = column.editor;
    return (raw) => parseCheckboxEditorValue(raw, editor);
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