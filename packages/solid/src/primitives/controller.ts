// core のコントローラ({ update(args), dispose() })を Solid へつなぎます。React 版の hooks/useController.ts
//   (useControllerLifecycle)にあたるものです。
//   - 'render': 描画の段の effect(createRenderEffect)で update します。React のレイアウト effect(コミット後・描く前)の代わり。
//   - 'effect': ふつうの effect(createEffect)。React の passive effect(onXxx の通知)の代わり。
//   Solid 2.0 の effect は 2 段(compute が読む = 依存、apply が副作用)。args を組み立てる関数を compute にするので、
//   args が読む signal のどれかが変わるたびに update が呼ばれます(React の「描くたびに update」と同じ)。
//
//   試作で分かったこと: Solid の createRenderEffect の最初の実行は「描く途中」(JSX の要素を作る前)なので、
//   ref がまだ入っていません(React のレイアウト effect はコミット後なので ref が入っている)。core のコントローラは
//   最初の update で DOM を掴む(scrollSync の attach など)ので、最初の update は onSettled(描き終わった後)まで遅らせ、
//   それまでの args は覚えておくだけにします。
import { createEffect, createRenderEffect, onSettled } from 'solid-js';

export type ControllerLike<Args> = {
  update: (args: Args) => void;
  dispose?: () => void;
};

export function connectController<Args>(
  controller: ControllerLike<Args>,
  args: () => Args,
  timing: 'render' | 'effect' = 'render',
): void {
  let mounted = false;
  let latest: { value: Args } | null = null;
  const apply = (next: Args) => {
    latest = { value: next };
    if (mounted) {
      controller.update(next);
    }
  };
  if (timing === 'render') {
    createRenderEffect(args, apply);
  } else {
    createEffect(args, apply);
  }
  onSettled(() => {
    mounted = true;
    if (latest) {
      controller.update(latest.value);
    }
    return () => controller.dispose?.();
  });
}