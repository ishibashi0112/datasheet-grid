// 追加(フィルハンドル 1A): フィルハンドルの「どこを埋めるか」と「何を書くか」を決める純ロジックです。
//   - 範囲はビュー座標(行 = ビュー行 index、列 = 視覚順の列 index。両端含む)。
//   - 埋める向きは Excel と同じく、元の範囲から縦 / 横のうちはみ出しの大きいほう(同じなら縦)です。
//     元の範囲の内側へ戻したときは埋めません(null)。合成列(行ドラッグ / 展開トグル / 自動グループ列)へは
//     はみ出させません。
//   - 値の決め方は logic/fillSeries(連続データ / コピー)。上下へ埋めるときは列ごと、左右へは行ごとに決めます。
//   - 書き込みの規則は貼り付けと同じです: 編集できないセル(readOnly / editable: false / canEditCell)と、
//     validationMode 'reject' の列で検証 NG の値は飛ばします。ラベル行 / グループ行は飛ばして数えず、
//     SSRM の未読み込み行は位置には数えるが書きません(元の値に未読み込み行があればその列 / 行は埋めません)。
//     行の追加はしません(表の端で止まります)。
import type {
  CellCoord,
  GridColumn,
  GridFillDirection,
  GridFillKind,
  GridFillValueParams,
  GridSelection,
  RowModel,
} from '../model/gridTypes.unbound';
import { isSyntheticColumnKey } from './detailRow';
import { computeSinglePaneColumnExtent, type ColumnPane, type GridPaneLayout } from './geometry';
import type { RowMetrics } from './verticalGeometry';
import {
  analyzeFillLine,
  createFillLineValues,
  resolveFillLineKind,
  type FillRequest,
} from './fillSeries';
import { decideCellWrite } from './validation';
import { getCellValue, setCellValue } from '../utils/permissions';

export type FillRange = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

export type FillTarget = {
  direction: GridFillDirection;
  // 埋めるセルだけの範囲(元の範囲は含まない)。
  range: FillRange;
};

export type FillCellEdit<T> = {
  viewIndex: number;
  column: GridColumn<T>;
  value: unknown;
};

// 埋める元の範囲: セル範囲選択(正規化)、選択が無ければアクティブセル 1 つ。行 / 列選択や表の外は null。
export const resolveFillSource = (
  selection: GridSelection,
  activeCell: CellCoord | null,
  rowCount: number,
  columnCount: number,
): FillRange | null => {
  let range: FillRange;
  if (selection?.type === 'cell') {
    const { start, end } = selection.range;
    range = {
      startRow: Math.min(start.row, end.row),
      endRow: Math.max(start.row, end.row),
      startCol: Math.min(start.col, end.col),
      endCol: Math.max(start.col, end.col),
    };
  } else if (selection === null && activeCell) {
    range = { startRow: activeCell.row, endRow: activeCell.row, startCol: activeCell.col, endCol: activeCell.col };
  } else {
    return null;
  }
  if (range.startRow < 0 || range.endRow >= rowCount || range.startCol < 0 || range.endCol >= columnCount) {
    return null;
  }
  return range;
};

// 元の範囲と埋める範囲を合わせた範囲(埋めたあとの選択)。
export const unionFillRange = (source: FillRange, target: FillTarget): FillRange => ({
  startRow: Math.min(source.startRow, target.range.startRow),
  endRow: Math.max(source.endRow, target.range.endRow),
  startCol: Math.min(source.startCol, target.range.startCol),
  endCol: Math.max(source.endCol, target.range.endCol),
});

export const isSameFillRange = (a: FillRange, b: FillRange): boolean =>
  a.startRow === b.startRow && a.endRow === b.endRow && a.startCol === b.startCol && a.endCol === b.endCol;

// データ列(合成列でない列)の端。データ列が無ければ null。
export const resolveFillColumnBounds = <T,>(
  columns: readonly GridColumn<T>[],
): { first: number; last: number } | null => {
  let first = -1;
  let last = -1;
  columns.forEach((column, index) => {
    if (!isSyntheticColumnKey(column.key)) {
      if (first === -1) {
        first = index;
      }
      last = index;
    }
  });
  return first === -1 ? null : { first, last };
};

