// 変更(非依存化 ③-5): 本体は controllers/historyController.ts(React 非依存)へ移設し、本 hook は
//   useController でレンダー後に最新 args を渡すだけの薄いアダプタです。返すメソッドの参照は
//   コントローラのもので完全に安定します(旧実装は rows / selection が変わるたびに handleRowsChange の
//   参照が変わっていました)。onRowsChange 未指定時に handleRowsChange が undefined になる契約は維持します。
import { useMemo } from 'react';
import {
  createHistoryController,
  type HistoryControllerArgs,
} from '../controllers/historyController';
import { useController } from './useController';

export const useGridHistoryController = <T,>(args: HistoryControllerArgs<T>) => {
  const controller = useController(() => createHistoryController<T>(), args);
  const hasRowsChange = args.onRowsChange != null;
  const handleRowsChange = useMemo(
    () => (hasRowsChange ? controller.handleRowsChange : undefined),
    [controller, hasRowsChange],
  );
  return {
    handleRowsChange,
    undo: controller.undo,
    redo: controller.redo,
    canUndo: controller.canUndo,
    canRedo: controller.canRedo,
    clearHistory: controller.clearHistory,
  };
};

export default useGridHistoryController;