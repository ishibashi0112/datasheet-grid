// セル / 行番号の右クリックメニュー(enableContextMenu + getContextMenuItems)の機能です。中身は core の
//   controllers/contextMenuController の接続(primitives/contextMenu)と、ポップアップの部品(view/CellContextMenuPopover)、
//   右クリックの対象(セル / 行番号)の解決です。右クリックの委譲のハンドラはシェルに置き、対象の解決をここへ任せます(React 版と
//   同じ)。機能セットに無い構成では enableContextMenu を false として扱い(createSpreadsheetGrid)、ブラウザの標準のメニューのまま。
//   - 対象の解決(buildBodyContextMenuParams / buildCellContextMenuParams)は React 版の features/contextMenu.tsx と同じ処理です
//     (React 版のファイルの中の関数なので写した。core へ寄せるかは段階 3 で決める)。
import {
  isContextMenuCellSelected,
  isContextMenuRowSelected,
  resolveContextMenuColIndex,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/contextMenuTarget';
import { DEFAULT_CONTEXT_MENU_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { getCellValue } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
import type { CellCoord, GridSelection, RowModel } from '@ishibashi0112/spreadsheet-grid-core';
import type { GridColumn, GridContextMenuParams, GridContextMenuTarget } from '../model/gridTypes';
import { createCellContextMenu } from '../primitives/contextMenu';
import { CellContextMenuPopover } from '../view/CellContextMenuPopover';
import type { GridFeature, GridFeatureParts } from './types';

export type CellContextMenuInput<T> = {
  cell: CellCoord;
  clientX: number;
  clientY: number;
  rowModel: RowModel<T>;
  orderedColumns: GridColumn<T>[];
  selection: GridSelection;
  activeCell: CellCoord | null;
};

export type BodyContextMenuInput<T> = Omit<CellContextMenuInput<T>, 'cell' | 'clientX' | 'clientY'> & {
  event: Pick<MouseEvent, 'target' | 'clientX' | 'clientY'>;
};

// セルの座標から params を作ります(右クリックのセルと、キーボードで開くアクティブセルで共通)。行が無い(グループ行・ラベル行・
//   範囲外)ときは null(開かない)。
const buildCellContextMenuParams = <T,>({
  cell,
  clientX,
  clientY,
  rowModel,
  orderedColumns,
  selection,
  activeCell,
}: CellContextMenuInput<T>): GridContextMenuParams<T> | null => {
  const rowIndex = cell.row;
  const colIndex = cell.col;
  const row = rowModel.getRow(rowIndex);
  const column = orderedColumns[colIndex];
  if (!row || !column) {
    return null;
  }
  const rowKey = rowModel.getRowKey(rowIndex) ?? rowIndex;
  return {
    target: {
      type: 'cell',
      rowIndex,
      colIndex,
      rowKey,
      row,
      column,
      value: getCellValue(row, column),
    },
    clientX,
    clientY,
    selection,
    activeCell,
    isTargetSelected: isContextMenuCellSelected(selection, rowIndex, colIndex),
  };
};

// 右クリックの対象(セル / 行番号)を DOM(data-row-index / data-ssg-col-key)から逆引きし、メニューへ渡す params を作ります。
//   開かないとき(見出し / 範囲外)は null(ブラウザの標準のメニューへ)。
const buildBodyContextMenuParams = <T,>({
  event,
  rowModel,
  orderedColumns,
  selection,
  activeCell,
}: BodyContextMenuInput<T>): GridContextMenuParams<T> | null => {
  const targetEl = event.target as HTMLElement | null;
  if (!targetEl) {
    return null;
  }
  // 本体の行(行番号の列を含む)。見出しはこれを持たないので null。
  const rowEl = targetEl.closest<HTMLElement>('[data-row-index]');
  if (!rowEl) {
    return null;
  }
  const rowIndexRaw = rowEl.dataset.rowIndex;
  if (rowIndexRaw === undefined) {
    return null;
  }
  const rowIndex = Number(rowIndexRaw);
  if (!Number.isInteger(rowIndex)) {
    return null;
  }
  const row = rowModel.getRow(rowIndex);
  if (!row) {
    return null;
  }
  const rowKey = rowModel.getRowKey(rowIndex) ?? rowIndex;
  // セル(data-ssg-col-key あり)か、行番号(なし)かで対象を分けます。
  const cellEl = targetEl.closest<HTMLElement>('[data-ssg-col-key]');
  const colKey = cellEl?.dataset.ssgColKey;
  if (cellEl && colKey !== undefined) {
    const colIndex = resolveContextMenuColIndex(orderedColumns, colKey);
    if (colIndex < 0) {
      return null;
    }
    return buildCellContextMenuParams({
      cell: { row: rowIndex, col: colIndex },
      clientX: event.clientX,
      clientY: event.clientY,
      rowModel,
      orderedColumns,
      selection,
      activeCell,
    });
  }
  const target: GridContextMenuTarget<T> = { type: 'rowHeader', rowIndex, rowKey, row };
  return {
    target,
    clientX: event.clientX,
    clientY: event.clientY,
    selection,
    activeCell,
    isTargetSelected: isContextMenuRowSelected(selection, rowIndex),
  };
};

export const contextMenuFeature = {
  // メニューの読み上げの名前の既定(シェルが本体の既定に重ねる)。
  localeText: DEFAULT_CONTEXT_MENU_LOCALE_TEXT,
  createCellContextMenu,
  CellContextMenuPopover,
  buildBodyContextMenuParams,
  buildCellContextMenuParams,
} satisfies GridFeatureParts<'contextMenu'> as unknown as GridFeature<'contextMenu'>;