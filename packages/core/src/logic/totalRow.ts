// 追加(合計行 3A): 合計行(totalRow)の純粋ロジックです(React 非依存)。
//   - 列ごとの集計は GridColumn.aggFunc(行グルーピングと共通の組み込み集計 / カスタム関数)で決め、対象は
//     フィルター / ソート後のデータ行(order。ラベル行は含まない。グルーピング中は折りたたまれた行も含む)です。
//   - totalRow.values で列ごとに値を渡すと、その列は計算せずその値を出します(serverSide は計算せず values だけ)。
//   - 集計は rows / order / 列 / values で渡した列の集合が変わったときだけ行い、内容が同じなら前回の Map を
//     返します(合計行の memo を壊さないため。values の中身だけが変わったときは集計し直さず差し替えだけ)。
//   - 表示文字列: 文字列はそのまま、count は件数、それ以外は valueFormatter(row は undefined。グループ行と
//     同じ)です。count と formatter の無い列の数値は下部バーの集計(選択範囲の合計・平均・個数)と同じ書式
//     (浮動小数の誤差を丸め、小数は 4 桁まで、桁区切りあり)です。
import type { GridAggFunc, GridColumn, TotalRowCellKind } from '../model/gridTypes.unbound';
import { getCellValue } from '../utils/permissions';
import {
  accumulateBuiltinAgg,
  createBuiltinAggAccumulator,
  finalizeBuiltinAgg,
  isBuiltinAggFuncName,
} from './aggregation';
import { DETAIL_TOGGLE_COLUMN_KEY, isSyntheticColumnKey } from './detailRow';
import type { RowOrder } from './filtering';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from './rowReorder';
import { formatSelectionAggregateNumber } from './selectionAggregates';

export const TOTAL_ROW_DEFAULT_LABEL = '合計';

// 合計行 1 セルぶんの値と種別です(値のない列は Map に入りません)。
export type TotalRowCell = { value: unknown; kind: TotalRowCellKind };
export type TotalRowCells = ReadonlyMap<string, TotalRowCell>;

export const EMPTY_TOTAL_ROW_CELLS: TotalRowCells = new Map();

export type TotalRowInputs<T> = {
  rows: readonly T[];
  // 集計対象のソース行 index の並び。null なら計算しません(serverSide。values の値だけを出す)。
  order: RowOrder | null;
  // 表示中の列(視覚順)。合成列(自動グループ列 / 展開トグル / 行ドラッグ)は対象外です。
  columns: readonly GridColumn<T>[];
  values: Readonly<Record<string, unknown>> | undefined;
};

// 合計・カスタム・values 以外の集計は、値の前に種類を小さく出します。
const TOTAL_ROW_CAPTIONS: Readonly<Partial<Record<TotalRowCellKind, string>>> = {
  avg: '平均',
  min: '最小',
  max: '最大',
  count: '個数',
};

export const resolveTotalRowCaption = (kind: TotalRowCellKind): string | undefined =>
  TOTAL_ROW_CAPTIONS[kind];

const hasOwn = (record: Readonly<Record<string, unknown>>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

// values で渡した列のうち、表示中の列に当たる key の並び(集計し直すかの判定に使う署名)。
const overrideSignature = <T>(
  columns: readonly GridColumn<T>[],
  values: Readonly<Record<string, unknown>> | undefined,
): string => {
  if (!values) {
    return '';
  }
  const keys: string[] = [];
  for (const column of columns) {
    if (hasOwn(values, column.key)) {
      keys.push(column.key);
    }
  }
  return keys.join('\u0000');
};

// aggFunc の列を order の順に 1 パスで集計します(values で渡した列は除く)。
export const collectTotalRowAggregates = <T>({
  rows,
  order,
  columns,
  values,
}: TotalRowInputs<T>): Map<string, TotalRowCell> => {
  const result = new Map<string, TotalRowCell>();
  if (order === null) {
    return result;
  }
  const builtinColumns: GridColumn<T>[] = [];
  const customColumns: GridColumn<T>[] = [];
  for (const column of columns) {
    if (isSyntheticColumnKey(column.key) || (values && hasOwn(values, column.key))) {
      continue;
    }
    if (typeof column.aggFunc === 'function') {
      customColumns.push(column);
    } else if (isBuiltinAggFuncName(column.aggFunc)) {
      builtinColumns.push(column);
    }
    // 不正な aggFunc 文字列はグループ行と同じく集計しません(空セル)。
  }
  const builtinCount = builtinColumns.length;
  const customCount = customColumns.length;
  if (builtinCount === 0 && customCount === 0) {
    return result;
  }
  const accumulators = builtinColumns.map(() => createBuiltinAggAccumulator());
  const customValues: unknown[][] = customColumns.map(() => []);
  const customRows: T[] = [];
  const orderLength = order.length;
  for (let pos = 0; pos < orderLength; pos += 1) {
    const row = rows[order[pos]];
    if (row === undefined) {
      continue;
    }
    for (let j = 0; j < builtinCount; j += 1) {
      accumulateBuiltinAgg(accumulators[j], getCellValue(row, builtinColumns[j]));
    }
    if (customCount > 0) {
      for (let j = 0; j < customCount; j += 1) {
        customValues[j].push(getCellValue(row, customColumns[j]));
      }
      customRows.push(row);
    }
  }
  builtinColumns.forEach((column, j) => {
    const name = column.aggFunc;
    if (isBuiltinAggFuncName(name)) {
      result.set(column.key, { value: finalizeBuiltinAgg(name, accumulators[j]), kind: name });
    }
  });
  customColumns.forEach((column, j) => {
    const value = (column.aggFunc as GridAggFunc<T>)({ values: customValues[j], rows: customRows, column });
    result.set(column.key, { value, kind: 'custom' });
  });
  return result;
};

const mergeTotalRowValues = <T>(
  aggregates: ReadonlyMap<string, TotalRowCell>,
  columns: readonly GridColumn<T>[],
  values: Readonly<Record<string, unknown>> | undefined,
): Map<string, TotalRowCell> => {
  const merged = new Map(aggregates);
  if (values) {
    for (const column of columns) {
      if (!isSyntheticColumnKey(column.key) && hasOwn(values, column.key)) {
        merged.set(column.key, { value: values[column.key], kind: 'value' });
      }
    }
  }
  return merged;
};

// 集計 + values の合成です(メモ化なし。テストと 1 回きりの計算用)。
export const collectTotalRowCells = <T>(inputs: TotalRowInputs<T>): TotalRowCells =>
  mergeTotalRowValues(collectTotalRowAggregates(inputs), inputs.columns, inputs.values);

export const totalRowCellsEqual = (a: TotalRowCells, b: TotalRowCells): boolean => {
  if (a === b) {
    return true;
  }
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, cell] of a) {
    const other = b.get(key);
    if (!other || other.kind !== cell.kind || !Object.is(other.value, cell.value)) {
      return false;
    }
  }
  return true;
};

