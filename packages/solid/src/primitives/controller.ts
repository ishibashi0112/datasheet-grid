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
//
//   変更(0.1.0 の前の実アプリ点検 S5-01): 最初の update は onGridMounted(primitives/mountGate.ts)で走らせます。描き終わった後に
//   走るのは onSettled と同じで、利用者がそれより前(利用者の最初の effect)にハンドルを呼んだときは、その時点で先に走ります。
//   変更(同 S2-01): update は untrack の中で呼びます。update の中から利用者の通知(onSortChange など)が呼ばれ、その中で
//   利用者が signal を読むと、開発時に Solid が STRICT_READ_UNTRACKED を出していました(利用者には直せない。イベントの
//   ハンドラと同じく、通知は追跡の外で呼ぶ)。
import { createEffect, createRenderEffect, untrack } from 'solid-js';
import { onGridMounted } from './mountGate';

export type ControllerLike<Args> = {
  update: (args: Args) => void;
  dispose?: () => void;
};

//   name は effect の名前(Solid の開発用の計測 = vite dev の既定で入る attribution が console へ知らせを出すときに、
//   どの処理かが分かるように。docs/solid/README.md「開発ビルドで Solid が出す知らせ」)。
export function connectController<Args>(
  controller: ControllerLike<Args>,
  args: () => Args,
  timing: 'render' | 'effect' = 'render',
  name?: string,
): void {
  let mounted = false;
  let latest: { value: Args } | null = null;
  const apply = (next: Args) => {
    latest = { value: next };
    if (mounted) {
      untrack(() => controller.update(next));
    }
  };
  const options = name === undefined ? undefined : { name };
  if (timing === 'render') {
    createRenderEffect(args, apply, options);
  } else {
    createEffect(args, apply, options);
  }
  onGridMounted(() => {
    mounted = true;
    if (latest) {
      const value = latest.value;
      untrack(() => controller.update(value));
    }
    return () => controller.dispose?.();
  });
}