// 追加(差し込み式 段階 2): 機能セットを外した / 1 つだけ入れた構成のシェルの結合テストです。全部入り(SpreadsheetGrid)の
//   テストだけだと、機能を外したときにだけ出る不具合(代役の取り違え / 静的 import の残り)を見逃すため、
//   createSpreadsheetGrid に機能セットを渡して確かめます。機能を移すたびにここへ足します。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { createSpreadsheetGrid } from './createSpreadsheetGrid';
import { findFeature } from './features/find';
import { fillHandleFeature } from './features/fillHandle';
import { columnReorderFeature } from './features/columnReorder';
import { rowDragFeature } from './features/rowDrag';
import { scrollHintFeature } from './features/scrollHint';
import { columnAutosizeFeature } from './features/columnAutosize';
import { installJsdomLayoutStubs } from './testing';
import { resetUnregisteredFeatureWarnings } from '@ishibashi0112/spreadsheet-grid-core/logic/featureWarnings';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from '@ishibashi0112/spreadsheet-grid-core/logic/rowReorder';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string };
const rows: Row[] = [
  { id: 1, name: 'alpha' },
  { id: 2, name: 'beta' },
];
const columns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 160 }];

const MinimalGrid = createSpreadsheetGrid({ features: {} });
const FindOnlyGrid = createSpreadsheetGrid({ features: { find: findFeature } });
const FillOnlyGrid = createSpreadsheetGrid({ features: { fillHandle: fillHandleFeature } });
const ColumnReorderOnlyGrid = createSpreadsheetGrid({ features: { columnReorder: columnReorderFeature } });
const RowDragOnlyGrid = createSpreadsheetGrid({ features: { rowDrag: rowDragFeature } });
const ScrollHintOnlyGrid = createSpreadsheetGrid({ features: { scrollHint: scrollHintFeature } });
const ColumnAutosizeOnlyGrid = createSpreadsheetGrid({ features: { columnAutosize: columnAutosizeFeature } });

let restore: () => void;
beforeAll(() => {
  restore = installJsdomLayoutStubs();
});
afterAll(() => {
  restore();
});
afterEach(() => {
  cleanup();
  resetUnregisteredFeatureWarnings();
  vi.restoreAllMocks();
});

const flushScan = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  });
};

describe('差し込み式: find', () => {
  it('機能セットに無ければ find を渡しても検索バーは出ず、Ctrl+F も横取りせず、開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onFindChange = vi.fn();
    const { container, rerender } = render(
      <MinimalGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} find onFindChange={onFindChange} />,
    );
    act(() => {
      ref.current?.openFind('alpha');
    });
    expect(container.querySelector('.ssg-find-bar')).toBeNull();
    const shell = container.querySelector('.ssg-shell') as HTMLElement;
    const notPrevented = fireEvent.keyDown(shell, { key: 'f', ctrlKey: true });
    expect(notPrevented).toBe(true);
    expect(container.querySelector('.ssg-find-bar')).toBeNull();
    expect(onFindChange).not.toHaveBeenCalled();
    // 警告は find の 1 回だけ(再描画しても繰り返さない)。
    rerender(<MinimalGrid ref={ref} rows={[...rows]} columns={columns} rowKeyGetter={(r) => r.id} find onFindChange={onFindChange} />);
    const findWarnings = warn.mock.calls.filter(([message]) => String(message).includes('`find`'));
    expect(findWarnings).toHaveLength(1);
  });

  it('find を使わなければ警告しない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<MinimalGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('find だけを入れた構成でも検索バーとヒットの強調が動く', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<FindOnlyGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} find />);
    act(() => {
      ref.current?.openFind('alp');
    });
    expect(container.querySelector('.ssg-find-bar')).not.toBeNull();
    await flushScan();
    expect(Array.from(container.querySelectorAll('.ssg-find-mark')).map((el) => el.textContent)).toEqual(['alp']);
  });
});

