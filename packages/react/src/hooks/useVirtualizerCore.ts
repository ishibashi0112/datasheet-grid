// 追加(非依存化 ②): @tanstack/virtual-core を直接使う薄い React アダプタです。
//   旧 @tanstack/react-virtual の useVirtualizer と同等の必要部分だけを持ちます:
//   Virtualizer インスタンスを 1 回生成し、core からの onChange で再描画(useReducer)、レイアウト
//   effect で _didMount(スクロール要素の監視開始)/ _willUpdate(要素差し替えの追従)を接続します。
//   directDomUpdates などの未使用機能は持ちません。範囲計算 / 計測 / スクロール監視の本体は
//   core 側にあり、将来の Solid 版は同じ core に別のアダプタ(createVirtualizer 相当)を被せます。
//   利用側は getVirtualItems() / getTotalSize() だけを使います(本体グリッドの列仮想化、
//   フィルターポップオーバーの候補リスト 2 種)。
import { useEffect, useLayoutEffect, useReducer, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
  type PartialKeys,
  type VirtualizerOptions,
} from '@tanstack/virtual-core';

// SSR(document 不在)では useLayoutEffect の警告を避けて useEffect にフォールバックします。
const useIsomorphicLayoutEffect =
  typeof document !== 'undefined' ? useLayoutEffect : useEffect;

// マウント中かどうかを持つ小さなホルダーです(レンダーをまたいで同じものを使うため useState で 1 回だけ作ります)。
const createMountState = () => {
  let mounted = false;
  return {
    set: (value: boolean) => {
      mounted = value;
    },
    get: () => mounted,
  };
};

export type UseVirtualizerCoreOptions<
  TScrollElement extends Element,
  TItemElement extends Element,
> = PartialKeys<
  VirtualizerOptions<TScrollElement, TItemElement>,
  'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
> & {
  // core の onChange が sync=true(スクロール中の同期更新)で呼ばれたとき flushSync で再描画するか。
  //   既定 true(旧 react-virtual と同じ)。本体グリッドは false(rAF 主導の縦同期と揃える)。
  useFlushSync?: boolean;
};

export function useVirtualizerCore<
  TScrollElement extends Element,
  TItemElement extends Element = Element,
>(
  options: UseVirtualizerCoreOptions<TScrollElement, TItemElement>,
): Virtualizer<TScrollElement, TItemElement> {
  const { useFlushSync = true, ...rest } = options;
  const rerender = useReducer((x: number) => x + 1, 0)[1];
  const [mountState] = useState(createMountState);

  const resolvedOptions: VirtualizerOptions<TScrollElement, TItemElement> = {
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    ...rest,
    onChange: (instance, sync) => {
      // アンマウント後の通知は捨てます。core はスクロール停止の判定(isScrollingResetDelay)を setTimeout で
      //   遅らせ、購読解除でもその timer を消さないため、スクロール直後にアンマウントすると timer からここへ
      //   来ます(ブラウザでは無害ですが、jsdom のテストではファイル終了後に window が無い状態で走り、
      //   未処理の例外になります)。
      if (!mountState.get()) {
        return;
      }
      if (useFlushSync && sync) {
        flushSync(rerender);
      } else {
        rerender();
      }
      rest.onChange?.(instance, sync);
    },
  };

  const [instance] = useState(
    () => new Virtualizer<TScrollElement, TItemElement>(resolvedOptions),
  );
  // 注記: オプションはレンダー中に反映します(同じレンダーで呼ぶ getVirtualItems() が最新の
  //   count / estimateSize を見るため。旧 react-virtual と同じ作法)。
  instance.setOptions(resolvedOptions);

  useIsomorphicLayoutEffect(() => {
    mountState.set(true);
    const cleanup = instance._didMount();
    return () => {
      mountState.set(false);
      cleanup();
    };
  }, [instance, mountState]);
  useIsomorphicLayoutEffect(() => {
    instance._willUpdate();
  });

  return instance;
}