// 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-12): エディタがフォーカスを持ったまま外れたとき(編集中にグリッドごと
//   アンマウントされた = キーボードのショートカットでタブを切り替えた等)に、打っていた値を確定します。これまでは blur が
//   起きないので値が黙って捨てられていた(display: none で隠したときは blur で確定していた)。
//   - 外れる直前(レイアウトの後片付け。DOM から外す前)に入力欄がフォーカスを持っていたかと、その時点の値を控えます。
//     確定・取消でエディタが外れるときは、フォーカスは先にルートへ移っている(または blur で確定済み)ので何もしません。
//   - 確定するのはマイクロタスクの後です。StrictMode の開発時の付け直し(後片付けの直後に同じエディタをもう一度付ける)
//     では、付け直されていれば確定しません。
//   - 書き込み先の確認(まだ同じセルの編集中か)は onRemoved を受けるグリッド側(editController の commitEditAt)が行います。
import { useRef, type RefObject } from 'react';
import { useIsomorphicLayoutEffect } from '../hooks/useController';

export const useCommitIfRemovedWhileFocused = (
  elementRefs: ReadonlyArray<RefObject<HTMLElement | null>>,
  value: unknown,
  onRemoved: ((value: unknown) => void) | undefined,
): void => {
  const latest = useRef({ value, onRemoved, alive: false });
  useIsomorphicLayoutEffect(() => {
    latest.current.value = value;
    latest.current.onRemoved = onRemoved;
  });
  useIsomorphicLayoutEffect(() => {
    const holder = latest.current;
    holder.alive = true;
    return () => {
      holder.alive = false;
      const focused = elementRefs.some((elementRef) => {
        const element = elementRef.current;
        return element !== null && element.ownerDocument.activeElement === element;
      });
      if (!focused || holder.onRemoved === undefined) {
        return;
      }
      const { value: lastValue, onRemoved: callback } = holder;
      queueMicrotask(() => {
        if (!holder.alive) {
          callback(lastValue);
        }
      });
    };
    // 付けたとき 1 回だけ(後片付けは外れるときだけ)。elementRefs は ref の入れ物で、中身は後片付けの時点で読む。
  }, []);
};