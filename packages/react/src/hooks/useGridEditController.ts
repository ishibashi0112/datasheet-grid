// 変更(非依存化 ③-6): 本体は controllers/editController.ts(React 非依存)へ移設し、本 hook は
//   useController でレンダー後に最新 args を渡すだけの薄いアダプタです。返すメソッドの参照は
//   コントローラのもので完全に安定します(旧 commitEdit は uiState.editingCell / rows 等が変わるたびに
//   参照が変わっていました)。
import {
  createEditController,
  type EditController,
  type EditControllerArgs,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/editController';
import { useController } from './useController';

// 変更(1.4.1 / AP-11): コントローラを先に作って渡せます(シェルはポインタのコントローラへ endEditLeftOpen を渡すため、この hook
//   より前で作る)。省略はここで作る(これまでどおり)。
export const useGridEditController = <T extends object>(
  args: EditControllerArgs<T>,
  created?: EditController<T>,
) => {
  const controller = useController(() => created ?? createEditController<T>(), args);
  return {
    activateSingleCell: controller.activateSingleCell,
    startEditWithValue: controller.startEditWithValue,
    commitEdit: controller.commitEdit,
    cancelEdit: controller.cancelEdit,
    registerDraftFlush: controller.registerDraftFlush,
    endEditLeftOpen: controller.endEditLeftOpen,
    registerLateCommitReceiver: controller.registerLateCommitReceiver,
  };
};

export default useGridEditController;