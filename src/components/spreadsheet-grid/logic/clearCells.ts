// 追加(clear): Delete / Backspace による選択セルの値クリアの純粋ロジックです。
//   対象は selection(cell / row / col)、無ければ activeCell の単一セル。書き込みは
//   paste(applyClipboardMatrixToRows)と同じ view→source 解決 + canWriteCell ガードで、
//   クリア値は「空文字のペースト」と同じ規則(parseClipboardValue('') 経由、未定義なら '')です。
//   変更が 1 セルも無ければ rows の参照をそのまま返します(呼び出し側は changed=false で
//   emit をスキップでき、undo 履歴に no-op を積みません)。
import type { CellCoord, GridColumn, GridSelection } from '../model/gridTypes';
import {
  normalizeCellRange,
  normalizeColumnRange,
  normalizeRowRange,
} from '../model/gridSelectors';
import { clamp } from './geometry';
import { getCellValue, setCellValue } from '../utils/permissions';
import { resolveCellParser } from './editorValues';
import { decideCellWrite } from './validation';

// クリア対象のビュー座標レンジです(両端 inclusive)。対象なしは null。
type ClearTarget = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

// selection / activeCell からクリア対象レンジを解決します。範囲は現在のビュー
//   (viewRowCount × columnCount)へクランプします(フィルター/ソートで selection が
//   縮小後のビューを超えているケースの防御)。
export const resolveClearTarget = (
  selection: GridSelection,
  activeCell: CellCoord | null,
  viewRowCount: number,
  columnCount: number,
): ClearTarget | null => {
  if (viewRowCount === 0 || columnCount === 0) {
    return null;
  }
  const maxRow = viewRowCount - 1;
  const maxCol = columnCount - 1;

  if (selection?.type === 'cell') {
    const range = normalizeCellRange(selection.range);
    return {
      startRow: clamp(range.start.row, 0, maxRow),
      endRow: clamp(range.end.row, 0, maxRow),
      startCol: clamp(range.start.col, 0, maxCol),
      endCol: clamp(range.end.col, 0, maxCol),
    };
  }
  if (selection?.type === 'row') {
    const range = normalizeRowRange(selection.startRow, selection.endRow);
    return {
      startRow: clamp(range.startRow, 0, maxRow),
      endRow: clamp(range.endRow, 0, maxRow),
      startCol: 0,
      endCol: maxCol,
    };
  }
  if (selection?.type === 'col') {
    const range = normalizeColumnRange(selection.startCol, selection.endCol);
    return {
      startRow: 0,
      endRow: maxRow,
      startCol: clamp(range.startCol, 0, maxCol),
      endCol: clamp(range.endCol, 0, maxCol),
    };
  }
  if (activeCell) {
    // クランプではなく範囲外は no-op に倒します(縮小後ビューの残留 activeCell で
    //   意図しないセルをクリアしないため)。
    if (activeCell.row > maxRow || activeCell.col > maxCol) {
      return null;
    }
    return {
      startRow: activeCell.row,
      endRow: activeCell.row,
      startCol: activeCell.col,
      endCol: activeCell.col,
    };
  }
  return null;
};

type ClearCellsArgs<T extends object> = {
  rows: T[];
  // view→source の解決です(paste と同じ contract: OOB は undefined → skip)。
  resolveSourceIndex: (viewIndex: number) => number | undefined;
  columns: GridColumn<T>[];
  selection: GridSelection;
  activeCell: CellCoord | null;
  viewRowCount: number;
  canWriteCell: (
    originalRowIndex: number,
    colIndex: number,
    row: T,
    column: GridColumn<T>,
  ) => boolean;
};

export const clearCellsInSelection = <T extends object>({
  rows,
  resolveSourceIndex,
  columns,
  selection,
  activeCell,
  viewRowCount,
  canWriteCell,
}: ClearCellsArgs<T>): { nextRows: T[]; changed: boolean } => {
  const target = resolveClearTarget(
    selection,
    activeCell,
    viewRowCount,
    columns.length,
  );
  if (!target) {
    return { nextRows: rows, changed: false };
  }

  const nextRows = [...rows];
  let changed = false;

  for (
    let viewIndex = target.startRow;
    viewIndex <= target.endRow;
    viewIndex += 1
  ) {
    const originalRowIndex = resolveSourceIndex(viewIndex);
    if (originalRowIndex === undefined) {
      continue;
    }
    const currentRow = nextRows[originalRowIndex];
    if (!currentRow) {
      continue;
    }

    let nextRow = currentRow;
    let rowChanged = false;

    for (
      let colIndex = target.startCol;
      colIndex <= target.endCol;
      colIndex += 1
    ) {
      const column = columns[colIndex];
      if (!column) {
        continue;
      }
      if (!canWriteCell(originalRowIndex, colIndex, currentRow, column)) {
        continue;
      }
      // 変更(editor 基盤): パーサ解決を logic/editorValues.ts の共通規則へ集約しました。
      const clearedValue = resolveCellParser(column)('', currentRow);
      // 既にクリア値と同値なら書き込まず、no-op エントリを避けます。
      if (Object.is(getCellValue(nextRow, column), clearedValue)) {
        continue;
      }
      // 追加(validation): reject 列はクリア値が検証 NG ならスキップします
      //   (「必須列は Delete で空にできない」を表現)。mark 列(既定)は従来どおりクリア。
      if (decideCellWrite(column, currentRow, clearedValue).action === 'reject') {
        continue;
      }
      nextRow = setCellValue(nextRow, column, clearedValue);
      rowChanged = true;
    }

    if (rowChanged) {
      nextRows[originalRowIndex] = nextRow;
      changed = true;
    }
  }

  return changed ? { nextRows, changed } : { nextRows: rows, changed: false };
};