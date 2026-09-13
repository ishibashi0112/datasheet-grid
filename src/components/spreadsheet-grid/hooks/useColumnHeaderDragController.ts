// 変更(非依存化 ③-18): 本体は controllers/columnHeaderDragController.ts(React 非依存)へ移設し、本 hook は
//   インジケータ用の ref 3 本を用意して useController で最新 args を渡すだけの薄いアダプタです。
//   公開ハンドラ / applyReorderSettle の参照は安定します(GridHeaderRow の memo 維持)。ドラッグ中の
//   unmount はコントローラの dispose が後始末します。
import { useRef, type RefObject } from 'react';
import {
  createColumnHeaderDragController,
  type ColumnHeaderDragArgs,
} from '../controllers/columnHeaderDragController';
import { useController } from './useController';

type UseColumnHeaderDragControllerArgs<T> = Omit<
  ColumnHeaderDragArgs<T>,
  | 'leftPaneScrollRef'
  | 'rightPaneScrollRef'
  | 'bodyScrollRef'
  | 'scrollContainerRef'
  | 'leftIndicatorRef'
  | 'centerIndicatorRef'
  | 'rightIndicatorRef'
> & {
  leftPaneScrollRef: RefObject<HTMLDivElement | null>;
  rightPaneScrollRef: RefObject<HTMLDivElement | null>;
  bodyScrollRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
};

export const useColumnHeaderDragController = <T,>(
  args: UseColumnHeaderDragControllerArgs<T>,
) => {
  const leftIndicatorRef = useRef<HTMLDivElement | null>(null);
  const centerIndicatorRef = useRef<HTMLDivElement | null>(null);
  const rightIndicatorRef = useRef<HTMLDivElement | null>(null);
  const controller = useController(() => createColumnHeaderDragController<T>(), {
    ...args,
    leftIndicatorRef,
    centerIndicatorRef,
    rightIndicatorRef,
  });
  return {
    onColumnDragHandlePointerDown: controller.onColumnDragHandlePointerDown,
    leftIndicatorRef,
    centerIndicatorRef,
    rightIndicatorRef,
    applyReorderSettle: controller.applyReorderSettle,
  };
};