import type { GridColumn, SpreadsheetGridProps } from '../model/gridTypes';

// 追加: Grid 全体 / 列 / セル単位の条件をまとめて編集可否を判定します。
export const isCellEditable = <T,>(
  props: Pick<SpreadsheetGridProps<T>, 'readOnly' | 'canEditCell'>,
  rowIndex: number,
  colIndex: number,
  row: T,
  column: GridColumn<T>,
): boolean => {
  if (props.readOnly) {
    return false;
  }

  if (column.readOnly) {
    return false;
  }

  if (column.editable === false) {
    return false;
  }

  if (props.canEditCell) {
    return props.canEditCell(rowIndex, colIndex, row, column);
  }

  return true;
};

// 追加: 列定義からセル値を取り出します。getValue 未指定時は key ベースで取得します。
export const getCellValue = <T,>(row: T, column: GridColumn<T>): unknown => {
  if (column.getValue) {
    return column.getValue(row);
  }

  return (row as Record<string, unknown>)[column.key];
};

// 追加: 列定義を使ってセル値を書き換えます。setValue 未指定時は key ベース shallow copy を行います。
export const setCellValue = <T,>(
  row: T,
  column: GridColumn<T>,
  value: unknown,
): T => {
  if (column.setValue) {
    return column.setValue(row, value);
  }

  return {
    ...(row as Record<string, unknown>),
    [column.key]: value,
  } as T;
};