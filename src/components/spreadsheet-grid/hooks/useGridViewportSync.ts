// 追加(scroll-space 仮想化): active cell 自動スクロール / clamp の物理↔論理換算。
// 変更(非依存化 ③-3): 本体は controllers/viewportSyncController.ts(React 非依存)へ移設し、本 hook は
//   レンダー後に controller.update(args) を呼ぶだけの薄いアダプタです。旧 3 effect の deps に相当する
//   「いつ動くか」の判定はコントローラ側が引数の参照 / 値比較で行うため、挙動は従来と同じです。
import { useEffect, useState, type RefObject } from 'react';
import {
  createViewportSyncController,
  type ViewportSyncArgs,
} from '../controllers/viewportSyncController';

type UseGridViewportSyncArgs<T> = Omit<ViewportSyncArgs<T>, 'scrollElement'> & {
  scrollRef: RefObject<HTMLDivElement | null>;
};

export const useGridViewportSync = <T,>({
  scrollRef,
  ...args
}: UseGridViewportSyncArgs<T>) => {
  const [controller] = useState(() => createViewportSyncController<T>());
  useEffect(() => {
    controller.update({ ...args, scrollElement: scrollRef.current });
  });
};

export default useGridViewportSync;