describe('差し込み式: fillHandle', () => {
  it('機能セットに無ければ fillHandle を渡してもハンドルは出ず、開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container, rerender } = render(
      <MinimalGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} onRowsChange={() => {}} fillHandle />,
    );
    act(() => {
      ref.current?.selectCell(0, 0);
    });
    expect(container.querySelector('.ssg-fill-handle')).toBeNull();
    expect(container.querySelector('.ssg-root--filling')).toBeNull();
    rerender(
      <MinimalGrid ref={ref} rows={[...rows]} columns={columns} rowKeyGetter={(r) => r.id} onRowsChange={() => {}} fillHandle />,
    );
    const fillWarnings = warn.mock.calls.filter(([message]) => String(message).includes('`fillHandle`'));
    expect(fillWarnings).toHaveLength(1);
  });

  it('fillHandle だけを入れた構成ではハンドルが出て、引くと埋まる', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onRowsChange = vi.fn<(next: Row[]) => void>();
    const { container } = render(
      <FillOnlyGrid
        ref={ref}
        rows={rows}
        columns={columns}
        rowKeyGetter={(r) => r.id}
        onRowsChange={onRowsChange}
        fillHandle
        rowHeight={30}
        headerHeight={40}
        rowHeaderWidth={56}
      />,
    );
    act(() => {
      ref.current?.selectCell(0, 0);
    });
    const handle = container.querySelector<HTMLElement>('.ssg-fill-handle');
    expect(handle).not.toBeNull();
    const dispatchPointer = (target: EventTarget, type: string, clientX: number, clientY: number) => {
      const event = new window.PointerEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY });
      if (event.pointerId !== 1) {
        Object.defineProperty(event, 'pointerId', { value: 1 });
      }
      act(() => {
        target.dispatchEvent(event);
      });
    };
    // 1 行目(名前列)から 2 行目まで引く(行 = (clientY - 40) / 30、列は行番号 56px の右から)。
    dispatchPointer(handle as HTMLElement, 'pointerdown', 0, 0);
    dispatchPointer(window, 'pointermove', 56 + 80, 40 + 30 + 15);
    expect(container.querySelector('.ssg-root--filling')).not.toBeNull();
    dispatchPointer(window, 'pointerup', 56 + 80, 40 + 30 + 15);
    expect(onRowsChange).toHaveBeenCalledTimes(1);
    expect(onRowsChange.mock.calls[0]?.[0].map((r) => r.name)).toEqual(['alpha', 'alpha']);
  });
});

describe('差し込み式: columnReorder', () => {
  it('機能セットに無ければ onColumnsChange があっても grip とドロップの縦線を出さない(警告もしない)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <MinimalGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} onColumnsChange={() => {}} />,
    );
    expect(container.querySelectorAll('.ssg-header-grip')).toHaveLength(0);
    expect(container.querySelectorAll('.ssg-col-drop-indicator')).toHaveLength(0);
    // 列メニュー(⋮)は従来どおり出る。
    expect(container.querySelectorAll('.ssg-header-actions .ssg-icon-btn').length).toBeGreaterThan(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('機能セットに無いのに columnDragMotion を渡すと開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <MinimalGrid
        rows={rows}
        columns={columns}
        rowKeyGetter={(r) => r.id}
        onColumnsChange={() => {}}
        columnDragMotion="live"
      />,
    );
    const warnings = warn.mock.calls.filter(([message]) => String(message).includes('`columnDragMotion`'));
    expect(warnings).toHaveLength(1);
  });

  it('columnReorder だけを入れた構成では grip と 3 ペインぶんのドロップの縦線が出る', () => {
    const { container } = render(
      <ColumnReorderOnlyGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} onColumnsChange={() => {}} />,
    );
    expect(container.querySelectorAll('.ssg-header-grip')).toHaveLength(columns.length);
    expect(container.querySelectorAll('.ssg-col-drop-indicator')).toHaveLength(3);
  });
});

