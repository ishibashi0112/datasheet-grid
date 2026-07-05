// 追加(FM-4)の controller テスト: 3 パネル controller のドラッグ移動(moveXxx)の挙動固定です。
//   - move で layout が即時反映され、範囲外はビューポートへ clamp されること。
//   - ドラッグ後に close → 再 open で既定位置(gridRoot アンカー)へ戻ること(合意 d)。
//   - ドラッグ後の resize はビューポートへ再 clamp すること(gridRoot へは戻らない)。
//   - Sort / ColumnChooser も同型で move が効くこと(スモーク)。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';

import { useFilterManagementController } from './useFilterManagementController';
import { useSortManagementController } from './useSortManagementController';
import { useColumnChooserController } from './useColumnChooserController';

const makeGridRootRef = (): RefObject<HTMLDivElement | null> => ({
  current: document.createElement('div'),
});

describe('FM-4: パネルドラッグ(controller の move / clamp / リセット)', () => {
  it('moveFilterManager で layout が移動し、範囲外はビューポートへ clamp される', () => {
    const { result } = renderHook(() =>
      useFilterManagementController({
        enableColumnFilter: true,
        gridRootRef: makeGridRootRef(),
      }),
    );
    act(() => {
      result.current.openFilterManager();
    });
    act(() => {
      result.current.moveFilterManager(200, 300);
    });
    expect(result.current.filterManagerLayout).toEqual({
      top: 200,
      left: 300,
      width: 360,
    });
    // 範囲外(右下遠方)は clamp されます(左右: vw - 幅 - 8 / 上下: vh - 40)。
    act(() => {
      result.current.moveFilterManager(99999, 99999);
    });
    expect(result.current.filterManagerLayout).toEqual({
      top: window.innerHeight - 40,
      left: window.innerWidth - 360 - 8,
      width: 360,
    });
  });

  it('ドラッグ後に close → 再 open すると既定位置(gridRoot アンカー)へ戻る', () => {
    const gridRootRef = makeGridRootRef();
    const { result } = renderHook(() =>
      useFilterManagementController({
        enableColumnFilter: true,
        gridRootRef,
      }),
    );
    act(() => {
      result.current.openFilterManager();
    });
    const initial = result.current.filterManagerLayout;
    expect(initial).not.toBeNull();
    act(() => {
      result.current.moveFilterManager(200, 300);
    });
    expect(result.current.filterManagerLayout).not.toEqual(initial);
    act(() => {
      result.current.closeFilterManager();
    });
    act(() => {
      result.current.openFilterManager();
    });
    expect(result.current.filterManagerLayout).toEqual(initial);
  });

  it('ドラッグ後の resize はビューポートへ再 clamp する(gridRoot アンカーへは戻らない)', () => {
    const { result } = renderHook(() =>
      useFilterManagementController({
        enableColumnFilter: true,
        gridRootRef: makeGridRootRef(),
      }),
    );
    act(() => {
      result.current.openFilterManager();
    });
    act(() => {
      result.current.moveFilterManager(500, 600);
    });
    expect(result.current.filterManagerLayout).toEqual({
      top: 500,
      left: 600,
      width: 360,
    });
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    try {
      // jsdom の innerWidth / innerHeight を縮めて resize を発火します。
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          value: 500,
          configurable: true,
        });
        Object.defineProperty(window, 'innerHeight', {
          value: 400,
          configurable: true,
        });
        window.dispatchEvent(new Event('resize'));
      });
      expect(result.current.filterManagerLayout).toEqual({
        top: 400 - 40,
        left: 500 - 360 - 8,
        width: 360,
      });
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        value: originalWidth,
        configurable: true,
      });
      Object.defineProperty(window, 'innerHeight', {
        value: originalHeight,
        configurable: true,
      });
    }
  });

  it('moveSortManager / moveColumnChooser も同様に layout へ反映する(スモーク)', () => {
    const sort = renderHook(() =>
      useSortManagementController({
        enableSorting: true,
        gridRootRef: makeGridRootRef(),
      }),
    );
    act(() => {
      sort.result.current.openSortManager();
    });
    act(() => {
      sort.result.current.moveSortManager(150, 250);
    });
    expect(sort.result.current.sortManagerLayout).toEqual({
      top: 150,
      left: 250,
      width: 320,
    });

    const chooser = renderHook(() =>
      useColumnChooserController({
        enableColumnMenu: true,
        gridRootRef: makeGridRootRef(),
      }),
    );
    act(() => {
      chooser.result.current.openColumnChooser();
    });
    act(() => {
      chooser.result.current.moveColumnChooser(160, 260);
    });
    expect(chooser.result.current.columnChooserLayout).toEqual({
      top: 160,
      left: 260,
      width: 280,
    });
  });
});