// 変更(非依存化 ③-19): 本体は controllers/rowDragController.ts(React 非依存)へ移設し、本 hook はガイド線用の
//   ref 3 本を用意して useController で最新 args を渡すだけの薄いアダプタです。公開ハンドラ / applyReorderSettle
//   の参照は安定します(行 memo 維持)。ドラッグ中の unmount はコントローラの dispose が後始末します。
import { useRef, type RefObject } from 'react';
import { createRowDragController, type RowDragArgs } from '../controllers/rowDragController';
import { useController } from './useController';

type UseRowDragControllerArgs = Omit<
  RowDragArgs,
  'scrollContainerRef' | 'bodyScrollRef' | 'leftIndicatorRef' | 'centerIndicatorRef' | 'rightIndicatorRef'
> & {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  bodyScrollRef: RefObject<HTMLDivElement | null>;
};

export const useRowDragController = (args: UseRowDragControllerArgs) => {
  const leftIndicatorRef = useRef<HTMLDivElement | null>(null);
  const centerIndicatorRef = useRef<HTMLDivElement | null>(null);
  const rightIndicatorRef = useRef<HTMLDivElement | null>(null);
  const controller = useController(createRowDragController, {
    ...args,
    leftIndicatorRef,
    centerIndicatorRef,
    rightIndicatorRef,
  });
  return {
    onRowDragHandlePointerDown: controller.onRowDragHandlePointerDown,
    leftIndicatorRef,
    centerIndicatorRef,
    rightIndicatorRef,
    applyReorderSettle: controller.applyReorderSettle,
  };
};

export default useRowDragController;