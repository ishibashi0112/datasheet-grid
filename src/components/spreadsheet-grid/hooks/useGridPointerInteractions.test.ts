// 追加(RS-AS)の回帰テスト: ガター行選択ドラッグ(enableRowSelection)の端 auto-scroll です。
//   ガター経路は dragState を使わない ref フラグ運用のため、既存の dragType ゲートの
//   effect ループでは対象外でした(ハンドオフ §8-④ の「端まで引っ張ってもスクロールしない」)。
//   本テストは専用 rAF ループの「armed 前は不発 / 縦のみ発動 + ポインタ直下の行で選択更新 /
//   [0, max] clamp / pointerup 後の自己停止」を renderHook 直叩きで検証します
//   (jsdom では列仮想化が 0 列描画のためグリッド render 経由では検証できません。
//    13-B3-7 と同方針)。rAF は手動キューへ差し替え、フレームを決定的に進めます。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react';

import { useGridPointerInteractions } from './useGridPointerInteractions';
import { createInitialGridUiState } from '../model/gridReducer';
import type { GridUiAction } from '../model/gridActions';
import type { GridColumn } from '../model/gridTypes';
import { createUniformRowMetrics } from '../logic/verticalGeometry';
import type { GridPaneLayout, PaneGeometry } from '../logic/geometry';

// ── rAF 手動キュー(フレームを決定的に進めるための差し替え) ──
let rafQueue: FrameRequestCallback[] = [];
let rafSeq = 0;

