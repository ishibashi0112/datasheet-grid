// 変更(非依存化 ③-6): 本体は controllers/editController.ts(React 非依存)へ移設し、本 hook は
//   useController でレンダー後に最新 args を渡すだけの薄いアダプタです。返すメソッドの参照は
//   コントローラのもので完全に安定します(旧 commitEdit は uiState.editingCell / rows 等が変わるたびに
//   参照が変わっていました)。
import {
  createEditController,
  type EditControllerArgs,
} from '@ishibashi0112/spreadsheet-grid-core/controllers/editController';
import { useController } from './useController';

export const useGridEditController = <T extends object>(
  args: EditControllerArgs<T>,
) => {
  const controller = useController(() => createEditController<T>(), args);
  return {
    activateSingleCell: controller.activateSingleCell,
    startEditWithValue: controller.startEditWithValue,
    commitEdit: controller.commitEdit,
    cancelEdit: controller.cancelEdit,
  };
};

export default useGridEditController;