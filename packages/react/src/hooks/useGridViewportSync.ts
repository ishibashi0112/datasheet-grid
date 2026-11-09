// 追加(scroll-space 仮想化): active cell 自動スクロール / clamp の物理↔論理換算。
// 変更(非依存化 ③-3): 本体は controllers/viewportSyncController.ts(React 非依存)へ移設し、本 hook は
//   レンダー後に controller.update(args) を呼ぶだけの薄いアダプタです。旧 3 effect の deps に相当する
//   「いつ動くか」の判定はコントローラ側が引数の参照 / 値比較で行うため、挙動は従来と同じです。
import { useEffect, useState, type RefObject } from 'react';
import {
  createScrollScaleAnchor,
  createViewportSyncController,
  type ViewportSyncArgs,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/viewportSyncController';
import { useIsomorphicLayoutEffect } from './useController';

type UseGridViewportSyncArgs<T> = Omit<ViewportSyncArgs<T>, 'scrollElement'> & {
  scrollRef: RefObject<HTMLDivElement | null>;
  // 追加(1.0.1 / AP-24): 縮めたスクロールの率が変わって物理の位置を直したとき(見ている行を保つ)。
  onScrollTopAnchored: (scrollTop: number) => void;
};

export const useGridViewportSync = <T,>({
  scrollRef,
  onScrollTopAnchored,
  ...args
}: UseGridViewportSyncArgs<T>) => {
  const [controller] = useState(() => createViewportSyncController<T>());
  const [scaleAnchor] = useState(createScrollScaleAnchor);
  // 追加(1.0.1 / AP-24): 描く前に直します(レイアウト effect。view スライスへの書き込みで描き直してから描く)。
  useIsomorphicLayoutEffect(() => {
    scaleAnchor.update(scrollRef.current, args.verticalScaleFactor, onScrollTopAnchored);
  });
  useEffect(() => {
    controller.update({ ...args, scrollElement: scrollRef.current });
  });
};

export default useGridViewportSync;