// 追加(非依存化 ③): フレームワーク非依存のコントローラ(controllers/)を React に接続する共通 hook です。
//   - 生成はマウント時に 1 回(useState 初期化子)。
//   - update(args) はレンダー直後(レイアウト effect = コミット後・描画前)に毎回呼び、コントローラが
//     「最新の args」を保持します。旧 useCallback の deps 閉包と同じく、イベント時点で最新値を読めます。
//     変更(③-17): passive effect(useEffect)ではなくレイアウト effect にしました。コミットから
//     passive effect までの間にネイティブの pointermove 等が届いても古い args を読まないためです
//     (旧実装の「レンダー中に latest-ref を代入」と同じ鮮度)。SSR では useEffect にフォールバックします。
//   - レンダー中に読む値を持つコントローラは subscribe / getSnapshot を公開し、useSyncExternalStore で
//     購読します。dispose を持つコントローラはアンマウントで呼びます。
//   Solid 版は同じコントローラを onMount / createEffect / onCleanup で接続します。
import { useEffect, useLayoutEffect, useState } from 'react';

const useIsomorphicLayoutEffect =
  typeof document !== 'undefined' ? useLayoutEffect : useEffect;

export type ControllerLike<Args> = {
  update: (args: Args) => void;
  dispose?: () => void;
};

export function useController<Args, C extends ControllerLike<Args>>(
  create: () => C,
  args: Args,
): C {
  const [controller] = useState(create);
  useIsomorphicLayoutEffect(() => {
    controller.update(args);
  });
  useEffect(() => {
    return () => {
      controller.dispose?.();
    };
  }, [controller]);
  return controller;
}