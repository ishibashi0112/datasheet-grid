// GridScrollHint(スクロール位置インジケーター)の DOM テストです。
//   位置・行番号は props の計測値から導出される設計のため、jsdom でも scrollTop /
//   viewportHeight 等を props として直接与えて検証できます(実 DOM の scrollHeight 等は不要)。
//   「スクロール中フラグ」だけは実イベント(fireEvent.scroll)+ fake timers で検証します。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { useRef } from 'react';

import { GridScrollHint } from './GridScrollHint';
import type { GridScrollHintProps } from './GridScrollHint';
import { resolveScrollHintOptions } from '../logic/scrollHint';
import type { ResolvedScrollHintOptions } from '../logic/scrollHint';
import { createUniformRowMetrics } from '../logic/verticalGeometry';
import type { RowModel, ScrollHintOptions } from '../model/gridTypes';

// jsdom には ResizeObserver が無い(GridScrollHint がマウント時に new する)ため最小スタブを
//   入れます。observe は no-op(コールバックを呼ばない)なのでスクロールバー幅は初期値 0 の
//   まま = オーバーレイスクロールバー環境(macOS)相当として決定的にテストできます。
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      ResizeObserverStub;
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Row = { id: number; code: string };

const ROW_HEIGHT = 36;
const ROW_COUNT = 1000;
const VIEWPORT_HEIGHT = 480;
const HEADER_HEIGHT = 36;

const makeRowModel = (
  loaded: (index: number) => boolean = () => true,
): RowModel<Row> => ({
  getRowCount: () => ROW_COUNT,
  getRow: (viewIndex) =>
    (loaded(viewIndex)
      ? { id: viewIndex, code: `PN-${viewIndex}` }
      : undefined) as Row,
  getSourceIndex: (viewIndex) => viewIndex,
  getRowKey: (viewIndex) => viewIndex,
});

const resolve = (input: boolean | ScrollHintOptions<Row>) => {
  const resolved = resolveScrollHintOptions<Row>(input);
  if (resolved === null) {
    throw new Error('resolved が null になる入力はテスト対象外です');
  }
  return resolved;
};

// scrollContainerRef に実 DOM(空 div)を張るテストハーネスです。
function Harness({
  options,
  scrollTop = 0,
  physicalBodyHeight = ROW_COUNT * ROW_HEIGHT,
  verticalScaleFactor = 1,
  rowModel = makeRowModel(),
  viewportHeight = VIEWPORT_HEIGHT,
}: {
  options: ResolvedScrollHintOptions<Row>;
} & Partial<
  Pick<
    GridScrollHintProps<Row>,
    | 'scrollTop'
    | 'physicalBodyHeight'
    | 'verticalScaleFactor'
    | 'rowModel'
    | 'viewportHeight'
  >
>) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  return (
    <div>
      <div ref={scrollContainerRef} data-testid="scroller" />
      <GridScrollHint
        options={options}
        scrollContainerRef={scrollContainerRef}
        scrollTop={scrollTop}
        viewportHeight={viewportHeight}
        headerHeight={HEADER_HEIGHT}
        physicalBodyHeight={physicalBodyHeight}
        verticalScaleFactor={verticalScaleFactor}
        rowMetrics={createUniformRowMetrics(ROW_COUNT, ROW_HEIGHT)}
        rowModel={rowModel}
      />
    </div>
  );
}

const bubbleOf = (container: HTMLElement) =>
  container.querySelector('.ssg-scroll-hint-bubble');

