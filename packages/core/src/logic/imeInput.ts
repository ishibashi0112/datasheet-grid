// 追加(G-2): IME オンのままの直接入力(imeDirectInput)の判定です(React 非依存の純関数)。
//   入力受けで IME の変換が始まったとき、アクティブセルへそのまま入力(変換確定後に編集を開始)してよいかを決めます。
//   対象は text エディタ(editor 未指定 / type 'text')と number エディタの編集可能なデータセルだけです。select /
//   date / checkbox / custom の列、グループ行 / ラベル行 / 未ロード行、合成列(展開トグル・行ドラッグハンドル・自動
//   グループ列)では入力しません(変換は捨てる = 従来どおり何も入らない)。
// 変更(全角数値): number エディタの列を対象に加えました(従来は変換を捨てていた)。確定した文字列は全角の数字・
//   符号・小数点・3 桁区切りを半角へ直し、数値として読めるときだけ編集を始めます(resolveImeEditText。かな / 漢字
//   など数値でない変換は捨てる)。
import type { CellCoord, GridColumn, RowModel, SpreadsheetGridProps } from '../model/gridTypes.unbound';
import { isSyntheticColumnKey } from './detailRow';
import { isNumberInputPrefix, normalizeNumberText, toNumberInputText } from './editorValues';
import { isViewCellEditable } from '../utils/permissions';

export type ImeEditTargetContext<T> = {
  rowModel: RowModel<T>;
  // 論理列 index 空間(視覚順)の列。
  columns: readonly GridColumn<T>[];
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
};

export const canStartImeEdit = <T,>(ctx: ImeEditTargetContext<T>, cell: CellCoord): boolean => {
  const { rowModel, columns, readOnly, canEditCell } = ctx;
  if (cell.row < 0 || cell.row >= rowModel.getRowCount()) {
    return false;
  }
  if (rowModel.getGroupRow?.(cell.row) || rowModel.getLabelRow?.(cell.row)) {
    return false;
  }
  const column = columns[cell.col];
  if (!column || isSyntheticColumnKey(column.key)) {
    return false;
  }
  if (column.editor !== undefined && column.editor.type !== 'text' && column.editor.type !== 'number') {
    return false;
  }
  const row = rowModel.getRow(cell.row);
  if (!row) {
    return false;
  }
  return isViewCellEditable({ readOnly, canEditCell }, rowModel, cell.row, cell.col, row, column);
};

// 追加(全角数値): 確定した文字列から編集の初期値を決めます(null = 変換を捨てる)。text エディタの列はそのまま、
//   number エディタの列は半角の数値表記へ直し(「１２．５」→ "12.5" / 「ー５」→ "-5" / 「１，２３４」→ "1234")、
//   数値として読めなければ null です。
// 変更(数値の打ち始め): 数値の書き始め(「ー」「－」「。」だけの確定)は半角の "-" / "." にして編集を始めます(キーの
//   「-」「.」で始めたときと同じ。続けて打った数字と合わせて数値になる)。
export const resolveImeEditText = <T,>(
  columns: readonly GridColumn<T>[],
  cell: CellCoord,
  text: string,
): string | null => {
  const column = columns[cell.col];
  if (column?.editor?.type === 'number') {
    const prefix = normalizeNumberText(text);
    return toNumberInputText(text) ?? (isNumberInputPrefix(prefix) ? prefix : null);
  }
  return text;
};