// ポインタのあるセルから埋める範囲を決めます。rowCount / columnBounds で表の内側へ詰めます。
export const resolveFillTarget = (
  source: FillRange,
  pointer: CellCoord,
  rowCount: number,
  columnBounds: { first: number; last: number },
): FillTarget | null => {
  if (rowCount <= 0) {
    return null;
  }
  const row = Math.min(Math.max(pointer.row, 0), rowCount - 1);
  const col = Math.min(Math.max(pointer.col, columnBounds.first), columnBounds.last);
  const down = row - source.endRow;
  const up = source.startRow - row;
  const right = col - source.endCol;
  const left = source.startCol - col;
  const vertical = Math.max(down, up, 0);
  const horizontal = Math.max(right, left, 0);
  if (vertical === 0 && horizontal === 0) {
    return null;
  }
  if (vertical >= horizontal) {
    return down > 0
      ? {
          direction: 'down',
          range: { startRow: source.endRow + 1, endRow: row, startCol: source.startCol, endCol: source.endCol },
        }
      : {
          direction: 'up',
          range: { startRow: row, endRow: source.startRow - 1, startCol: source.startCol, endCol: source.endCol },
        };
  }
  return right > 0
    ? {
        direction: 'right',
        range: { startRow: source.startRow, endRow: source.endRow, startCol: source.endCol + 1, endCol: col },
      }
    : {
        direction: 'left',
        range: { startRow: source.startRow, endRow: source.endRow, startCol: col, endCol: source.startCol - 1 },
      };
};

// ラベル行 / グループ行(データでない表示行)か。
const isStructuralRow = <T,>(rowModel: RowModel<T>, viewIndex: number): boolean =>
  rowModel.getLabelRow?.(viewIndex) !== undefined || rowModel.getGroupRow?.(viewIndex) !== undefined;

const isFilledCell = (value: unknown): boolean => value !== null && value !== undefined && value !== '';

// ハンドルのダブルクリックで埋める範囲(下へ)。Excel と同じく、左隣(無ければ右隣)のデータ列に値が続くところまで
//   埋めます。埋める列に値が入っている行の手前で止め、既存の値は上書きしません。ラベル行 / グループ行 /
//   未読み込み行でも止めます。
export const resolveFillDoubleClickTarget = <T,>(
  source: FillRange,
  rowModel: RowModel<T>,
  columns: readonly GridColumn<T>[],
): FillTarget | null => {
  const rowCount = rowModel.getRowCount();
  const firstRow = source.endRow + 1;
  if (firstRow >= rowCount) {
    return null;
  }
  const dataRowAt = (viewIndex: number): T | undefined =>
    isStructuralRow(rowModel, viewIndex) ? undefined : (rowModel.getRow(viewIndex) as T | undefined);
  const findNeighbor = (from: number, step: -1 | 1): number => {
    for (let col = from; col >= 0 && col < columns.length; col += step) {
      if (!isSyntheticColumnKey(columns[col].key)) {
        return col;
      }
    }
    return -1;
  };
  const sourceColumns = columns
    .slice(source.startCol, source.endCol + 1)
    .filter((column) => !isSyntheticColumnKey(column.key));
  if (sourceColumns.length === 0) {
    return null;
  }
  for (const neighbor of [findNeighbor(source.startCol - 1, -1), findNeighbor(source.endCol + 1, 1)]) {
    if (neighbor === -1) {
      continue;
    }
    const neighborColumn = columns[neighbor];
    let endRow = source.endRow;
    for (let viewIndex = firstRow; viewIndex < rowCount; viewIndex += 1) {
      const row = dataRowAt(viewIndex);
      if (row === undefined || !isFilledCell(getCellValue(row, neighborColumn))) {
        break;
      }
      if (sourceColumns.some((column) => isFilledCell(getCellValue(row, column)))) {
        break;
      }
      endRow = viewIndex;
    }
    if (endRow > source.endRow) {
      return {
        direction: 'down',
        range: { startRow: firstRow, endRow, startCol: source.startCol, endCol: source.endCol },
      };
    }
    // 隣の列の直下が空なら反対側を見ます(Excel と同じ)。直下に値があって埋める列が埋まっていたときも同じ。
  }
  return null;
};

export type BuildFillEditsParams<T> = {
  rowModel: RowModel<T>;
  // 視覚順の列(合成列を含む。範囲の列 index はこの配列の index)。
  columns: readonly GridColumn<T>[];
  source: FillRange;
  target: FillTarget;
  request: FillRequest;
  // 編集できるセルか(readOnly / editable / canEditCell。ビュー行 index で呼ぶ)。
  canWriteCell: (viewIndex: number, colIndex: number, row: T, column: GridColumn<T>) => boolean;
  getFillValue?: (params: GridFillValueParams<T>) => unknown;
};

