// 変更(非依存化 ③-7): 本体は controllers/keyboardController.ts(React 非依存)へ移設し、本 hook は
//   useController でレンダー後に最新 args を渡し、React の合成 KeyboardEvent を構造的型へ詰め替える
//   だけの薄いアダプタです。handleKeyDown の参照は安定します(旧実装は 20 個の deps で毎回変わり得た)。
import { useCallback, type KeyboardEvent } from 'react';
import {
  createKeyboardController,
  type KeyboardControllerArgs,
} from '@ishibashi0112/spreadsheet-grid-core/controllers/keyboardController';
import { useController } from './useController';

export const useGridKeyboardInteractions = <T,>(
  args: KeyboardControllerArgs<T>,
) => {
  const controller = useController(() => createKeyboardController<T>(), args);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) =>
      controller.handleKeyDown({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        isComposing: event.nativeEvent.isComposing,
        target: event.target,
        preventDefault: () => event.preventDefault(),
      }),
    [controller],
  );
  return { handleKeyDown };
};

export default useGridKeyboardInteractions;