describe('差し込み式: rowDrag', () => {
  it('機能セットに無ければ enableRowDrag を渡してもハンドル列とガイド線を出さず、開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <MinimalGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} onRowsChange={() => {}} enableRowDrag />,
    );
    expect(container.querySelectorAll('.ssg-row-drag-handle')).toHaveLength(0);
    expect(container.querySelectorAll('.ssg-row-drop-indicator')).toHaveLength(0);
    // ハンドル列(合成列)を作らない。
    expect(container.querySelector(`[data-ssg-col-key="${ROW_DRAG_HANDLE_COLUMN_KEY}"]`)).toBeNull();
    const warnings = warn.mock.calls.filter(([message]) => String(message).includes('`enableRowDrag`'));
    expect(warnings).toHaveLength(1);
  });

  it('rowDrag だけを入れた構成ではハンドルとガイド線が出て、moveRow で並べ替えられる', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onRowsChange = vi.fn<(next: Row[]) => void>();
    const { container } = render(
      <RowDragOnlyGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} onRowsChange={onRowsChange} enableRowDrag />,
    );
    expect(container.querySelector(`[data-ssg-col-key="${ROW_DRAG_HANDLE_COLUMN_KEY}"]`)).not.toBeNull();
    expect(container.querySelectorAll('.ssg-row-drag-handle')).toHaveLength(rows.length);
    expect(container.querySelectorAll('.ssg-row-drop-indicator').length).toBeGreaterThan(0);
    act(() => {
      ref.current?.moveRow(2, 0);
    });
    expect(onRowsChange.mock.calls[0]?.[0].map((r) => r.name)).toEqual(['beta', 'alpha']);
  });
});

describe('差し込み式: scrollHint', () => {
  it('機能セットに無ければ scrollHint を渡してもインジケーターを出さずネイティブのスクロールバーのまま、開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <MinimalGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} scrollHint={{ scrollbar: true }} />,
    );
    expect(container.querySelector('.ssg-scroll-hint')).toBeNull();
    expect(container.querySelector('.ssg-scroll-container--custom-scrollbar')).toBeNull();
    const warnings = warn.mock.calls.filter(([message]) => String(message).includes('`scrollHint`'));
    expect(warnings).toHaveLength(1);
  });

  it('scrollHint だけを入れた構成ではカスタムスクロールバーになる', () => {
    const { container } = render(
      <ScrollHintOnlyGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} scrollHint={{ scrollbar: true }} />,
    );
    expect(container.querySelector('.ssg-scroll-container--custom-scrollbar')).not.toBeNull();
  });
});

describe('差し込み式: columnAutosize', () => {
  const openColumnMenu = (container: HTMLElement) => {
    const menuButton = container.querySelector<HTMLElement>('[aria-label="列メニュー"]');
    if (!menuButton) throw new Error('列メニューのボタンがありません');
    act(() => {
      fireEvent.pointerDown(menuButton, { button: 0 });
    });
  };
  const menuLabels = () => Array.from(document.querySelectorAll('.ssg-menu-label')).map((el) => el.textContent);

  it('機能セットに無ければ列メニューに幅の自動調整を出さず、autoSizeColumns は開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <MinimalGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} autoSizeColumns="onMount" />,
    );
    openColumnMenu(container);
    expect(menuLabels().length).toBeGreaterThan(0);
    expect(menuLabels()).not.toContain('この列の幅を自動調整');
    expect(menuLabels()).not.toContain('すべての列の幅を自動調整');
    const warnings = warn.mock.calls.filter(([message]) => String(message).includes('`autoSizeColumns`'));
    expect(warnings).toHaveLength(1);
  });

  it('columnAutosize だけを入れた構成では列メニューに幅の自動調整が出る', () => {
    const { container } = render(<ColumnAutosizeOnlyGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />);
    openColumnMenu(container);
    expect(menuLabels()).toContain('この列の幅を自動調整');
    expect(menuLabels()).toContain('すべての列の幅を自動調整');
  });
});