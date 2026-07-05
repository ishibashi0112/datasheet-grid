// 追加(POP-KEY)の回帰テスト: popover / panel の Escape close が「フォーカスがパネル内」
//   でも効くことを検証します。
//   背景: パネル root の keydown 遮断が capture 相(onKeyDownCapture)+ controller の
//   Escape close が window bubble 登録だったため、パネル内要素からの keydown はネイティブ
//   伝播が root で止まり window リスナーへ届かず、Escape で閉じられませんでした
//   (フォーカスがパネル外にある間だけ偶然動作)。POP-KEY で view 側は bubble 相遮断へ
//   統一(SF-ENTER fix と同一パターン)し、controller 側は capture 登録(window で最初に
//   走る = フォーカス位置に非依存)へ変更しています。
//   - 合成テスト: controller + view を実配線した最小ハーネス(props 最少の
//     CellContextMenu で代表)。修正前の実装では 1 件目が落ちます。
//   - 登録相テスト: 5 controller(FM-1 で FilterManagement を追加)の keydown 登録/解除が
//     capture(第 3 引数 true)で
//     あることを固定します(bubble へ戻すとパネル内フォーカス時の Escape が再び壊れます)。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  renderHook,
  act,
} from '@testing-library/react';
import { useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';

import { CellContextMenuPopover } from './CellContextMenuPopover';
import { useCellContextMenuController } from '../hooks/useCellContextMenuController';
import { useColumnMenuController } from '../hooks/useColumnMenuController';
import { useColumnChooserController } from '../hooks/useColumnChooserController';
import { useSortManagementController } from '../hooks/useSortManagementController';
// 追加(FM-1): フィルター管理パネル controller(POP-KEY 準拠 + 共存拡張)です。
import { useFilterManagementController } from '../hooks/useFilterManagementController';
import type {
  GridColumn,
  GridContextMenuItem,
  GridContextMenuParams,
} from '../model/gridTypes';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Row = { id: number };

const column: GridColumn<Row> = { key: 'id', title: 'ID', width: 100 };

const makeParams = (): GridContextMenuParams<Row> => ({
  target: {
    type: 'cell',
    rowIndex: 0,
    colIndex: 0,
    rowKey: 1,
    row: { id: 1 },
    column,
    value: 1,
  },
  clientX: 100,
  clientY: 100,
  selection: null,
  activeCell: null,
  isTargetSelected: false,
});

const menuItems: GridContextMenuItem[] = [
  { label: 'コピー', onSelect: () => {} },
];

const makeGridRootRef = (): RefObject<HTMLDivElement | null> => ({
  current: document.createElement('div'),
});

// controller + view を実配線した最小ハーネスです(SpreadsheetGrid の配線を最小再現)。
function ContextMenuHarness({
  onOuterKeyDown,
}: {
  onOuterKeyDown?: () => void;
}) {
  const gridRootRef = useRef<HTMLDivElement | null>(null);
  const controller = useCellContextMenuController<Row>({ gridRootRef });
  return (
    <div ref={gridRootRef} tabIndex={-1} onKeyDown={onOuterKeyDown}>
      <button
        type="button"
        onClick={() => controller.openContextMenu(makeParams(), menuItems)}
      >
        open
      </button>
      <CellContextMenuPopover
        isOpen={controller.isContextMenuOpen}
        items={controller.contextMenuState?.items ?? []}
        layout={controller.contextMenuLayout}
        popoverRef={controller.contextMenuRef}
        onRequestClose={controller.closeContextMenu}
      />
    </div>
  );
}

describe('POP-KEY: パネル内フォーカスでの Escape close(controller + view 合成)', () => {
  it('メニュー内要素への Escape keydown で閉じる', () => {
    render(<ContextMenuHarness />);
    fireEvent.click(screen.getByText('open'));
    expect(screen.getByRole('menu')).toBeTruthy();
    // パネル内の要素へ直接 keydown します(フォーカスがパネル内にある状況の再現)。
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('メニュー内の keydown は外側(React ツリー上の親)へ合成バブリングしない(遮断維持)', () => {
    const outerKeyDown = vi.fn();
    render(<ContextMenuHarness onOuterKeyDown={outerKeyDown} />);
    fireEvent.click(screen.getByText('open'));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'a' });
    expect(outerKeyDown).not.toHaveBeenCalled();
  });
});

describe('POP-KEY: 5 controller の keydown は capture 登録(第 3 引数 true)', () => {
  // 開時に登録される keydown リスナーが capture であること、unmount(close)時の解除も
  // capture 指定で対になっていること(不一致だと解除漏れになります)を固定します。
  const expectCaptureRegistration = (
    addSpy: { mock: { calls: Parameters<typeof window.addEventListener>[] } },
    removeSpy: {
      mock: { calls: Parameters<typeof window.removeEventListener>[] };
    },
    unmount: () => void,
  ) => {
    const added = addSpy.mock.calls.filter(([type]) => type === 'keydown');
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((call) => call[2] === true)).toBe(true);
    unmount();
    const removed = removeSpy.mock.calls.filter(
      ([type]) => type === 'keydown',
    );
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.every((call) => call[2] === true)).toBe(true);
  };

  it('useCellContextMenuController', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { result, unmount } = renderHook(() =>
      useCellContextMenuController<Row>({ gridRootRef: makeGridRootRef() }),
    );
    act(() => {
      result.current.openContextMenu(makeParams(), menuItems);
    });
    expectCaptureRegistration(addSpy, removeSpy, unmount);
  });

  it('useColumnMenuController', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { result, unmount } = renderHook(() =>
      useColumnMenuController<Row>({
        visibleColumns: [column],
        enableColumnMenu: true,
        gridRootRef: makeGridRootRef(),
      }),
    );
    const fakeContextMenuEvent = {
      preventDefault: () => {},
      stopPropagation: () => {},
      clientX: 100,
      clientY: 100,
    } as unknown as ReactMouseEvent<HTMLDivElement>;
    act(() => {
      result.current.openColumnMenuFromContextMenu(column, fakeContextMenuEvent);
    });
    expectCaptureRegistration(addSpy, removeSpy, unmount);
  });

  it('useColumnChooserController', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { result, unmount } = renderHook(() =>
      useColumnChooserController({
        enableColumnMenu: true,
        gridRootRef: makeGridRootRef(),
      }),
    );
    act(() => {
      result.current.openColumnChooser();
    });
    expectCaptureRegistration(addSpy, removeSpy, unmount);
  });

  it('useSortManagementController', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { result, unmount } = renderHook(() =>
      useSortManagementController({
        enableSorting: true,
        gridRootRef: makeGridRootRef(),
      }),
    );
    act(() => {
      result.current.openSortManager();
    });
    expectCaptureRegistration(addSpy, removeSpy, unmount);
  });

  it('useFilterManagementController', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { result, unmount } = renderHook(() =>
      useFilterManagementController({
        enableColumnFilter: true,
        gridRootRef: makeGridRootRef(),
      }),
    );
    act(() => {
      result.current.openFilterManager();
    });
    expectCaptureRegistration(addSpy, removeSpy, unmount);
  });
});

