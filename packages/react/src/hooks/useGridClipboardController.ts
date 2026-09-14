// 変更(非依存化 ③-8): 本体は controllers/clipboardController.ts(React 非依存)へ移設し、本 hook は
//   useController でレンダー後に最新 args を渡す薄いアダプタです。isWholeGridSelected はレンダー中に
//   読む値(ヘッダーの全選択表示 / Ctrl+A の判定)のため純関数で毎回計算します。handlePaste は React の
//   合成 ClipboardEvent を構造的型へ詰め替えます。
import { useCallback, type ClipboardEvent } from 'react';
import {
  computeIsWholeGridSelected,
  createClipboardController,
  type ClipboardControllerArgs,
} from '@ishibashi0112/spreadsheet-grid-core/controllers/clipboardController';
import { useController } from './useController';

export const useGridClipboardController = <T extends object>(
  args: ClipboardControllerArgs<T>,
) => {
  const controller = useController(() => createClipboardController<T>(), args);
  const isWholeGridSelected = computeIsWholeGridSelected(
    args.uiState.selection,
    args.rowModel.getRowCount(),
    args.visibleColumns.length,
  );
  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) =>
      controller.handlePaste({
        clipboardData: event.clipboardData,
        preventDefault: () => event.preventDefault(),
      }),
    [controller],
  );
  return { isWholeGridSelected, handleCopy: controller.handleCopy, handlePaste };
};

export default useGridClipboardController;