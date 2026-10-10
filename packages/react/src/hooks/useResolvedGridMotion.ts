// 追加(motion-0): motion prop('auto' | 'on' | 'off')を実効値('on' | 'off')へ解決するフックです。
//   useResolvedGridTheme と同型: 購読は controllers/reducedMotionStore(React 非依存の外部 store)、
//   解決は logic/motion.ts の純関数で、本 hook は useSyncExternalStore で両者を接続するだけです。
//   SSR では getServerSnapshot により「低減なし」= 'auto' は 'on' で描画し、ハイドレーション後に再解決します。
import { useSyncExternalStore } from 'react';
import { reducedMotionStore } from '@ishibashi0112/spreadsheet-grid-core/controllers/reducedMotionStore';
import { resolveGridMotion, type ResolvedGridMotion } from '@ishibashi0112/spreadsheet-grid-core/logic/motion';
import type { GridMotion } from '../model/gridTypes';

export function useResolvedGridMotion(motion: GridMotion): ResolvedGridMotion {
  // 'auto' 以外でも購読自体は維持します(フックは無条件呼び出し。購読コストは変化時のみ)。
  const prefersReducedMotion = useSyncExternalStore(
    reducedMotionStore.subscribe,
    reducedMotionStore.getSnapshot,
    reducedMotionStore.getServerSnapshot,
  );
  return resolveGridMotion(motion, prefersReducedMotion);
}
