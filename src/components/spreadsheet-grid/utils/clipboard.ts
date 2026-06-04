import type { GridColumn } from '../model/gridTypes';
import { normalizeCellRange } from '../model/gridSelectors';
import { getCellValue, setCellValue } from './permissions';

// 追加: TSV の行列データ型です。
export type ClipboardMatrix = string[][];

// 追加: text/plain の TSV を 2次元配列へ変換します。
export const parseClipboardText = (text: string): ClipboardMatrix => {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (!normalized) {
    return [];
  }

  return normalized
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split('\t'));
};

// 追加: 選択範囲の rows/columns から TSV を生成します。
export const serializeSelectionToTsv = <T,>(
  rows: T[],
  columns: GridColumn<T>[],
  selection:
    | {
        type: 'cell';
        range: {
          start: { row: number; col: number };
          end: { row: number; col: number };
        };
      }
    | null,
): string => {
  if (!selection || selection.type !== 'cell') {
    return '';
  }

  const normalizedRange = normalizeCellRange(selection.range);
  const lines: string[] = [];

  for (
    let rowIndex = normalizedRange.start.row;
    rowIndex <= normalizedRange.end.row;
    rowIndex += 1
  ) {
    const row = rows[rowIndex];
    if (!row) {
      continue;
    }

    const cells: string[] = [];

    for (
      let colIndex = normalizedRange.start.col;
      colIndex <= normalizedRange.end.col;
      colIndex += 1
    ) {
      const column = columns[colIndex];
      if (!column) {
        continue;
      }

      const rawValue = getCellValue(row, column);
      const formattedValue = column.formatClipboardValue
        ? column.formatClipboardValue(rawValue, row)
        : String(rawValue ?? '');

      cells.push(formattedValue);
    }

    lines.push(cells.join('\t'));
  }

  return lines.join('\n');
};

// 追加: 貼り付け matrix を rows へ適用します。
export const applyClipboardMatrixToRows = <T,>(
  rows: T[],
  sourceRowIndexes: number[],
  columns: GridColumn<T>[],
  matrix: ClipboardMatrix,
  startRowIndex: number,
  startColIndex: number,
  canWriteCell: (
    originalRowIndex: number,
    colIndex: number,
    row: T,
    column: GridColumn<T>,
  ) => boolean,
): T[] => {
  if (matrix.length === 0) {
    return rows;
  }

  const nextRows = [...rows];

  for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
    const filteredRowIndex = startRowIndex + rowOffset;
    const originalRowIndex = sourceRowIndexes[filteredRowIndex];

    if (originalRowIndex === undefined) {
      continue;
    }

    const currentRow = nextRows[originalRowIndex];
    if (!currentRow) {
      continue;
    }

    let nextRow = currentRow;
    let rowChanged = false;

    for (let colOffset = 0; colOffset < matrix[rowOffset].length; colOffset += 1) {
      const colIndex = startColIndex + colOffset;
      const column = columns[colIndex];

      if (!column) {
        continue;
      }

      if (!canWriteCell(originalRowIndex, colIndex, currentRow, column)) {
        continue;
      }

      const rawValue = matrix[rowOffset][colOffset];
      const parsedValue = column.parseClipboardValue
        ? column.parseClipboardValue(rawValue, currentRow)
        : rawValue;

      nextRow = setCellValue(nextRow, column, parsedValue);
      rowChanged = true;
    }

    if (rowChanged) {
      nextRows[originalRowIndex] = nextRow;
    }
  }

  return nextRows;
};