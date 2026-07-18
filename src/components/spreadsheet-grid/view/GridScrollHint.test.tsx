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

// トラック帯検知(pointermove の座標判定)に必要な幾何を jsdom へスタブします。
//   幅 800px・スクロールバー幅 0(macOS オーバーレイ相当)→ 右端 18px が帯。
const stubScrollerGeometry = (el: HTMLElement) => {
  Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(el, 'offsetWidth', { value: 800, configurable: true });
  el.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      right: 800,
      bottom: VIEWPORT_HEIGHT,
      width: 800,
      height: VIEWPORT_HEIGHT,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
};

// jsdom に PointerEvent が無い環境でも座標付きで届くよう、MouseEvent で pointermove を送ります。
const firePointerMove = (el: HTMLElement, clientX: number, clientY: number) => {
  act(() => {
    el.dispatchEvent(
      new MouseEvent('pointermove', { clientX, clientY, bubbles: true }),
    );
  });
};

describe('GridScrollHint(ルーラー + ジャンププレビュー)', () => {
  it("trigger='always' で目盛りが表示される(1,000 行 → 100 行刻み 11 目盛り)", () => {
    const { container } = render(
      <Harness options={resolve({ trigger: 'always' })} />,
    );
    const ruler = container.querySelector('.ssg-scroll-hint-ruler');
    expect(ruler).not.toBeNull();
    expect(ruler?.classList.contains('ssg-scroll-hint-ruler--visible')).toBe(
      true,
    );
    const labels = Array.from(
      container.querySelectorAll('.ssg-scroll-hint-ruler-label'),
      (node) => node.textContent,
    );
    expect(labels).toHaveLength(11);
    expect(labels[0]).toBe('0');
    expect(labels[10]).toBe((1000).toLocaleString());
  });

  it("trigger='scroll' ではスクロールするまで目盛りは非表示クラスのまま", () => {
    const { container, getByTestId } = render(
      <Harness options={resolve(true)} />,
    );
    const ruler = container.querySelector('.ssg-scroll-hint-ruler');
    expect(ruler?.classList.contains('ssg-scroll-hint-ruler--visible')).toBe(
      false,
    );
    act(() => {
      fireEvent.scroll(getByTestId('scroller'));
    });
    expect(ruler?.classList.contains('ssg-scroll-hint-ruler--visible')).toBe(
      true,
    );
  });

  it('トラック帯ホバーでジャンププレビュー(サム中心写像の行番号 + 列値)が出る', () => {
    const { container, getByTestId } = render(
      <Harness options={resolve({ hintColumn: 'code' })} />,
    );
    const scroller = getByTestId('scroller');
    stubScrollerGeometry(scroller);
    // トラック中央(y=240)。thumb 30px → range 450 → frac 0.5 → 物理 17,778px → 行 index 493。
    firePointerMove(scroller, 790, 240);
    const label = container.querySelector('.ssg-scroll-hint-jumpline-label');
    expect(label).not.toBeNull();
    expect(label?.textContent).toContain('行 494 へ');
    expect(label?.textContent).toContain('PN-493');
    // ルーラーもホバー中は表示される(trigger='scroll' でスクロールしていなくても)。
    expect(
      container
        .querySelector('.ssg-scroll-hint-ruler')
        ?.classList.contains('ssg-scroll-hint-ruler--visible'),
    ).toBe(true);
  });

  it('帯の外へ出る / pointerleave でジャンププレビューが消える', () => {
    const { container, getByTestId } = render(
      <Harness options={resolve(true)} />,
    );
    const scroller = getByTestId('scroller');
    stubScrollerGeometry(scroller);
    firePointerMove(scroller, 790, 240);
    expect(
      container.querySelector('.ssg-scroll-hint-jumpline'),
    ).not.toBeNull();
    firePointerMove(scroller, 100, 240);
    expect(container.querySelector('.ssg-scroll-hint-jumpline')).toBeNull();
    firePointerMove(scroller, 790, 240);
    act(() => {
      fireEvent.pointerLeave(scroller);
    });
    expect(container.querySelector('.ssg-scroll-hint-jumpline')).toBeNull();
  });

  it('上端付近ではラベルが線の下側へ反転する(ヘッダー重なり回避)', () => {
    const { container, getByTestId } = render(
      <Harness options={resolve(true)} />,
    );
    const scroller = getByTestId('scroller');
    stubScrollerGeometry(scroller);
    firePointerMove(scroller, 790, 0);
    const label = container.querySelector('.ssg-scroll-hint-jumpline-label');
    expect(label?.textContent).toContain('行 1 へ');
    expect(
      label?.classList.contains('ssg-scroll-hint-jumpline-label--below'),
    ).toBe(true);
  });

  it('SSRM 未ロード行のジャンプ先は行番号のみ(detail なし)', () => {
    const { container, getByTestId } = render(
      <Harness
        options={resolve({ hintColumn: 'code' })}
        rowModel={makeRowModel(() => false)}
      />,
    );
    const scroller = getByTestId('scroller');
    stubScrollerGeometry(scroller);
    firePointerMove(scroller, 790, 240);
    const label = container.querySelector('.ssg-scroll-hint-jumpline-label');
    expect(label?.textContent).toContain('行 494 へ');
    expect(
      container.querySelector('.ssg-scroll-hint-jumpline-detail'),
    ).toBeNull();
  });

  it('ruler=false ではルーラーもジャンププレビューも描画しない', () => {
    const { container, getByTestId } = render(
      <Harness options={resolve({ ruler: false, trigger: 'always' })} />,
    );
    expect(container.querySelector('.ssg-scroll-hint-ruler')).toBeNull();
    const scroller = getByTestId('scroller');
    stubScrollerGeometry(scroller);
    firePointerMove(scroller, 790, 240);
    expect(container.querySelector('.ssg-scroll-hint-jumpline')).toBeNull();
  });
});