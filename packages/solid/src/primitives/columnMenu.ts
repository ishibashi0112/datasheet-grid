// 列メニュー(見出しの ⋮ / 見出しの右クリック / Alt+↓。機能 features/columnMenu)のコントローラを Solid へつなぎます。React 版の
//   hooks/useColumnMenuController.ts + features/columnMenu.ts の useColumnMenu にあたるものです。中身は core の
//   controllers/columnMenuController(⋮ の下 / 右クリックの位置に置く、画面に収まらなければ上へ返す / 高さを抑える、外側の押下・
//   Escape・Tab で閉じる、開いた後のフォーカス、↓ ↑ Home End での項目の移動)。メニューの項目の処理は engine の columnCommands。
import { createMemo } from 'solid-js';
import {
  createColumnMenuController,
  type ColumnMenuController,
  type ColumnMenuLayout,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/columnMenuController';
import type { GridColumn } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridTypes.unbound';
import { connectController } from './controller';
import { createExternalStoreSignal } from './externalStore';

export type ColumnMenuInputs<T> = {
  visibleColumns: () => GridColumn<T>[];
  enableColumnMenu: () => boolean;
  gridRootRef: { readonly current: HTMLDivElement | null };
};

export type ColumnMenu<T> = {
  // 開いている列のキー / 列(表示列から引く。無ければ null)/ 位置。
  openedColumnKey: () => string | null;
  openedColumn: () => GridColumn<T> | null;
  layout: () => ColumnMenuLayout | null;
  // 開いているか(真偽値が変わったときだけ知らせる。シェルの Tab の順・キー操作・貼り付けを止めるのに使う)。
  isOpen: () => boolean;
  // パネルの要素(外側の押下の判定・開いた後のフォーカス・高さの測り直し。部品が渡す)。
  panelRef: ColumnMenuController<T>['panelRef'];
  openFromButton: ColumnMenuController<T>['openFromButton'];
  openFromButtonClick: ColumnMenuController<T>['openFromButtonClick'];
  openFromContextMenu: ColumnMenuController<T>['openFromContextMenu'];
  openFromKeyboard: ColumnMenuController<T>['openFromKeyboard'];
  close: ColumnMenuController<T>['close'];
};

export function createColumnMenu<T>(inputs: ColumnMenuInputs<T>): ColumnMenu<T> {
  const controller = createColumnMenuController<T>();
  connectController(controller, () => ({
    visibleColumns: inputs.visibleColumns(),
    enableColumnMenu: inputs.enableColumnMenu(),
    gridRootRef: inputs.gridRootRef,
  }));
  const snapshot = createExternalStoreSignal(controller);
  const openedColumnKey = createMemo(() => snapshot().columnKey);
  const openedColumn = createMemo(() => {
    const key = openedColumnKey();
    return key === null ? null : (inputs.visibleColumns().find((column) => column.key === key) ?? null);
  });
  return {
    openedColumnKey,
    openedColumn,
    layout: createMemo(() => snapshot().layout),
    isOpen: createMemo(() => openedColumnKey() !== null),
    panelRef: controller.panelRef,
    openFromButton: controller.openFromButton,
    openFromButtonClick: controller.openFromButtonClick,
    openFromContextMenu: controller.openFromContextMenu,
    openFromKeyboard: controller.openFromKeyboard,
    close: controller.close,
  };
}