beforeEach(() => {
  rafQueue = [];
  rafSeq = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    rafQueue.push(callback);
    rafSeq += 1;
    return rafSeq;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// 予約済みコールバックを 1 フレームぶん実行します(実行中の再予約は次フレームへ回ります)。
const runFrame = () => {
  const callbacks = rafQueue;
  rafQueue = [];
  for (const callback of callbacks) {
    callback(0);
  }
};

type Row = { id: number };

const columns: GridColumn<Row>[] = [{ key: 'id', title: 'ID', width: 100 }];

// 幾何設定: 行高 10px × 100 行 = 全高 1000 / viewport 高 100 → max scrollTop = 900。
//   端帯は AUTO_SCROLL_EDGE_THRESHOLD=24(下端帯 y>76 / 上端帯 y<24)、
//   1 フレームの移動量は AUTO_SCROLL_STEP=18 です(autoScrollGeometry の共通定数)。
const ROW_HEIGHT = 10;
const ROW_COUNT = 100;
const VIEWPORT_WIDTH = 200;
const VIEWPORT_HEIGHT = 100;
const CONTENT_HEIGHT = ROW_HEIGHT * ROW_COUNT;

const emptyPane = (pane: 'left' | 'right'): PaneGeometry<Row> => ({
  pane,
  entries: [],
  totalWidth: 0,
});

// 中央ペイン 1 列(座標→col 解決が null にならないための最小構成)。
const paneLayout: GridPaneLayout<Row> = {
  left: emptyPane('left'),
  center: {
    pane: 'center',
    entries: [
      {
        column: columns[0],
        logicalIndex: 0,
        paneLocalStart: 0,
        paneLocalSize: 100,
        paneLocalEnd: 100,
      },
    ],
    totalWidth: 100,
  },
  right: emptyPane('right'),
};

const makeRect = (
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect =>
  ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

// 共有スクロールコンテナのスタブです。jsdom はレイアウトを持たないため、寸法と
// scrollTo(scrollTop へ反映)を instance へ上書きして実挙動を再現します。
const makeScrollContainer = () => {
  const element = document.createElement('div');
  let scrollTop = 0;
  const scrollToCalls: number[] = [];
  Object.defineProperty(element, 'scrollTop', {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
    configurable: true,
  });
  Object.defineProperty(element, 'clientWidth', {
    value: VIEWPORT_WIDTH,
    configurable: true,
  });
  Object.defineProperty(element, 'clientHeight', {
    value: VIEWPORT_HEIGHT,
    configurable: true,
  });
  Object.defineProperty(element, 'scrollHeight', {
    value: CONTENT_HEIGHT,
    configurable: true,
  });
  Object.defineProperty(element, 'scrollWidth', {
    value: VIEWPORT_WIDTH,
    configurable: true,
  });
  element.getBoundingClientRect = () =>
    makeRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  element.scrollTo = ((options: ScrollToOptions) => {
    if (typeof options.top === 'number') {
      scrollTop = options.top;
      scrollToCalls.push(options.top);
    }
  }) as unknown as typeof element.scrollTo;
  return { element, scrollToCalls };
};

// 中央ペイン要素のスタブです。10-G 以降、中央ペインは自身ではスクロールせず
// (scrollTop/Left は常に 0)、rect がスクロール量ぶん移動します(rect.top = -scrollTop)。
const makeBodyScroll = (container: HTMLElement) => {
  const element = document.createElement('div');
  element.getBoundingClientRect = () =>
    makeRect(0, -container.scrollTop, VIEWPORT_WIDTH, CONTENT_HEIGHT);
  return element;
};

// フック引数一式です(headerHeight=0 のため、ポインタ直下の行 = floor((clientY + scrollTop) / 10))。
const makeArgs = (params: {
  onGutterRowSelectDrag?: (viewIndex: number) => void;
}) => {
  const { element: scrollContainer, scrollToCalls } = makeScrollContainer();
  const bodyScroll = makeBodyScroll(scrollContainer);
  const pointerClientRef: RefObject<{ x: number; y: number } | null> = {
    current: null,
  };
  const autoScrollFrameRef: RefObject<number | null> = { current: null };
  const leftPaneScrollRef: RefObject<HTMLDivElement | null> = { current: null };
  const rightPaneScrollRef: RefObject<HTMLDivElement | null> = {
    current: null,
  };
  const args = {
    gridRootRef: { current: document.createElement('div') },
    bodyScrollRef: { current: bodyScroll },
    scrollContainerRef: { current: scrollContainer },
    leftPaneScrollRef,
    rightPaneScrollRef,
    pointerClientRef,
    autoScrollFrameRef,
    uiState: createInitialGridUiState(columns),
    dispatch: (() => {}) as Dispatch<GridUiAction>,
    enableRangeSelection: true,
    enableSorting: false,
    orderedColumns: columns,
    filteredRowsLength: ROW_COUNT,
    visibleColumnsLength: 1,
    paneLayout,
    leftLeadingWidth: 0,
    centerLeadingWidth: 0,
    rightLeadingWidth: 0,
    headerHeight: 0,
    rowMetrics: createUniformRowMetrics(ROW_COUNT, ROW_HEIGHT),
    verticalScaleFactor: 1,
    setHoveredRowIndex: () => {},
    setHoveredColumnIndex: () => {},
    enableRowHover: false,
    enableColumnHeaderHover: false,
    enableRowSelection: true,
    onGutterRowSelect: () => {},
    onGutterRowSelectDrag: params.onGutterRowSelectDrag ?? (() => {}),
  };
  return { args, scrollContainer, scrollToCalls };
};

// ガター(行ヘッダー)pointerdown の合成 React イベントです(ハンドラが読むフィールドのみ)。
const makeGutterPointerDown = (
  clientX: number,
  clientY: number,
): ReactPointerEvent<HTMLDivElement> =>
  ({
    button: 0,
    clientX,
    clientY,
    shiftKey: false,
    preventDefault: () => {},
  }) as unknown as ReactPointerEvent<HTMLDivElement>;

// window へ pointermove を dispatch します(フックの常設 window リスナーが
// pointerClientRef を更新します)。jsdom が init の座標を無視する場合に備え、
// own property で上書きします(13-B3-7 テストと同方針)。
const dispatchWindowPointerMove = (x: number, y: number) => {
  const event = new window.PointerEvent('pointermove', {
    bubbles: true,
    clientX: x,
    clientY: y,
  });
  if (event.clientX !== x) {
    Object.defineProperty(event, 'clientX', { value: x });
  }
  if (event.clientY !== y) {
    Object.defineProperty(event, 'clientY', { value: y });
  }
  window.dispatchEvent(event);
};

const dispatchWindowPointerUp = () => {
  window.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true }));
};

