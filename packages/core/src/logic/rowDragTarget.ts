// 追加(1.3.0 / Solid 版の品質の段 2-9): 行ドラッグで「どの行を掴んだか」「ゴーストに何を出すか」「どこへ落とせるか」を決める
//   純ロジックです。React 版の features/rowDrag.tsx と Solid 版の primitives/rowDrag.ts に同じ処理があったので、ここへ寄せました
//   (片方だけ直してずれないように)。フレームワークの側はメモ化(useMemo / createMemo)と接続だけを持ちます。
import { isSyntheticColumnKey } from './detailRow';
import { formatLocaleText } from './localeText';
import { resolveMoveTargetIndex } from './rowReorder';
import { getCellValue } from '../utils/permissions';
import type { GridRowKey, RowModel } from '../model/gridTypes.core';
import type { GridColumn, GridLocaleTextTemplate, SpreadsheetGridProps } from '../model/gridTypes.unbound';

// ゴーストのラベルに使う列: 先頭の(合成列でない)文字を出す表示列。
// 変更(1.0.2 / 2026-11-09 実アプリの総点検 E-06): 値を文字で出さない列(valueFormatter の無い renderCell の列 = 画像など /
//   チェックボックスのエディタ / showValue: false のデータバー)は飛ばします(先頭が画像の列だと、ゴーストに画像の URL が出て
//   どの行を掴んでいるか分からなかった)。
const isRowDragLabelColumn = <T,>(column: GridColumn<T>): boolean =>
  !isSyntheticColumnKey(column.key) &&
  (column.renderCell === undefined || column.valueFormatter !== undefined) &&
  column.editor?.type !== 'checkbox' &&
  column.conditionalFormat?.dataBar?.showValue !== false;

// ゴーストのラベル: 上の列の表示値。空なら fallback の文言(localeText の dragRowLabel。既定「行 {row}」)。
export const resolveRowDragLabel = <T,>(
  rowModel: RowModel<T>,
  visibleColumns: readonly GridColumn<T>[],
  viewIndex: number,
  fallbackTemplate: GridLocaleTextTemplate<{ row: number }>,
): string => {
  const fallback = formatLocaleText(fallbackTemplate, { row: viewIndex + 1 });
  const row = rowModel.getRow(viewIndex);
  if (!row) {
    return fallback;
  }
  const column = visibleColumns.find(isRowDragLabelColumn);
  if (!column) {
    return fallback;
  }
  const value = getCellValue(row, column);
  const text = column.valueFormatter ? column.valueFormatter({ value, row, column }) : String(value ?? '');
  return text.trim().length > 0 ? text : fallback;
};

// 追加(1.2.0 / 2026-11-09 実アプリの総点検 E-07): canDropRow を controller のスロット(行 i の上の境界が i)で聞ける形に
//   します。toIndex は onRowMove と同じ(動かした後の位置)、rowAbove / rowBelow は落とした後に掴んだ行のすぐ上 / 下の行。
//   canDropRow が無ければ undefined(どこへでも落とせる)。
export const createRowDropCheck = <T,>(
  canDropRow: SpreadsheetGridProps<T>['canDropRow'],
  rows: readonly T[],
  resolveRowKey: (row: T, index: number) => GridRowKey,
): ((fromIndex: number, slot: number) => boolean) | undefined =>
  canDropRow === undefined
    ? undefined
    : (fromIndex, slot) => {
        const toIndex = resolveMoveTargetIndex(fromIndex, slot);
        const row = rows[fromIndex];
        if (toIndex === null || row === undefined) return false;
        return canDropRow({
          row,
          rowKey: resolveRowKey(row, fromIndex),
          fromIndex,
          toIndex,
          rowAbove: slot > 0 ? rows[slot - 1] : undefined,
          rowBelow: slot < rows.length ? rows[slot] : undefined,
          rows,
        });
      };

// 追加(1.0 前の最終チェック FC-12): 掴んだ行を控え、離すときに今の並びで探し直します(ドラッグ中にポーリング等で行の並びが
//   変わると、掴んだときの index のまま別の行を動かしていた)。行の参照で探し、見つからなければ行のキーがあるときだけキーで
//   探します。どちらも無いときは、行数が同じなら掴んだときの index のまま(行を作り直すだけの再描画で取り消さないため)、
//   行数が変わっていれば取り消します(null)。
type DragRowToken = { row: unknown; rowKey: unknown; rowCount: number };

export const getDragRowToken = <T,>(rowModel: RowModel<T>, viewIndex: number): DragRowToken | null => {
  const row = rowModel.getRow(viewIndex);
  if (row === undefined) return null;
  return { row, rowKey: rowModel.getRowKey(viewIndex), rowCount: rowModel.getRowCount() };
};

export const locateDragRowToken = <T,>(
  rowModel: RowModel<T>,
  hasRowKeys: boolean,
  token: unknown,
  hint: number,
): number | null => {
  const { row, rowKey, rowCount } = token as DragRowToken;
  if (rowModel.getRow(hint) === row) return hint;
  const count = rowModel.getRowCount();
  for (let index = 0; index < count; index += 1) {
    if (rowModel.getRow(index) === row) return index;
  }
  if (hasRowKeys) {
    for (let index = 0; index < count; index += 1) {
      if (Object.is(rowModel.getRowKey(index), rowKey)) return index;
    }
    return null;
  }
  return count === rowCount && hint < rowCount ? hint : null;
};