describe('GridScrollHint', () => {
  it("trigger='always' でバブルが常時表示され、先頭で「行 1 / 総行数」を示す", () => {
    const { container } = render(
      <Harness options={resolve({ trigger: 'always' })} />,
    );
    const bubble = bubbleOf(container);
    expect(bubble).not.toBeNull();
    expect(bubble?.classList.contains('ssg-scroll-hint-bubble--visible')).toBe(
      true,
    );
    expect(bubble?.textContent).toContain('行 1');
    expect(bubble?.textContent).toContain((1000).toLocaleString());
  });

  it('scrollTop から表示先頭行を導出する(行 101 = 100 * rowHeight)', () => {
    const { container } = render(
      <Harness
        options={resolve({ trigger: 'always' })}
        scrollTop={100 * ROW_HEIGHT}
      />,
    );
    expect(bubbleOf(container)?.textContent).toContain('行 101');
  });

  it('pixel scaling(scaleFactor > 1)では論理 scrollTop へ写像してから行を解決する', () => {
    // 物理 1000px * 倍率 2 = 論理 2000px → floor(2000 / 36) = 行 index 55 → 表示「行 56」。
    const { container } = render(
      <Harness
        options={resolve({ trigger: 'always' })}
        scrollTop={1000}
        verticalScaleFactor={2}
      />,
    );
    expect(bubbleOf(container)?.textContent).toContain('行 56');
  });

  it('hintColumn の列値が detail として表示される', () => {
    const { container } = render(
      <Harness
        options={resolve({ trigger: 'always', hintColumn: 'code' })}
        scrollTop={100 * ROW_HEIGHT}
      />,
    );
    const detail = container.querySelector('.ssg-scroll-hint-bubble-detail');
    expect(detail?.textContent).toBe('PN-100');
  });

  it('SSRM 未ロード行(getRow=undefined)では detail を出さず行番号のみへフォールバックする', () => {
    const { container } = render(
      <Harness
        options={resolve({ trigger: 'always', hintColumn: 'code' })}
        scrollTop={100 * ROW_HEIGHT}
        rowModel={makeRowModel(() => false)}
      />,
    );
    expect(container.querySelector('.ssg-scroll-hint-bubble-detail')).toBeNull();
    expect(bubbleOf(container)?.textContent).toContain('行 101');
  });

  it('renderHint が hintColumn より優先される', () => {
    const { container } = render(
      <Harness
        options={resolve({
          trigger: 'always',
          hintColumn: 'code',
          renderHint: ({ rowIndex, rowData }) =>
            rowData ? `${rowData.code} — ${rowIndex}` : null,
        })}
        scrollTop={100 * ROW_HEIGHT}
      />,
    );
    expect(
      container.querySelector('.ssg-scroll-hint-bubble-detail')?.textContent,
    ).toBe('PN-100 — 100');
  });

  it("trigger='scroll'(既定)では scroll イベントで点灯し、停止 1 秒後に消灯する", () => {
    vi.useFakeTimers();
    const { container, getByTestId } = render(
      <Harness options={resolve(true)} />,
    );
    const bubble = bubbleOf(container);
    expect(bubble?.classList.contains('ssg-scroll-hint-bubble--visible')).toBe(
      false,
    );
    act(() => {
      fireEvent.scroll(getByTestId('scroller'));
    });
    expect(bubble?.classList.contains('ssg-scroll-hint-bubble--visible')).toBe(
      true,
    );
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(bubble?.classList.contains('ssg-scroll-hint-bubble--visible')).toBe(
      false,
    );
  });

  it("trigger='hover' では pointerenter で点灯し pointerleave で消灯する", () => {
    const { container, getByTestId } = render(
      <Harness options={resolve({ trigger: 'hover' })} />,
    );
    const bubble = bubbleOf(container);
    expect(bubble?.classList.contains('ssg-scroll-hint-bubble--visible')).toBe(
      false,
    );
    act(() => {
      fireEvent.pointerEnter(getByTestId('scroller'));
    });
    expect(bubble?.classList.contains('ssg-scroll-hint-bubble--visible')).toBe(
      true,
    );
    act(() => {
      fireEvent.pointerLeave(getByTestId('scroller'));
    });
    expect(bubble?.classList.contains('ssg-scroll-hint-bubble--visible')).toBe(
      false,
    );
  });

  it('スクロール不能(コンテンツが viewport に収まる)では何も描画しない', () => {
    const { container } = render(
      <Harness
        options={resolve({ trigger: 'always' })}
        physicalBodyHeight={200}
        viewportHeight={480}
      />,
    );
    expect(container.querySelector('.ssg-scroll-hint')).toBeNull();
  });

  it('bubble=false(ルーラーのみ設定)ではバブルを描画しない', () => {
    const { container } = render(
      <Harness options={resolve({ bubble: false, trigger: 'always' })} />,
    );
    expect(container.querySelector('.ssg-scroll-hint')).not.toBeNull();
    expect(bubbleOf(container)).toBeNull();
  });
});