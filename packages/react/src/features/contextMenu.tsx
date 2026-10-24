// 追加(差し込み式 段階 2): セル / 行のコンテキストメニュー(enableContextMenu + getContextMenuItems)の機能です。中身は
//   シェル(GridShell.tsx)にあった controller の接続と popover の描画、右クリックの対象(セル / 行番号)の解決をそのまま
//   移したもので、シェルは controller を元の位置で useCellContextMenu から受け取り、右クリックの委譲ハンドラ(シェル)は
//   対象の解決を buildBodyContextMenuParams に任せます。機能セットに無い構成では enableContextMenu を false として扱い
//   (createSpreadsheetGrid)、ブラウザ標準のメニューのままです。
import { CellContextMenuPopover } from '../view/CellContextMenuPopover';
import { useCellContextMenuController } from '../hooks/useCellContextMenuController';
import {
  resolveContextMenuColIndex,
  isContextMenuCellSelected,
  isContextMenuRowSelected,
} from '@ishibashi0112/spreadsheet-grid-core/logic/contextMenuTarget';
import { getCellValue } from '@ishibashi0112/spreadsheet-grid-core/utils/permissions';
import type { GridContextMenuItem, GridContextMenuParams, GridContextMenuTarget } from '../model/gridTypes';
import type { BodyContextMenuInput, CellContextMenuFeatureArgs, CellContextMenuFeatureResult, ReactGridFeatures } from './types';

const EMPTY_CONTEXT_MENU_ITEMS: GridContextMenuItem[] = [];

// 追加(バッチ②): セル/行の汎用コンテキストメニュー(完全カスタム)の controller です。
//             配置(右クリック座標)/ outside click / Escape / scroll close を管理します。
const useCellContextMenuFeature = <T,>({ gridRootRef }: CellContextMenuFeatureArgs): CellContextMenuFeatureResult<T> => {
  const {
    contextMenuState,
    contextMenuLayout,
    contextMenuRef,
    isContextMenuOpen,
    openContextMenu,
    closeContextMenu,
  } = useCellContextMenuController<T>({ gridRootRef });
  return {
    isContextMenuOpen,
    openContextMenu,
    // コンテキストメニュー popover の描画です(portal で body 直下へ出します)。
    //   closed 時はコンポーネント側が null を返すため、常時この 1 要素を tail に置きます。
    renderContextMenuPopover: (slots, themeClassName) => (
      <CellContextMenuPopover
        slots={slots}
        themeClassName={themeClassName}
        isOpen={isContextMenuOpen}
        items={contextMenuState?.items ?? EMPTY_CONTEXT_MENU_ITEMS}
        layout={contextMenuLayout}
        popoverRef={contextMenuRef}
        onRequestClose={closeContextMenu}
      />
    ),
  };
};

// 右クリックの対象(セル / 行番号のガター)を DOM(data-row-index / data-ssg-col-key)から逆引きし、メニューへ渡す
//   params を作ります。開かないとき(ヘッダー / SSRM 未ロード行 / 範囲外)は null(ブラウザ標準メニューへ)。
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
  // ボディ行コンテナ(行NO ガター含む)。ヘッダーはこれを持たないため null → 早期 return。
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
  // SSRM 未ロード / OOB は開きません(標準メニューへ)。
  if (!row) {
    return null;
  }
  const rowKey = rowModel.getRowKey(rowIndex) ?? rowIndex;

  // セル(data-ssg-col-key あり)か、行NO ガター(なし)かで target を分けます。
  let target: GridContextMenuTarget<T>;
  let isTargetSelected: boolean;
  const cellEl = targetEl.closest<HTMLElement>('[data-ssg-col-key]');
  const colKey = cellEl?.dataset.ssgColKey;
  if (cellEl && colKey !== undefined) {
    const colIndex = resolveContextMenuColIndex(orderedColumns, colKey);
    if (colIndex < 0) {
      return null;
    }
    const column = orderedColumns[colIndex];
    target = {
      type: 'cell',
      rowIndex,
      colIndex,
      rowKey,
      row,
      column,
      value: getCellValue(row, column),
    };
    isTargetSelected = isContextMenuCellSelected(selection, rowIndex, colIndex);
  } else {
    target = { type: 'rowHeader', rowIndex, rowKey, row };
    isTargetSelected = isContextMenuRowSelected(selection, rowIndex);
  }

  return {
    target,
    clientX: event.clientX,
    clientY: event.clientY,
    selection,
    activeCell,
    isTargetSelected,
  };
};

export const contextMenuFeature: NonNullable<ReactGridFeatures['contextMenu']> = {
  useCellContextMenu: useCellContextMenuFeature,
  buildBodyContextMenuParams,
};