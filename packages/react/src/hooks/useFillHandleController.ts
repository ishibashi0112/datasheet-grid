// 追加(フィルハンドル 1A): フィルハンドルのコントローラ(controllers/fillHandleController.ts。React 非依存)を
//   useController で接続し、状態(ドラッグ中の範囲 / 埋めたあとのボタン)を useSyncExternalStore で購読する
//   薄いアダプタです。ポインタ位置(ツールチップ用)は FillTooltip が直接購読し、シェルは再描画しません。
import { useSyncExternalStore } from 'react';
import {
  createFillHandleController,
  type FillHandleControllerArgs,
} from '@ishibashi0112/spreadsheet-grid-core/controllers/fillHandleController';
import { useController } from './useController';

export const useFillHandleController = <T,>(args: FillHandleControllerArgs<T>) => {
  const controller = useController(() => createFillHandleController<T>(), args);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return {
    fillController: controller,
    fillSnapshot: snapshot,
    // ボタン / メニューパネルの要素(外側クリック判定。view が ref に渡します)。
    fillChipRef: controller.chipElement,
    fillMenuRef: controller.menuPanel,
  };
};

export default useFillHandleController;