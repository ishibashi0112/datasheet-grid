// 列見出しのドラッグによる列の並べ替え(columnReorder の機能)を Solid へつなぎます。React 版の
//   hooks/useColumnHeaderDragController.ts + features/columnReorder.tsx にあたるものです。中身は core の
//   controllers/columnHeaderDragController(ドラッグ中はフレームワークの状態を変えず、縦線 / ゴースト / live 方式の追従を
//   DOM へ直接書く)で、ここはドロップの縦線の要素の置き場(ペインごとに 1 つ)と、確定後の滑り込み(FLIP)の呼び出しだけです。
//   - 滑り込みは列の並びが変わって DOM を書き終えた後に呼びます(React 版はコミット後・描く前のレイアウト effect)。Solid の
//     ふつうの effect は描画の effect の後(同じマイクロタスクの中 = 描く前)に走るので、新しい位置を測れます。
//     applyReorderSettle は直前のドラッグで確定したときだけ動き、それ以外(初回 / 列幅 / 固定の変更)はすぐ戻ります。
import { createEffect } from 'solid-js';
import {
  createColumnHeaderDragController,
  type ColumnHeaderDragArgs,
  type ColumnHeaderDragController,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/columnHeaderDragController';
import { connectController } from './controller';

export type ColumnReorderArgs<T> = Omit<
  ColumnHeaderDragArgs<T>,
  'leftIndicatorRef' | 'centerIndicatorRef' | 'rightIndicatorRef'
>;

export type ColumnReorder<T> = {
  // 見出しの grip の pointerdown。
  onColumnDragHandlePointerDown: ColumnHeaderDragController<T>['onColumnDragHandlePointerDown'];
  // ドロップの縦線の要素を受け取る ref(ペインごと)。表示 / 位置はコントローラが直接書きます。
  setIndicator: (pane: 'left' | 'center' | 'right', element: HTMLDivElement) => void;
};

export function createColumnReorder<T>(args: () => ColumnReorderArgs<T>): ColumnReorder<T> {
  const controller = createColumnHeaderDragController<T>();
  const leftIndicatorRef: { current: HTMLDivElement | null } = { current: null };
  const centerIndicatorRef: { current: HTMLDivElement | null } = { current: null };
  const rightIndicatorRef: { current: HTMLDivElement | null } = { current: null };
  connectController(controller, () => ({
    ...args(),
    leftIndicatorRef,
    centerIndicatorRef,
    rightIndicatorRef,
  }), 'render', 'columnReorder');
  createEffect(
    () => args().paneLayout,
    () => {
      controller.applyReorderSettle();
    },
    { name: 'columnReorderPaneLayout' },
  );
  return {
    onColumnDragHandlePointerDown: controller.onColumnDragHandlePointerDown,
    setIndicator: (pane, element) => {
      if (pane === 'left') {
        leftIndicatorRef.current = element;
      } else if (pane === 'center') {
        centerIndicatorRef.current = element;
      } else {
        rightIndicatorRef.current = element;
      }
    },
  };
}