// 変更(非依存化 ③-17): 本体は controllers/pointerInteractionsController.ts(React 非依存)へ移設し、本 hook は
//   useController で最新 args を渡すだけの薄いアダプタです。返すハンドラの参照は安定します(旧実装は
//   deps の変化で毎回変わり、memo 済みの行 / ヘッダーへ伝播していました)。window リスナーと端
//   auto-scroll ループの開始 / 停止はコントローラ側が update / dispose で扱います。
import type { RefObject } from 'react';
import type { CellCoord } from '../model/gridTypes';
import {
  createPointerInteractionsController,
  type PointerInteractionsArgs,
} from '@ishibashi0112/spreadsheet-grid-core/controllers/pointerInteractionsController';
import { useController } from './useController';

export {
  TOUCH_DOUBLE_TAP_MS,
  TOUCH_TAP_SLOP_PX,
} from '@ishibashi0112/spreadsheet-grid-core/controllers/pointerInteractionsController';

type UseGridPointerInteractionsArgs<T> = Omit<
  PointerInteractionsArgs<T>,
  | 'gridRootRef'
  | 'bodyScrollRef'
  | 'scrollContainerRef'
  | 'leftPaneScrollRef'
  | 'rightPaneScrollRef'
  | 'pointerClientRef'
  | 'autoScrollFrameRef'
  | 'onCellDoubleClickRef'
> & {
  gridRootRef: RefObject<HTMLDivElement | null>;
  bodyScrollRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  leftPaneScrollRef: RefObject<HTMLDivElement | null>;
  rightPaneScrollRef: RefObject<HTMLDivElement | null>;
  pointerClientRef: RefObject<{ x: number; y: number } | null>;
  autoScrollFrameRef: RefObject<number | null>;
  onCellDoubleClickRef: RefObject<(cell: CellCoord) => void>;
};

export const useGridPointerInteractions = <T,>(args: UseGridPointerInteractionsArgs<T>) => {
  const controller = useController(() => createPointerInteractionsController<T>(), args);
  return {
    updateSelectionFromPointer: controller.updateSelectionFromPointer,
    handleCellPointerDown: controller.handleCellPointerDown,
    handleCellDoubleClick: controller.handleCellDoubleClick,
    handleCellPointerEnter: controller.handleCellPointerEnter,
    handleNativeDragStart: controller.handleNativeDragStart,
    handleRowHeaderPointerDown: controller.handleRowHeaderPointerDown,
    handleRowHeaderPointerEnter: controller.handleRowHeaderPointerEnter,
    handleColumnHeaderPointerDown: controller.handleColumnHeaderPointerDown,
    handleColumnHeaderPointerEnter: controller.handleColumnHeaderPointerEnter,
  };
};

export default useGridPointerInteractions;