describe('ガター行選択ドラッグの端 auto-scroll(RS-AS)', () => {
  it('押しただけ(armed 前)では端帯内でもスクロールしない', () => {
    const { args, scrollContainer, scrollToCalls } = makeArgs({});
    const { result } = renderHook(() => useGridPointerInteractions<Row>(args));
    act(() => {
      result.current.handleRowHeaderPointerDown(
        9,
        makeGutterPointerDown(5, 95),
      );
    });
    act(() => {
      runFrame();
      runFrame();
      runFrame();
    });
    expect(scrollToCalls).toEqual([]);
    expect(scrollContainer.scrollTop).toBe(0);
  });

  it('armed 後は下端帯で縦スクロールし、ポインタ直下の行で選択を更新する', () => {
    const dragCalls: number[] = [];
    const { args, scrollContainer, scrollToCalls } = makeArgs({
      onGutterRowSelectDrag: (viewIndex) => {
        dragCalls.push(viewIndex);
      },
    });
    const { result } = renderHook(() => useGridPointerInteractions<Row>(args));
    act(() => {
      result.current.handleRowHeaderPointerDown(
        5,
        makeGutterPointerDown(5, 50),
      );
    });
    // 起点から 45px 下(下端帯 y=95)へ移動 → armed 化。
    act(() => {
      dispatchWindowPointerMove(5, 95);
    });
    act(() => {
      runFrame();
    });
    // 1 フレーム目: scrollTop 0 → 18。ポインタ直下の行 = floor((95 + 18) / 10) = 11。
    expect(scrollContainer.scrollTop).toBe(18);
    expect(dragCalls).toEqual([11]);
    act(() => {
      runFrame();
    });
    // 2 フレーム目: 18 → 36。行 = floor((95 + 36) / 10) = 13。
    expect(scrollContainer.scrollTop).toBe(36);
    expect(dragCalls).toEqual([11, 13]);
    expect(scrollToCalls).toEqual([18, 36]);
  });

  it('横端帯のみ(縦は帯外)では発動しない(縦のみ対象)', () => {
    const { args, scrollContainer, scrollToCalls } = makeArgs({});
    const { result } = renderHook(() => useGridPointerInteractions<Row>(args));
    act(() => {
      result.current.handleRowHeaderPointerDown(
        5,
        makeGutterPointerDown(5, 50),
      );
    });
    // 右端帯(x=195)へ移動(armed 化)。縦(y=50)は帯外です。
    act(() => {
      dispatchWindowPointerMove(195, 50);
    });
    act(() => {
      runFrame();
      runFrame();
    });
    expect(scrollToCalls).toEqual([]);
    expect(scrollContainer.scrollTop).toBe(0);
  });

  it('上端帯では [0, max] へ clamp し、端到達後は毎フレーム発火が止まる', () => {
    const dragCalls: number[] = [];
    const { args, scrollContainer, scrollToCalls } = makeArgs({
      onGutterRowSelectDrag: (viewIndex) => {
        dragCalls.push(viewIndex);
      },
    });
    scrollContainer.scrollTop = 10;
    const { result } = renderHook(() => useGridPointerInteractions<Row>(args));
    act(() => {
      result.current.handleRowHeaderPointerDown(
        5,
        makeGutterPointerDown(5, 50),
      );
    });
    // 上端帯(y=5)へ移動(armed 化)。
    act(() => {
      dispatchWindowPointerMove(5, 5);
    });
    act(() => {
      runFrame();
    });
    // 10 - 18 → 0 へ clamp。ポインタ直下の行 = floor((5 + 0) / 10) = 0。
    expect(scrollContainer.scrollTop).toBe(0);
    expect(dragCalls).toEqual([0]);
    act(() => {
      runFrame();
      runFrame();
    });
    // 端到達後は next === current のため scrollTo は増えません(clamp による完全停止)。
    expect(scrollToCalls).toEqual([0]);
  });

  it('pointerup 後の次フレームで自己停止する(ゾンビ化しない)', () => {
    const { args, scrollContainer } = makeArgs({});
    const { result } = renderHook(() => useGridPointerInteractions<Row>(args));
    act(() => {
      result.current.handleRowHeaderPointerDown(
        5,
        makeGutterPointerDown(5, 50),
      );
    });
    act(() => {
      dispatchWindowPointerMove(5, 95);
    });
    act(() => {
      runFrame();
    });
    expect(scrollContainer.scrollTop).toBe(18);
    // 離す → フラグ解除 → 次フレームの自己停止ガードでループ終了。
    act(() => {
      dispatchWindowPointerUp();
    });
    act(() => {
      runFrame();
    });
    expect(scrollContainer.scrollTop).toBe(18);
    // 以後のフレームは予約されません(rAF キューが空 = ループが畳まれた証拠)。
    expect(rafQueue.length).toBe(0);
  });
});