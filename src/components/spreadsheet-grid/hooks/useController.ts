// 追加(非依存化 ③): フレームワーク非依存のコントローラ(controllers/)を React に接続する共通 hook です。
//   - 生成はマウント時に 1 回(useState 初期化子)。
//   - update(args) はレンダー後(effect)に毎回呼び、コントローラが「最新の args」を保持します。
//     旧 useCallback の deps 閉包と同じく、イベント時点で最新値を読めます(effect はイベントより先に
//     走るため 1 レンダー遅れは生じません)。レンダー中に読む値を持つコントローラは subscribe を
//     公開し、useSyncExternalStore で購読します。
//   - dispose を持つコントローラはアンマウントで呼びます。
//   Solid 版は同じコントローラを onMount / createEffect / onCleanup で接続します。
import { useEffect, useState } from 'react';

export type ControllerLike<Args> = {
  update: (args: Args) => void;
  dispose?: () => void;
};

export function useController<Args, C extends ControllerLike<Args>>(
  create: () => C,
  args: Args,
): C {
  const [controller] = useState(create);
  useEffect(() => {
    controller.update(args);
  });
  useEffect(() => {
    return () => {
      controller.dispose?.();
    };
  }, [controller]);
  return controller;
}