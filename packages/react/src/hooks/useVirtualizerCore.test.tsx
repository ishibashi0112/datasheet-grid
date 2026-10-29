// 追加: useVirtualizerCore(@tanstack/virtual-core の薄い React アダプタ)のテストです。
//   core はスクロール停止の判定(isScrollingResetDelay)を setTimeout で遅らせ、購読解除でもその timer を
//   消さないため、スクロール直後にアンマウントすると timer から onChange が呼ばれます。アンマウント後の
//   通知は捨てる(再描画も利用側の onChange も呼ばない)ことを固定します。jsdom のテストではファイル
//   終了後に window が無い状態で timer が走り、未処理の例外(window is not defined)になっていました。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useState } from 'react';
import type { Virtualizer } from '@tanstack/virtual-core';

import { useVirtualizerCore } from './useVirtualizerCore';

function Harness({ onChange }: { onChange: () => void }) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizerCore({
    count: 100,
    getScrollElement: () => scrollElement,
    estimateSize: () => 30,
    isScrollingResetDelay: 20,
    onChange,
  });
  return (
    <div ref={setScrollElement} data-testid="scroll" style={{ height: 300, overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }} />
    </div>
  );
}

// 追加(BR-1 見直し): 大きさの観測を差し替えたテスト用(ResizeObserver のコールバックを手で呼ぶ)。
function RectHarness({ onInstance }: { onInstance: (instance: Virtualizer<HTMLDivElement, Element>) => void }) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizerCore({
    count: 100,
    getScrollElement: () => scrollElement,
    estimateSize: () => 30,
  });
  onInstance(virtualizer);
  return <div ref={setScrollElement} />;
}

describe('useVirtualizerCore', () => {
  it('スクロール直後にアンマウントしても、スクロール停止の timer から通知しない', async () => {
    const onChange = vi.fn();
    const { getByTestId, unmount } = render(<Harness onChange={onChange} />);
    const scrollElement = getByTestId('scroll');
    act(() => {
      scrollElement.scrollTop = 120;
      scrollElement.dispatchEvent(new Event('scroll'));
    });
    expect(onChange).toHaveBeenCalled();
    unmount();
    onChange.mockClear();
    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('マウント中はスクロール停止の timer からも通知する', async () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<Harness onChange={onChange} />);
    const scrollElement = getByTestId('scroll');
    act(() => {
      scrollElement.scrollTop = 120;
      scrollElement.dispatchEvent(new Event('scroll'));
    });
    onChange.mockClear();
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 60));
    });
    expect(onChange).toHaveBeenCalled();
  });

  // 追加(BR-1 見直し 2026-10-28): 隠れている間(幅 0)の大きさは core へ渡さない(隠れている間の描き直しで窓が空に
  //   なり、出した最初のフレームの列が欠けるため)。
  it('幅 0 の大きさは core へ渡さず、前の大きさを残す', () => {
    let resize: ((entries: unknown[]) => void) | null = null;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: (entries: unknown[]) => void) {
          resize = callback;
        }
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    try {
      const holder: { instance: Virtualizer<HTMLDivElement, Element> | null } = { instance: null };
      render(<RectHarness onInstance={(next) => (holder.instance = next)} />);
      const fire = (inlineSize: number, blockSize: number) =>
        act(() => resize?.([{ borderBoxSize: [{ inlineSize, blockSize }] }]));
      fire(500, 300);
      expect(holder.instance?.scrollRect).toEqual({ width: 500, height: 300 });
      fire(0, 0);
      expect(holder.instance?.scrollRect).toEqual({ width: 500, height: 300 });
      fire(480, 0);
      expect(holder.instance?.scrollRect).toEqual({ width: 480, height: 0 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});