export type FillEditsResult<T> = {
  edits: FillCellEdit<T>[];
  // 実際の埋め方(どれか 1 列 / 行でも連続データなら 'series')。
  kind: GridFillKind;
  // 連続データにできる列 / 行があるか(埋めたあとのボタンで「連続データ」を選べるか)。
  seriesAvailable: boolean;
};

// 埋める位置(元の範囲の直後から、埋める向きの順)。縦はラベル行 / グループ行を、横は合成列を除きます。
const fillPositions = (from: number, to: number, step: 1 | -1, include: (index: number) => boolean): number[] => {
  const positions: number[] = [];
  for (let index = from; step === 1 ? index <= to : index >= to; index += step) {
    if (include(index)) {
      positions.push(index);
    }
  }
  return positions;
};

// 埋めるセルの書き込み(edits)を作ります。clientSide は applyFillEditsToRows で rows へ、serverSide は
//   applyServerSideCellEdits へそのまま渡します。
export const buildFillEdits = <T,>({
  rowModel,
  columns,
  source,
  target,
  request,
  canWriteCell,
  getFillValue,
}: BuildFillEditsParams<T>): FillEditsResult<T> => {
  const edits: FillCellEdit<T>[] = [];
  let kind: GridFillKind = 'copy';
  let seriesAvailable = false;
  const { direction, range } = target;
  const vertical = direction === 'down' || direction === 'up';
  const forward = direction === 'down' || direction === 'right';

  // 1 列 / 1 行ぶん: 元の値を集めて値を決め、埋める位置へ書きます。
  const fillLine = (
    sourceValues: unknown[],
    positions: number[],
    cellAt: (position: number) => { viewIndex: number; colIndex: number; row: T | undefined; column: GridColumn<T> },
  ) => {
    if (sourceValues.length === 0 || positions.length === 0) {
      return;
    }
    const analysis = analyzeFillLine(sourceValues, { backward: !forward });
    const lineKind = resolveFillLineKind(analysis, request);
    if (analysis.series !== null) {
      seriesAvailable = true;
    }
    if (lineKind === 'series') {
      kind = 'series';
    }
    const valueAt = createFillLineValues(sourceValues, analysis, lineKind);
    positions.forEach((position, index) => {
      const { viewIndex, colIndex, row, column } = cellAt(position);
      if (row === undefined || !canWriteCell(viewIndex, colIndex, row, column)) {
        return;
      }
      const defaultValue = valueAt(index);
      const value = getFillValue
        ? getFillValue({
            column,
            row,
            rowIndex: viewIndex,
            sourceValues,
            index,
            direction,
            kind: lineKind,
            defaultValue,
          })
        : defaultValue;
      if (decideCellWrite(column, row, value).action === 'reject') {
        return;
      }
      edits.push({ viewIndex, column, value });
    });
  };

  if (vertical) {
    // 元の行(埋める向きの順)と埋める行。ラベル行 / グループ行は飛ばします。
    const isDataPosition = (viewIndex: number) => !isStructuralRow(rowModel, viewIndex);
    const sourceRows = forward
      ? fillPositions(source.startRow, source.endRow, 1, isDataPosition)
      : fillPositions(source.endRow, source.startRow, -1, isDataPosition);
    const targetRows = forward
      ? fillPositions(range.startRow, range.endRow, 1, isDataPosition)
      : fillPositions(range.endRow, range.startRow, -1, isDataPosition);
    for (let colIndex = source.startCol; colIndex <= source.endCol; colIndex += 1) {
      const column = columns[colIndex];
      if (!column || isSyntheticColumnKey(column.key)) {
        continue;
      }
      const sourceValues: unknown[] = [];
      let complete = true;
      for (const viewIndex of sourceRows) {
        const row = rowModel.getRow(viewIndex) as T | undefined;
        if (row === undefined) {
          complete = false;
          break;
        }
        sourceValues.push(getCellValue(row, column));
      }
      if (!complete) {
        continue;
      }
      fillLine(sourceValues, targetRows, (viewIndex) => ({
        viewIndex,
        colIndex,
        row: rowModel.getRow(viewIndex) as T | undefined,
        column,
      }));
    }
  } else {
    const isDataColumn = (colIndex: number) => {
      const column = columns[colIndex];
      return column !== undefined && !isSyntheticColumnKey(column.key);
    };
    const sourceCols = forward
      ? fillPositions(source.startCol, source.endCol, 1, isDataColumn)
      : fillPositions(source.endCol, source.startCol, -1, isDataColumn);
    const targetCols = forward
      ? fillPositions(range.startCol, range.endCol, 1, isDataColumn)
      : fillPositions(range.endCol, range.startCol, -1, isDataColumn);
    for (let viewIndex = source.startRow; viewIndex <= source.endRow; viewIndex += 1) {
      if (isStructuralRow(rowModel, viewIndex)) {
        continue;
      }
      const row = rowModel.getRow(viewIndex) as T | undefined;
      if (row === undefined) {
        continue;
      }
      fillLine(
        sourceCols.map((colIndex) => getCellValue(row, columns[colIndex])),
        targetCols,
        (colIndex) => ({ viewIndex, colIndex, row, column: columns[colIndex] }),
      );
    }
  }

  return { edits, kind, seriesAvailable };
};

