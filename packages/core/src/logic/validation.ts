// 追加(validation): セル編集バリデーションの純粋ロジックです。
//   invalid 判定は「表示時導出」(state 非保持)を採用します — undo/redo(rows スナップショット
//   丸ごと復元)・外部 rows 差し替え・初期データの不正値と常に整合し、同期コードが不要なため。
//   コストは仮想化ウィンドウ内の validate 指定列のみ(cellClassName 関数と同じコスト階級)。
import type {
  CellValidationResult,
  GridColumn,
  GridInvalidCell,
  GridRowKey,
} from '../model/gridTypes.unbound';
import { getCellValue } from '../utils/permissions';
import { parseNumberText } from './editorValues';

// validate が false / 空メッセージを返した場合の既定メッセージです。
export const DEFAULT_INVALID_MESSAGE = '入力値が不正です';

// validate の返り値(boolean | string | { message })を正規化します。
//   string は常に「無効 + メッセージ」です(空文字は既定メッセージへ倒します)。
export const normalizeValidationResult = (
  result: CellValidationResult,
): { valid: boolean; message: string } => {
  if (result === true) {
    return { valid: true, message: '' };
  }
  if (result === false) {
    return { valid: false, message: DEFAULT_INVALID_MESSAGE };
  }
  if (typeof result === 'string') {
    return { valid: false, message: result || DEFAULT_INVALID_MESSAGE };
  }
  return { valid: false, message: result.message || DEFAULT_INVALID_MESSAGE };
};

// 追加(数値の検査): number エディタの min / max / integer による組み込みの検査です。どれかがあるときだけ
//   検査し(無ければ undefined)、validate の後に評価します。空(null / undefined / 空白だけの文字列)は通します
//   (必須かどうかは validate で決める)。数値として数えるのは数値と、列の既定パーサが数値として読む文字列です
//   (parseNumberText。初期データの '12' / '1,234' / '１２' も数値)。それ以外(数値として読めない文字列など)は NG です。
//   検査の順番は 数値か → 整数か → 範囲 で、最初に引っかかったものを返します。min / max の null は未指定と同じ扱い。
const getNumberRules = <T,>({ editor }: GridColumn<T>) =>
  editor?.type === 'number' && (editor.min != null || editor.max != null || editor.integer) ? editor : undefined;

const getNumberRuleMessage = <T,>(column: GridColumn<T>, value: unknown): string | null => {
  const rules = getNumberRules(column);
  if (!rules || value == null || (typeof value === 'string' && !value.trim())) {
    return null;
  }
  const { min, max } = rules;
  const numeric = typeof value === 'string' ? (parseNumberText(value) ?? NaN) : typeof value === 'number' ? value : NaN;
  const reason = !Number.isFinite(numeric)
    ? '数値'
    : rules.integer && !Number.isInteger(numeric)
      ? '整数'
      : (min != null && numeric < min) || (max != null && numeric > max)
        ? max == null
          ? `${min} 以上`
          : min == null
            ? `${max} 以下`
            : `${min}〜${max} `
        : '';
  return reason ? `${reason}で入力してください` : null;
};

// 追加(数値の検査): 検査のある列か(validate か、number エディタの min / max / integer)。mark 表示と
//   getInvalidCells の走査はこの列だけを評価します。
export const hasCellValidation = <T,>(column: GridColumn<T>): boolean => !!(column.validate || getNumberRules(column));

// 検証 OK / 検査なしは null、NG はメッセージを返します(mark 表示・スキャン共用)。
// 変更(数値の検査): validate が NG ならそのメッセージ、validate が通した(か無い)ときだけ組み込みの検査(数値か →
//   整数か → 範囲)を行います。validate を先にするのは、利用側のメッセージ(英語のアプリ等)を組み込みの日本語の
//   メッセージで上書きしないため(validate の受け取る値と動きは従来どおり)。
export const getInvalidMessage = <T,>(
  column: GridColumn<T>,
  row: T,
  value: unknown,
): string | null => {
  if (column.validate) {
    const normalized = normalizeValidationResult(column.validate({ value, row, column }));
    if (!normalized.valid) {
      return normalized.message;
    }
  }
  return getNumberRuleMessage(column, value);
};

// 書き込み可否の判定です。validationMode 既定 'mark' は常に write(警告は表示側で導出)、
//   'reject' は検証 NG 時に書き込み自体を拒否します。row は書き込み前の行です。
export const decideCellWrite = <T,>(
  column: GridColumn<T>,
  row: T,
  value: unknown,
): { action: 'write' } | { action: 'reject'; message: string } => {
  if ((column.validationMode ?? 'mark') !== 'reject') {
    return { action: 'write' };
  }
  const message = getInvalidMessage(column, row, value);
  return message === null
    ? { action: 'write' }
    : { action: 'reject', message };
};

// rows × 検査のある列の全走査です(handle.getInvalidCells 用のオンデマンド計算)。
//   列は宣言順(非表示列も対象 — 保存前チェックでは見えない列の不正値も検出したい)。
//   変更(数値の検査): validate 指定列に加え、number エディタの min / max / integer の列も対象です。
export const scanInvalidCells = <T,>(
  rows: T[],
  columns: GridColumn<T>[],
  getRowKey: (row: T, sourceRowIndex: number) => GridRowKey | undefined,
): GridInvalidCell[] => {
  const validateColumns = columns.filter(hasCellValidation);
  if (validateColumns.length === 0) {
    return [];
  }
  const invalidCells: GridInvalidCell[] = [];
  rows.forEach((row, sourceRowIndex) => {
    for (const column of validateColumns) {
      const message = getInvalidMessage(
        column,
        row,
        getCellValue(row, column),
      );
      if (message !== null) {
        invalidCells.push({
          rowKey: getRowKey(row, sourceRowIndex) ?? sourceRowIndex,
          sourceRowIndex,
          columnKey: column.key,
          message,
        });
      }
    }
  });
  return invalidCells;
};