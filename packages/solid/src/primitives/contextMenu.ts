// セル / 行番号の右クリックメニュー(enableContextMenu + getContextMenuItems。機能 features/contextMenu)のコントローラを
//   Solid へつなぎます。React 版の hooks/useCellContextMenuController.ts + features/contextMenu.tsx の useCellContextMenu に
//   あたるものです。中身は core の controllers/contextMenuController(右クリックの位置に置く / 外側の押下・Escape・スクロールで
//   閉じる / 開いた後のフォーカス / ↓ ↑ Home End での項目の移動)。右クリックの対象の解決と項目の問い合わせはシェルが行い、
//   決まった params と項目を open へ渡します(React 版と同じ)。
import { createMemo } from 'solid-js';
import {
  createContextMenuController,
  type ContextMenuController,
  type ContextMenuSnapshot,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/contextMenuController';
import { connectController } from './controller';
import { createExternalStoreSignal } from './externalStore';

export type CellContextMenuInputs = {
  gridRootRef: { readonly current: HTMLDivElement | null };
};

export type CellContextMenu<T> = {
  snapshot: () => ContextMenuSnapshot<T>;
  // 開いているか(真偽値が変わったときだけ知らせる。シェルの Tab の順・キー操作・貼り付けを止めるのに使う)。
  isOpen: () => boolean;
  open: ContextMenuController<T>['open'];
  close: ContextMenuController<T>['close'];
  // パネルの要素(外側の押下の判定・開いた後のフォーカス。部品が渡す)。
  panelRef: ContextMenuController<T>['panelRef'];
};

export function createCellContextMenu<T>(inputs: CellContextMenuInputs): CellContextMenu<T> {
  const controller = createContextMenuController<T>();
  connectController(controller, () => ({ gridRootRef: inputs.gridRootRef }));
  const snapshot = createExternalStoreSignal(controller);
  return {
    snapshot,
    isOpen: createMemo(() => snapshot().state !== null),
    open: controller.open,
    close: controller.close,
    panelRef: controller.panelRef,
  };
}