// @tanstack/virtual-core の Virtualizer を Solid へつなぐ薄いアダプタ(列の横の仮想化)。React 版の
//   hooks/useVirtualizerCore.ts にあたるものです。範囲が変わったら version を上げ、items() がそれを読んで計算し直します。
//   列の幅が変わったときの測り直し(measure)も items() の中で行います(measureKey。下のコメント)。
import { createMemo, createRenderEffect, createSignal, untrack } from 'solid-js';
import { onGridMounted } from './mountGate';
import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
  type PartialKeys,
  type VirtualItem,
  type VirtualizerOptions,
} from '@tanstack/virtual-core';

// 隠れている間(幅 0)の大きさは渡しません(React 版と同じ。BR-1)。
const observeShownElementRect: typeof observeElementRect = (instance, cb) =>
  observeElementRect(instance, (rect) => {
    if (rect.width) {
      cb(rect);
    }
  });

export type ColumnVirtualizerOptions<TScrollElement extends Element> = PartialKeys<
  VirtualizerOptions<TScrollElement, Element>,
  'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
> & {
  // 変わったら測り直す値(列の幅の表)。React 版は描いた後の effect(core の viewportSyncController)で measure() を呼び、
  //   onChange でもう 1 回描きます。Solid で同じことをすると、幅が変わった流れとは別の流れで version を上げるので、
  //   列見出しとセルが同じ変化で 2 回描かれます(開発ビルドが EFFECT_RELAY_TEAR で知らせる)。items() の中で測り直せば
  //   同じ流れで新しい幅の範囲になります(viewportSyncController には何もしない measure を渡す)。
  measureKey?: unknown;
};

export function createColumnVirtualizer<TScrollElement extends Element>(
  options: () => ColumnVirtualizerOptions<TScrollElement>,
) {
  const [version, setVersion] = createSignal(0);
  let mounted = false;
  // options を写している間(下の render effect)の onChange は version を上げません。items が options を読んで
  //   同じ流れで計算し直すので、上げると同じ変化で 2 回描くことになります(Solid の開発ビルドが EFFECT_RELAY_TEAR で知らせる)。
  let syncing = false;
  const resolve = (next: ColumnVirtualizerOptions<TScrollElement>): VirtualizerOptions<TScrollElement, Element> => {
    const rest = { ...next };
    delete rest.measureKey;
    return {
      observeElementRect: observeShownElementRect,
      observeElementOffset,
      scrollToFn: elementScroll,
      ...rest,
      onChange: (instance, sync) => {
        if (mounted && !syncing) {
          setVersion((value) => value + 1);
        }
        rest.onChange?.(instance, sync);
      },
    };
  };
  const instance = new Virtualizer<TScrollElement, Element>(resolve(untrack(options)));
  let measuredKey: unknown;
  // 範囲は options と version から求めます(options の写しはここで。描く前に最新の options で計算するため)。
  const items = createMemo<VirtualItem[]>(() => {
    version();
    const next = options();
    syncing = true;
    try {
      instance.setOptions(resolve(next));
      if (next.measureKey !== measuredKey) {
        measuredKey = next.measureKey;
        instance.measure();
      }
    } finally {
      syncing = false;
    }
    return instance.getVirtualItems();
  });
  // スクロールする要素の付け替え(_willUpdate)は描いた後に。
  createRenderEffect(options, () => {
    if (!mounted) {
      return;
    }
    syncing = true;
    try {
      instance._willUpdate();
    } finally {
      syncing = false;
    }
  }, { name: 'columnVirtualizerElement' });
  onGridMounted(() => {
    mounted = true;
    const cleanup = instance._didMount();
    // 要素の大きさを初めて渡すときの onChange では上げない(すぐ下で 1 回だけ上げる)。
    syncing = true;
    try {
      instance._willUpdate();
    } finally {
      syncing = false;
    }
    setVersion((value) => value + 1);
    return () => {
      mounted = false;
      cleanup();
    };
  });
  return { instance, items };
}