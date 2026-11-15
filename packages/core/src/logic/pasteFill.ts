// 追加(1.2.0 / 2026-11-09 実アプリの総点検 A-08): 範囲を選んで貼り付けたとき、コピーした文字の大きさが範囲を割り切れれば
//   範囲いっぱいに繰り返す(Excel / Google スプレッドシートと同じ)ための純ロジックです(React 非依存)。
//   - 対象はセルの範囲の選択だけです(列 / 行の選択は今までどおり 1 回だけ貼る)。アクティブセルが範囲の外にあるときも
//     今までどおり(起点がアクティブセルになるため)。
//   - 範囲の大きさは貼り付けと同じ数え方: 行はラベル行・グループ行を除いたデータ行、列は合成列を除いた列です(貼り付けは
//     どちらも飛ばすので、繰り返した文字がちょうど範囲のデータのセルに収まる)。
//   - 範囲の行数と列数が、コピーの行数と列数のそれぞれ倍数のときだけ繰り返します(1 セルのコピーはどの範囲にも)。
//     割り切れない・コピーが範囲以上・行ごとの列数がそろっていない(Excel のコピーではない文字)ときは null(今までどおり)。
//   - 繰り返した行は同じ配列を共有します(全体を選んだ大きな表でも、行ごとの配列を作り直さない)。
import type { CellCoord, GridColumn, GridSelection, RowModel } from '../model/gridTypes.unbound';
import { normalizeCellRange } from '../model/gridSelectors';
import { isSyntheticColumnKey } from './detailRow';
import { isPasteSkippedRow } from './labelRows';

export const expandPasteMatrixToSelection = <T,>(
  matrix: readonly (readonly string[])[],
  selection: GridSelection,
  activeCell: CellCoord,
  rowModel: RowModel<T>,
  columns: readonly GridColumn<T>[],
): string[][] | null => {
  if (selection?.type !== 'cell' || matrix.length === 0) {
    return null;
  }
  const width = matrix[0]?.length ?? 0;
  if (width === 0 || matrix.some((row) => row.length !== width)) {
    return null;
  }
  const range = normalizeCellRange(selection.range);
  const inside =
    activeCell.row >= range.start.row &&
    activeCell.row <= range.end.row &&
    activeCell.col >= range.start.col &&
    activeCell.col <= range.end.col;
  if (!inside) {
    return null;
  }
  let dataCols = 0;
  for (let colIndex = range.start.col; colIndex <= range.end.col; colIndex += 1) {
    const column = columns[colIndex];
    if (column !== undefined && !isSyntheticColumnKey(column.key)) {
      dataCols += 1;
    }
  }
  const height = matrix.length;
  if (dataCols === 0 || dataCols % width !== 0) {
    return null;
  }
  const viewRowCount = rowModel.getRowCount();
  const lastRow = Math.min(range.end.row, viewRowCount - 1);
  let dataRows = 0;
  for (let viewIndex = range.start.row; viewIndex <= lastRow; viewIndex += 1) {
    if (!isPasteSkippedRow(rowModel, viewIndex)) {
      dataRows += 1;
    }
  }
  if (dataRows === 0 || dataRows % height !== 0 || (dataRows === height && dataCols === width)) {
    return null;
  }
  const tiledRows = matrix.map((row) =>
    dataCols === width ? [...row] : Array.from({ length: dataCols }, (_, colIndex) => row[colIndex % width] ?? ''),
  );
  return Array.from({ length: dataRows }, (_, rowIndex) => tiledRows[rowIndex % height] ?? []);
};