// 追加(FM-1): フィルター管理パネルとフィルター popover の「共存」拡張の挙動固定です。
//   - suppressEscape=true(popover open 中)の Escape はパネルを閉じず onSuppressedEscape
//     (popover close)へ委譲し、false へ戻った後の Escape でパネルが閉じること。
//   - alliedRef(popover)内の pointerdown では outside-close しないこと。
describe('FM-1: フィルター管理パネルとフィルター popover の共存', () => {
  it('suppressEscape=true の Escape は閉じずに委譲し、false 後の Escape で閉じる', () => {
    const onSuppressedEscape = vi.fn();
    const { result, rerender } = renderHook(
      ({ suppressEscape }: { suppressEscape: boolean }) =>
        useFilterManagementController({
          enableColumnFilter: true,
          gridRootRef: makeGridRootRef(),
          suppressEscape,
          onSuppressedEscape,
        }),
      { initialProps: { suppressEscape: true } },
    );
    act(() => {
      result.current.openFilterManager();
    });
    expect(result.current.isFilterManagerOpen).toBe(true);
    // popover open 中(抑止): パネルは閉じず、popover close(委譲先)が呼ばれます。
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.isFilterManagerOpen).toBe(true);
    expect(onSuppressedEscape).toHaveBeenCalledTimes(1);
    // popover が閉じた後(抑止解除): 次の Escape でパネルが閉じます。
    rerender({ suppressEscape: false });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.isFilterManagerOpen).toBe(false);
    expect(onSuppressedEscape).toHaveBeenCalledTimes(1);
  });

  it('alliedRef(popover)内の pointerdown では閉じず、外側の pointerdown で閉じる', () => {
    const allied = document.createElement('div');
    const alliedChild = document.createElement('button');
    allied.appendChild(alliedChild);
    document.body.appendChild(allied);
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    try {
      const { result } = renderHook(() =>
        useFilterManagementController({
          enableColumnFilter: true,
          gridRootRef: makeGridRootRef(),
          alliedRef: { current: allied },
        }),
      );
      act(() => {
        result.current.openFilterManager();
      });
      expect(result.current.isFilterManagerOpen).toBe(true);
      // allied(popover 相当)内の pointerdown → 閉じません。
      act(() => {
        alliedChild.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true }),
        );
      });
      expect(result.current.isFilterManagerOpen).toBe(true);
      // 外側の pointerdown → 閉じます。
      act(() => {
        outside.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true }),
        );
      });
      expect(result.current.isFilterManagerOpen).toBe(false);
    } finally {
      allied.remove();
      outside.remove();
    }
  });
});