export type TotalRowCellsResolver<T> = (inputs: TotalRowInputs<T>) => TotalRowCells;

// メモ化した解決です。rows / order / columns の参照と values の列の集合が同じなら集計し直さず、values の中身だけを
//   差し替えます。結果の内容が前回と同じなら前回の Map の参照を返します。
export const createTotalRowCellsResolver = <T>(): TotalRowCellsResolver<T> => {
  let lastRows: readonly T[] | null = null;
  let lastOrder: RowOrder | null | undefined;
  let lastColumns: readonly GridColumn<T>[] | null = null;
  let lastSignature = '';
  let lastAggregates: ReadonlyMap<string, TotalRowCell> = EMPTY_TOTAL_ROW_CELLS;
  let lastResult: TotalRowCells = EMPTY_TOTAL_ROW_CELLS;
  return (inputs) => {
    const signature = overrideSignature(inputs.columns, inputs.values);
    if (
      inputs.rows !== lastRows ||
      inputs.order !== lastOrder ||
      inputs.columns !== lastColumns ||
      signature !== lastSignature
    ) {
      lastAggregates = collectTotalRowAggregates(inputs);
      lastRows = inputs.rows;
      lastOrder = inputs.order;
      lastColumns = inputs.columns;
      lastSignature = signature;
    }
    const next = mergeTotalRowValues(lastAggregates, inputs.columns, inputs.values);
    if (!totalRowCellsEqual(next, lastResult)) {
      lastResult = next;
    }
    return lastResult;
  };
};

// 数値の表示です。下部バーの集計と同じ書式(浮動小数の誤差を丸め、小数は 4 桁まで、桁区切りあり)で、合計行と
//   下部バーで同じ数が同じ見え方になるようにします。非有限値(values で渡した Infinity など)はそのまま。
export const formatTotalRowNumber = (value: number): string =>
  Number.isFinite(value) ? formatSelectionAggregateNumber(value) : String(value);

// 合計行のセルの表示文字列です。
export const formatTotalRowCellText = <T>(column: GridColumn<T>, cell: TotalRowCell): string => {
  const { value, kind } = cell;
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (kind === 'count' && typeof value === 'number') {
    // 件数は列の valueFormatter(金額の書式など)を通しません。
    return formatTotalRowNumber(value);
  }
  if (column.valueFormatter) {
    // グループ行と同じく、合計行に元の行はないため row は undefined です。
    return column.valueFormatter({ value, row: undefined as unknown as T, column });
  }
  if (typeof value === 'number') {
    return formatTotalRowNumber(value);
  }
  return String(value);
};

// 見出し(label)を出す列です。行ドラッグ / 展開トグルの合成列を除いた先頭列で、その列に値があるときは null
//   (見出しは行番号の欄へ出す)。
export const resolveTotalRowLabelColumnKey = <T>(
  columns: readonly GridColumn<T>[],
  cells: TotalRowCells,
): string | null => {
  const first = columns.find(
    (column) => column.key !== ROW_DRAG_HANDLE_COLUMN_KEY && column.key !== DETAIL_TOGGLE_COLUMN_KEY,
  );
  if (!first || cells.has(first.key)) {
    return null;
  }
  return first.key;
};

// エクスポート(includeTotalRow)の 1 行です(エクスポート列順)。見出しは先頭列に値がないときだけ先頭列へ置きます。
export const buildTotalRowExportLine = <T>(
  columns: readonly GridColumn<T>[],
  cells: TotalRowCells,
  label: string,
): unknown[] => {
  const line: unknown[] = columns.map((column) => cells.get(column.key)?.value);
  if (columns.length > 0 && !cells.has(columns[0].key) && label !== '') {
    line[0] = label;
  }
  return line;
};