// 追加(validation): セル編集バリデーションの純粋ロジックです。
//   invalid 判定は「表示時導出」(state 非保持)を採用します — undo/redo(rows スナップショット
//   丸ごと復元)・外部 rows 差し替え・初期データの不正値と常に整合し、同期コードが不要なため。
//   コストは仮想化ウィンドウ内の validate 指定列のみ(cellClassName 関数と同じコスト階級)。
import type {
  CellValidationResult,
  GridColumn,
  GridInvalidCell,
  GridRowKey,
} from '../model/gridTypes';
import { getCellValue } from '../utils/permissions';

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

// 検証 OK / validate 未指定は null、NG はメッセージを返します(mark 表示・スキャン共用)。
export const getInvalidMessage = <T,>(
  column: GridColumn<T>,
  row: T,
  value: unknown,
): string | null => {
  if (!column.validate) {
    return null;
  }
  const normalized = normalizeValidationResult(
    column.validate({ value, row, column }),
  );
  return normalized.valid ? null : normalized.message;
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

// rows × validate 指定列の全走査です(handle.getInvalidCells 用のオンデマンド計算)。
//   列は宣言順(非表示列も対象 — 保存前チェックでは見えない列の不正値も検出したい)。
export const scanInvalidCells = <T,>(
  rows: T[],
  columns: GridColumn<T>[],
  getRowKey: (row: T, sourceRowIndex: number) => GridRowKey | undefined,
): GridInvalidCell[] => {
  const validateColumns = columns.filter((column) => column.validate);
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