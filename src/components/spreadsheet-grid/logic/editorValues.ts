// 追加(editor 基盤): エディタ commit / ペースト / クリアで共有する
//   「文字列 → セル値」パース解決と、単一セル書き込みの rows 再構築の純粋ロジックです。
//   従来は各経路(useGridEditController / clipboard / clearCells / renderCell setValue)が
//   個別に parseClipboardValue 分岐と rows.map を持っていたため、ここへ集約します。
import type { GridColumn } from '../model/gridTypes';
import { setCellValue } from '../utils/permissions';

// 列のパーサを解決します。明示指定の parseClipboardValue が常に勝ち、未指定なら
//   identity(生文字列のまま)です。将来のエディタ種別(number / date / checkbox)は
//   ここで種別ごとの既定パーサを自動供給します。
export const resolveCellParser = <T,>(
  column: GridColumn<T>,
): ((raw: string, row: T) => unknown) => {
  if (column.parseClipboardValue) {
    return column.parseClipboardValue;
  }
  return (raw) => raw;
};

// commit 値の共通規則です: string なら列パーサを通し(組み込みエディタのドラフトは
//   常に文字列)、string 以外はドメイン値としてそのまま返します(カスタムエディタが
//   ctx.commit(123) のように型付きの値を直接確定するための経路)。
export const parseCommittedValue = <T,>(
  column: GridColumn<T>,
  committedValue: unknown,
  row: T,
): unknown =>
  typeof committedValue === 'string'
    ? resolveCellParser(column)(committedValue, row)
    : committedValue;

// 単一セルの書き込みで rows を再構築します(該当 source 行のみ setCellValue で差し替え、
//   他行は参照を維持)。
export const writeRowsCell = <T,>(
  rows: T[],
  sourceRowIndex: number,
  column: GridColumn<T>,
  value: unknown,
): T[] =>
  rows.map((currentRow, index) =>
    index === sourceRowIndex
      ? setCellValue(currentRow, column, value)
      : currentRow,
  );