export type FillPreview<T> = {
  column: GridColumn<T>;
  row: T | undefined;
  value: unknown;
};

// ドラッグ中に出す「いちばん遠いセルへ入る値」(上下へは元の範囲の先頭のデータ列、左右へは先頭のデータ行)。
//   reject は見ません(見た目の目安)。書けるセルが無い / 元の値が読めないときは null。
//   getFillValue は、いちばん遠いセルが編集できるとき(canWriteCell)だけ呼びます(確定時と同じく、編集できない
//   セルでは呼ばない。編集できなければ既定の値を出します)。
export const previewFillValue = <T,>({
  rowModel,
  columns,
  source,
  target,
  request,
  canWriteCell,
  getFillValue,
}: Omit<BuildFillEditsParams<T>, 'canWriteCell'> & {
  canWriteCell?: BuildFillEditsParams<T>['canWriteCell'];
}): FillPreview<T> | null => {
  const { direction, range } = target;
  const vertical = direction === 'down' || direction === 'up';
  const forward = direction === 'down' || direction === 'right';
  let sourceValues: unknown[];
  let column: GridColumn<T>;
  let colIndex: number;
  let viewIndex: number;
  let row: T | undefined;
  let targetRowMissing = false;
  let lastIndex: number;
  if (vertical) {
    const firstCol = fillPositions(source.startCol, source.endCol, 1, (index) => {
      const candidate = columns[index];
      return candidate !== undefined && !isSyntheticColumnKey(candidate.key);
    })[0];
    if (firstCol === undefined) {
      return null;
    }
    colIndex = firstCol;
    column = columns[colIndex];
    const isDataPosition = (index: number) => !isStructuralRow(rowModel, index);
    const sourceRows = forward
      ? fillPositions(source.startRow, source.endRow, 1, isDataPosition)
      : fillPositions(source.endRow, source.startRow, -1, isDataPosition);
    const targetRows = forward
      ? fillPositions(range.startRow, range.endRow, 1, isDataPosition)
      : fillPositions(range.endRow, range.startRow, -1, isDataPosition);
    if (sourceRows.length === 0 || targetRows.length === 0) {
      return null;
    }
    sourceValues = [];
    let lastSourceRow: T | undefined;
    for (const index of sourceRows) {
      lastSourceRow = rowModel.getRow(index) as T | undefined;
      if (lastSourceRow === undefined) {
        return null;
      }
      sourceValues.push(getCellValue(lastSourceRow, column));
    }
    lastIndex = targetRows.length - 1;
    viewIndex = targetRows[lastIndex];
    row = rowModel.getRow(viewIndex) as T | undefined;
    targetRowMissing = row === undefined;
    // 未読み込みの行は表示の整形に元の行を使います(valueFormatter が row を読む列でも投げないように)。
    row = row ?? lastSourceRow;
  } else {
    const firstRow = fillPositions(source.startRow, source.endRow, 1, (index) => !isStructuralRow(rowModel, index))[0];
    if (firstRow === undefined) {
      return null;
    }
    const sourceRow = rowModel.getRow(firstRow) as T | undefined;
    if (sourceRow === undefined) {
      return null;
    }
    const isDataColumn = (index: number) => {
      const candidate = columns[index];
      return candidate !== undefined && !isSyntheticColumnKey(candidate.key);
    };
    const sourceCols = forward
      ? fillPositions(source.startCol, source.endCol, 1, isDataColumn)
      : fillPositions(source.endCol, source.startCol, -1, isDataColumn);
    const targetCols = forward
      ? fillPositions(range.startCol, range.endCol, 1, isDataColumn)
      : fillPositions(range.endCol, range.startCol, -1, isDataColumn);
    if (sourceCols.length === 0 || targetCols.length === 0) {
      return null;
    }
    sourceValues = sourceCols.map((colIndex) => getCellValue(sourceRow, columns[colIndex]));
    lastIndex = targetCols.length - 1;
    colIndex = targetCols[lastIndex];
    column = columns[colIndex];
    viewIndex = firstRow;
    row = sourceRow;
  }
  const analysis = analyzeFillLine(sourceValues, { backward: !forward });
  const kind = resolveFillLineKind(analysis, request);
  const defaultValue = createFillLineValues(sourceValues, analysis, kind)(lastIndex);
  const value =
    getFillValue &&
    row !== undefined &&
    !targetRowMissing &&
    (canWriteCell === undefined || canWriteCell(viewIndex, colIndex, row, column))
      ? getFillValue({
          column,
          row,
          rowIndex: viewIndex,
          sourceValues,
          index: lastIndex,
          direction,
          kind,
          defaultValue,
        })
      : defaultValue;
  return { column, row, value };
};

