// 修正(13-B3-7)の回帰テスト: 列 D&D の move/up/cancel リスナーが「window 登録」であることを
//   検証します。背景: 旧実装(13-B3-3)はグリップ要素直付けだったため、autoscroll で掴んだ列が
//   仮想化ウィンドウ外へ出てグリップが unmount すると(capture は暗黙解除・lostpointercapture
//   は document 発火)、以後の pointerup が届かず endDrag 不達 → rAF ループがゾンビ化して
//   「離した後も端方向へスクロールし続ける / ガイド線が残る」不具合になっていました。
//   jsdom では列仮想化が 0 列を描画しグリップ自体が出ないため、グリッド render 経由ではなく
//   renderHook でコントローラを直接検証します。「document ツリー外(= unmount 相当)のグリップで
//   pointerdown → window へ pointerup を dispatch → endDrag 到達(body cursor 復帰)」が本命の
//   回帰観点で、旧実装ではこのテストは落ちます(要素直付けでは window 直 dispatch を受けられない)。
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { useColumnHeaderDragController } from './useColumnHeaderDragController';
import type { GridColumn } from '../model/gridTypes';
import type { GridPaneLayout, PaneGeometry } from '../logic/geometry';

afterEach(() => {
  cleanup();
  document.body.style.cursor = '';
});

type Row = { id: number; name: string };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 160 },
];

// 空ペイン geometry(当たり判定は「枠外 → hit なし」経路に入るだけなので entries は不要です)。
const emptyPane = (pane: 'left' | 'center' | 'right'): PaneGeometry<Row> => ({
  pane,
  entries: [],
  totalWidth: 0,
});

const paneLayout: GridPaneLayout<Row> = {
  left: emptyPane('left'),
  center: emptyPane('center'),
  right: emptyPane('right'),
};

// フック引数(refs はテストごとに新規要素を割り当てます)。
const makeArgs = () => ({
  enabled: true,
  columns,
  paneLayout,
  leftPaneScrollRef: { current: document.createElement('div') },
  rightPaneScrollRef: { current: document.createElement('div') },
  bodyScrollRef: { current: document.createElement('div') },
  scrollContainerRef: { current: document.createElement('div') },
  leftLeadingWidth: 0,
  centerLeadingWidth: 0,
  rightLeadingWidth: 0,
  applyColumnOrderAndPin: () => {},
});

// グリップ pointerdown の合成 React イベントです。ハンドラが読むフィールドのみ用意します。
//   grip は意図的に document へ append しません(仮想化 unmount 後と同じ「ツリー外」状態)。
const makeGripPointerDownEvent = (
  grip: HTMLElement,
  pointerId: number,
): ReactPointerEvent<HTMLElement> =>
  ({
    button: 0,
    pointerId,
    clientX: 100,
    clientY: 10,
    currentTarget: grip,
    preventDefault: () => {},
    stopPropagation: () => {},
  }) as unknown as ReactPointerEvent<HTMLElement>;

// window へ PointerEvent を dispatch します。jsdom が init の pointerId を無視する版でも
//   動くよう、反映されなかった場合は own property で上書きします。
const dispatchWindowPointerEvent = (type: string, pointerId: number) => {
  const ev = new window.PointerEvent(type, { pointerId, bubbles: true });
  if (ev.pointerId !== pointerId) {
    Object.defineProperty(ev, 'pointerId', { value: pointerId });
  }
  window.dispatchEvent(ev);
};

describe('useColumnHeaderDragController 後始末(13-B3-7)', () => {
  it('グリップが document 外(unmount 相当)でも window の pointerup でドラッグが終了する', () => {
    const { result } = renderHook(() =>
      useColumnHeaderDragController<Row>(makeArgs()),
    );
    const grip = document.createElement('span');

    act(() => {
      result.current.onColumnDragHandlePointerDown(
        columns[0],
        makeGripPointerDownEvent(grip, 1),
      );
    });
    expect(document.body.style.cursor).toBe('grabbing');

    act(() => {
      dispatchWindowPointerEvent('pointerup', 1);
    });
    // endDrag 到達 = body cursor 復帰(旧実装ではグリップ直付けのため届かず 'grabbing' のまま)。
    expect(document.body.style.cursor).toBe('');
  });

  it('別 pointerId の pointerup では終了しない(pointerId フィルタ)', () => {
    const { result } = renderHook(() =>
      useColumnHeaderDragController<Row>(makeArgs()),
    );
    const grip = document.createElement('span');

    act(() => {
      result.current.onColumnDragHandlePointerDown(
        columns[0],
        makeGripPointerDownEvent(grip, 1),
      );
    });
    expect(document.body.style.cursor).toBe('grabbing');

    act(() => {
      dispatchWindowPointerEvent('pointerup', 2);
    });
    expect(document.body.style.cursor).toBe('grabbing');

    act(() => {
      dispatchWindowPointerEvent('pointerup', 1);
    });
    expect(document.body.style.cursor).toBe('');
  });

  it('window の pointercancel でもドラッグが終了する', () => {
    const { result } = renderHook(() =>
      useColumnHeaderDragController<Row>(makeArgs()),
    );
    const grip = document.createElement('span');

    act(() => {
      result.current.onColumnDragHandlePointerDown(
        columns[0],
        makeGripPointerDownEvent(grip, 1),
      );
    });
    expect(document.body.style.cursor).toBe('grabbing');

    act(() => {
      dispatchWindowPointerEvent('pointercancel', 1);
    });
    expect(document.body.style.cursor).toBe('');
  });

  it('ドラッグ中にコントローラが unmount しても後始末される(最終ネット + window リスナー解除)', () => {
    const { result, unmount } = renderHook(() =>
      useColumnHeaderDragController<Row>(makeArgs()),
    );
    const grip = document.createElement('span');

    act(() => {
      result.current.onColumnDragHandlePointerDown(
        columns[0],
        makeGripPointerDownEvent(grip, 1),
      );
    });
    expect(document.body.style.cursor).toBe('grabbing');

    unmount();
    // 最終後始末ネットが cursor を復帰し、activeDragDisposeRef 経由で window リスナーも
    //   解除されます(以後の pointerup が何も起こさないことも確認)。
    expect(document.body.style.cursor).toBe('');
    act(() => {
      dispatchWindowPointerEvent('pointerup', 1);
    });
    expect(document.body.style.cursor).toBe('');
  });
});