// 追加(G-1): セル操作の通知(onCellClick / onCellDoubleClick / onActiveCellChange)が渡すセル参照の解決です
//   (React 非依存の純関数)。
//   - 対象はデータ行 × 利用側の列のセルだけです。グループ行 / ラベル行 / SSRM の未ロード行 / 範囲外の行、
//     合成列(自動グループ列・展開トグル列・行ドラッグハンドル列)は null を返します。
//   - rowKey / sourceRowIndex の解決は GridBodyLayer の描画と同じ規則です(getRowKey / getSourceIndex が
//     undefined を返す範囲外は view index へ倒す)。row が有効と確定してから getRowKey を呼びます
//     (カスタム rowKeyGetter が row を読む実装で未ロード行を渡さないため。GridBodyLayer の論点A と同じ)。
import type { CellCoord, GridCellRef, GridColumn, RowModel } from '../model/gridTypes.unbound';
import { isSyntheticColumnKey } from './detailRow';
import { getCellValue } from '../utils/permissions';

export const resolveGridCellRef = <T,>(
  rowModel: RowModel<T>,
  columns: readonly GridColumn<T>[],
  cell: CellCoord,
): GridCellRef<T> | null => {
  const { row: rowIndex, col: colIndex } = cell;
  if (rowIndex < 0 || rowIndex >= rowModel.getRowCount()) {
    return null;
  }
  if (rowModel.getGroupRow?.(rowIndex) || rowModel.getLabelRow?.(rowIndex)) {
    return null;
  }
  const column = columns[colIndex];
  if (!column || isSyntheticColumnKey(column.key)) {
    return null;
  }
  const row = rowModel.getRow(rowIndex);
  if (!row) {
    return null;
  }
  return {
    row,
    rowKey: rowModel.getRowKey(rowIndex) ?? rowIndex,
    rowIndex,
    sourceRowIndex: rowModel.getSourceIndex(rowIndex) ?? rowIndex,
    column,
    columnKey: column.key,
    colIndex,
    value: getCellValue(row, column),
  };
};

// 「同じセル」の判定です(onActiveCellChange の同値抑止)。行キー / 列キーに加えて位置(view 行 / 論理列)も
//   比べます。座標が同じでもソート等でその位置の行が変われば行キーが変わるため「別のセル」になります。
//   行データ(row / value)の中身の変化だけでは別のセルとは見なしません。
export const isSameGridCellRef = <T,>(
  a: GridCellRef<T> | null,
  b: GridCellRef<T> | null,
): boolean => {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.rowKey === b.rowKey &&
    a.columnKey === b.columnKey &&
    a.rowIndex === b.rowIndex &&
    a.colIndex === b.colIndex
  );
};