// clientSide: edits を rows へ書き込んだ新しい配列を返します(書き込みが無ければ元の配列)。
export const applyFillEditsToRows = <T,>(
  rows: readonly T[],
  rowModel: Pick<RowModel<T>, 'getSourceIndex'>,
  edits: readonly FillCellEdit<T>[],
): T[] => {
  if (edits.length === 0) {
    return rows as T[];
  }
  const nextRows = [...rows];
  for (const { viewIndex, column, value } of edits) {
    const sourceIndex = rowModel.getSourceIndex(viewIndex);
    if (sourceIndex === undefined) {
      continue;
    }
    const current = nextRows[sourceIndex];
    if (current === undefined) {
      continue;
    }
    nextRows[sourceIndex] = setCellValue(current, column, value);
  }
  return nextRows;
};

// ── 描画位置(シェルの overlay 層 = ペインローカル座標。left は leadingWidth 抜き、top は headerHeight 抜き) ──

export type FillCornerPlacement = {
  pane: ColumnPane;
  // 範囲の右下の角。
  x: number;
  y: number;
  // 角のあるペインの列領域の幅(ボタンをはみ出させないため)。
  paneWidth: number;
};

// 範囲の右下の角(ハンドル / ボタンの基準)。角の行が描画窓の外、または列が見つからなければ null。
export const resolveFillCornerPlacement = <T,>(
  range: FillRange,
  paneLayout: GridPaneLayout<T>,
  rowMetrics: Pick<RowMetrics, 'rowTop' | 'cellHeight'>,
  windowFirstRow: number,
  windowLastRow: number,
): FillCornerPlacement | null => {
  if (range.endRow < windowFirstRow || range.endRow > windowLastRow) {
    return null;
  }
  const single = computeSinglePaneColumnExtent(paneLayout, range.endCol);
  if (!single) {
    return null;
  }
  return {
    pane: single.pane,
    x: single.extent.end,
    y: rowMetrics.rowTop(range.endRow) + rowMetrics.cellHeight(range.endRow),
    paneWidth: paneLayout[single.pane].totalWidth,
  };
};

// 埋めたあとのボタンの大きさ(styles.css の .ssg-fill-options と揃える)と、角からの間隔。
export const FILL_OPTIONS_CHIP_WIDTH = 36;
export const FILL_OPTIONS_CHIP_HEIGHT = 22;
const FILL_OPTIONS_CHIP_GAP = 4;

// ボタンの左上。角の右下へ出し、ペインの右端 / ボディの下端をはみ出すときは角の内側へ寄せます。
export const resolveFillOptionsChipPosition = (
  corner: FillCornerPlacement,
  totalBodyHeight: number,
): { x: number; y: number } => {
  const x =
    corner.x + FILL_OPTIONS_CHIP_GAP + FILL_OPTIONS_CHIP_WIDTH <= corner.paneWidth
      ? corner.x + FILL_OPTIONS_CHIP_GAP
      : Math.max(corner.x - FILL_OPTIONS_CHIP_WIDTH - FILL_OPTIONS_CHIP_GAP, 0);
  const y =
    corner.y + FILL_OPTIONS_CHIP_GAP + FILL_OPTIONS_CHIP_HEIGHT <= totalBodyHeight
      ? corner.y + FILL_OPTIONS_CHIP_GAP
      : Math.max(corner.y - FILL_OPTIONS_CHIP_HEIGHT - FILL_OPTIONS_CHIP_GAP, 0);
  return { x, y };
};