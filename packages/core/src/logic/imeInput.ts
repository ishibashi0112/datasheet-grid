// 追加(G-2): IME オンのままの直接入力(imeDirectInput)の判定です(React 非依存の純関数)。
//   入力受けで IME の変換が始まったとき、アクティブセルへそのまま入力(変換確定後に編集を開始)してよいかを決めます。
//   対象は text エディタ(editor 未指定 / type 'text')の編集可能なデータセルだけです。number / select / date /
//   checkbox / custom の列、グループ行 / ラベル行 / 未ロード行、合成列(展開トグル・行ドラッグハンドル・自動グループ列)
//   では入力しません(変換は捨てる = 従来どおり何も入らない)。
import type { CellCoord, GridColumn, RowModel, SpreadsheetGridProps } from '../model/gridTypes.unbound';
import { isSyntheticColumnKey } from './detailRow';
import { isCellEditable } from '../utils/permissions';

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
  if (column.editor !== undefined && column.editor.type !== 'text') {
    return false;
  }
  const row = rowModel.getRow(cell.row);
  if (!row) {
    return false;
  }
  return isCellEditable({ readOnly, canEditCell }, cell.row, cell.col, row, column);
};