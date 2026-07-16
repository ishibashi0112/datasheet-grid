import type { GridColumn } from '../model/gridTypes';
import type { ServerSideCellEditInput } from '../logic/serverSideEdits';
import {
  normalizeCellRange,
  normalizeColumnRange,
  normalizeRowRange,
} from '../model/gridSelectors';
import { getCellValue, setCellValue } from './permissions';
import { resolveCellParser } from '../logic/editorValues';
import { decideCellWrite } from '../logic/validation';

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
  // 変更(DS-3-10): rows: T[] → getRow/viewRowCount の seam-native 署名へ。
  //   呼び出し側のビュー行 materialize を不要にします(関数側は選択レンジ or
  //   0..viewRowCount-1 のみを getRow で引きます)。
  getRow: (viewIndex: number) => T,
  viewRowCount: number,
  columns: GridColumn<T>[],
  selection:
    | {
        type: 'cell';
        range: {
          start: { row: number; col: number };
          end: { row: number; col: number };
        };
      }
    | { type: 'row'; startRow: number; endRow: number }
    | { type: 'col'; startCol: number; endCol: number }
    | null,
): string => {
  if (!selection) {
    return '';
  }

  const lines: string[] = [];

  // 追加: セル範囲選択のコピーです。
  if (selection.type === 'cell') {
    const normalizedRange = normalizeCellRange(selection.range);
    for (
      let rowIndex = normalizedRange.start.row;
      rowIndex <= normalizedRange.end.row;
      rowIndex += 1
    ) {
      const row = getRow(rowIndex);
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
  }

  // 追加: 行選択のコピーです。選択された行 × visible columns 全体を対象にします。
  if (selection.type === 'row') {
    const normalizedRange = normalizeRowRange(selection.startRow, selection.endRow);
    for (
      let rowIndex = normalizedRange.startRow;
      rowIndex <= normalizedRange.endRow;
      rowIndex += 1
    ) {
      const row = getRow(rowIndex);
      if (!row) {
        continue;
      }
      const cells = columns.map((column) => {
        const rawValue = getCellValue(row, column);
        return column.formatClipboardValue
          ? column.formatClipboardValue(rawValue, row)
          : String(rawValue ?? '');
      });
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  }

  // 追加: 列選択のコピーです。visible rows × 選択列 を対象にします。
  const normalizedRange = normalizeColumnRange(selection.startCol, selection.endCol);
  for (let rowIndex = 0; rowIndex < viewRowCount; rowIndex += 1) {
    const row = getRow(rowIndex);
    if (!row) {
      continue;
    }
    const cells: string[] = [];
    for (
      let colIndex = normalizedRange.startCol;
      colIndex <= normalizedRange.endCol;
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
export const applyClipboardMatrixToRows = <T extends object,>(
  rows: T[],
  // 変更(DS-3-10): sourceRowIndexes: number[] → view→source 解決クロージャへ。
  //   N 個の配列 materialize を撤去します。範囲外 viewIndex に定義値が返っても、
  //   下の !currentRow ガードで skip され従来の undefined→continue と同結果です。
  resolveSourceIndex: (viewIndex: number) => number | undefined,
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
    const originalRowIndex = resolveSourceIndex(filteredRowIndex);
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
      // 変更(editor 基盤): パーサ解決を logic/editorValues.ts の共通規則へ集約しました。
      const parsedValue = resolveCellParser(column)(rawValue, currentRow);

      // 追加(validation): reject 列は検証 NG のセルのみスキップします(readonly セルの
      //   canWriteCell skip と同じ意味論 — reject 列の「不正値は決して入らない」契約を
      //   ペースト経由でも維持します)。mark 列(既定)はそのまま書き込みます。
      if (decideCellWrite(column, currentRow, parsedValue).action === 'reject') {
        continue;
      }

      nextRow = setCellValue(nextRow, column, parsedValue);
      rowChanged = true;
    }

    if (rowChanged) {
      nextRows[originalRowIndex] = nextRow;
    }
  }

  return nextRows;
};

// 追加(SSRM 書き戻し): serverSide 用に「ペーストすべきセル編集の集合」を作ります
//   (applyClipboardMatrixToRows のビュー走査版。rows 再構築の代わりに ServerSideCellEditInput を
//   返し、書き込みはフックの applyCellEdits が担います)。ガード(canWriteCell)・パーサ解決・
//   reject スキップの規則は clientSide 版と同一です。差分は 2 点:
//   - 未ロード行(getRow undefined = スケルトン)はスキップします。
//   - 行/列の自動拡張は行いません(SSRM の行追加は「サーバ反映後に refreshServerSide()」運用)。
export const buildClipboardCellEdits = <T extends object,>(
  getRow: (viewIndex: number) => T | undefined,
  columns: GridColumn<T>[],
  matrix: ClipboardMatrix,
  startRowIndex: number,
  startColIndex: number,
  // SSRM に source 空間は無いため、第 1 引数は view index です(getSourceIndex 恒等と同義)。
  canWriteCell: (
    viewIndex: number,
    colIndex: number,
    row: T,
    column: GridColumn<T>,
  ) => boolean,
): ServerSideCellEditInput<T>[] => {
  const edits: ServerSideCellEditInput<T>[] = [];
  for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
    const viewIndex = startRowIndex + rowOffset;
    const row = getRow(viewIndex);
    if (!row) {
      continue;
    }
    for (let colOffset = 0; colOffset < matrix[rowOffset].length; colOffset += 1) {
      const colIndex = startColIndex + colOffset;
      const column = columns[colIndex];
      if (!column) {
        continue;
      }
      if (!canWriteCell(viewIndex, colIndex, row, column)) {
        continue;
      }
      const parsedValue = resolveCellParser(column)(
        matrix[rowOffset][colOffset],
        row,
      );
      if (decideCellWrite(column, row, parsedValue).action === 'reject') {
        continue;
      }
      edits.push({ viewIndex, column, value: parsedValue });
    }
  }
  return edits;
};