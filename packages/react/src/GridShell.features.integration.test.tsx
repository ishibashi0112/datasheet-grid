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
import { columnMenuFeature } from './features/columnMenu';
import { toolPanelFeature } from './features/toolPanel';
import { totalRowFeature } from './features/totalRow';
import { imeDirectInputFeature } from './features/imeDirectInput';
import { contextMenuFeature } from './features/contextMenu';
import { conditionalFormatFeature } from './features/conditionalFormat';
import { selectionAggregatesFeature } from './features/selectionAggregates';
import { motionExtrasFeature } from './features/motionExtras';
import { exportFeature } from './features/export';
import { autoHeightFeature } from './features/autoHeight';
import { filteringFeature } from './features/filtering';
import { serverSideFeature } from './features/serverSide';
import { installJsdomLayoutStubs } from './testing';
import { resetUnregisteredFeatureWarnings } from '@ishibashi0112/spreadsheet-grid-core/logic/featureWarnings';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from '@ishibashi0112/spreadsheet-grid-core/logic/rowReorder';
import { GRID_STATE_VERSION } from '@ishibashi0112/spreadsheet-grid-core/logic/gridState';
import type { GridColumn, ServerSideDataSource, SpreadsheetGridHandle } from './model/gridTypes';

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
// 列幅の自動調整の項目は列メニューに出るため、列メニューと組み合わせて確かめます。
const ColumnMenuOnlyGrid = createSpreadsheetGrid({ features: { columnMenu: columnMenuFeature } });
// ツールパネルを開く入口の多くは列メニューにあるため、列メニューと組み合わせて確かめます。Filters チップとフィルター
//   タブは列フィルターがあるときだけ出るため、フィルターの機能も入れます。
const ToolPanelFilteringGrid = createSpreadsheetGrid({ features: { toolPanel: toolPanelFeature, filtering: filteringFeature } });
const ColumnMenuToolPanelGrid = createSpreadsheetGrid({
  features: { columnMenu: columnMenuFeature, toolPanel: toolPanelFeature, filtering: filteringFeature },
});
const ColumnMenuAutosizeGrid = createSpreadsheetGrid({
  features: { columnMenu: columnMenuFeature, columnAutosize: columnAutosizeFeature },
});
const TotalRowOnlyGrid = createSpreadsheetGrid({ features: { totalRow: totalRowFeature } });
const ImeOnlyGrid = createSpreadsheetGrid({ features: { imeDirectInput: imeDirectInputFeature } });
const ContextMenuOnlyGrid = createSpreadsheetGrid({ features: { contextMenu: contextMenuFeature } });
const ConditionalFormatOnlyGrid = createSpreadsheetGrid({ features: { conditionalFormat: conditionalFormatFeature } });
const SelectionAggregatesOnlyGrid = createSpreadsheetGrid({ features: { selectionAggregates: selectionAggregatesFeature } });
const MotionExtrasOnlyGrid = createSpreadsheetGrid({ features: { motionExtras: motionExtrasFeature } });
const ExportOnlyGrid = createSpreadsheetGrid({ features: { export: exportFeature } });
const AutoHeightOnlyGrid = createSpreadsheetGrid({ features: { autoHeight: autoHeightFeature } });
const FilteringOnlyGrid = createSpreadsheetGrid({ features: { filtering: filteringFeature } });
const ServerSideOnlyGrid = createSpreadsheetGrid({ features: { serverSide: serverSideFeature } });
// 列フィルターを開く入口(「フィルター…」)は列メニューにあるため、列メニューと組み合わせて確かめます。
const ColumnMenuFilteringGrid = createSpreadsheetGrid({ features: { columnMenu: columnMenuFeature, filtering: filteringFeature } });

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
      <ColumnMenuOnlyGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} onColumnsChange={() => {}} />,
    );
    expect(container.querySelectorAll('.ssg-header-grip')).toHaveLength(0);
    expect(container.querySelectorAll('.ssg-col-drop-indicator')).toHaveLength(0);
    // 列メニュー(⋮)は列メニューの機能があれば従来どおり出る(ヘッダーの操作ボタンの並びは崩れない)。
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
      <ColumnMenuOnlyGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} autoSizeColumns="onMount" />,
    );
    openColumnMenu(container);
    expect(menuLabels().length).toBeGreaterThan(0);
    expect(menuLabels()).not.toContain('この列の幅を自動調整');
    expect(menuLabels()).not.toContain('すべての列の幅を自動調整');
    const warnings = warn.mock.calls.filter(([message]) => String(message).includes('`autoSizeColumns`'));
    expect(warnings).toHaveLength(1);
  });

  it('columnAutosize を入れた構成では列メニューに幅の自動調整が出る', () => {
    const { container } = render(<ColumnMenuAutosizeGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />);
    openColumnMenu(container);
    expect(menuLabels()).toContain('この列の幅を自動調整');
    expect(menuLabels()).toContain('すべての列の幅を自動調整');
  });
});

describe('差し込み式: columnMenu', () => {
  const headerCell = (container: HTMLElement) => container.querySelector('.ssg-header-cell[data-ssg-col-key="name"]') as HTMLElement;
  const menuButton = (container: HTMLElement) => container.querySelector<HTMLElement>('[aria-label="列メニュー"]');

  it('機能セットに無ければ ⋮ ボタンを出さず、ヘッダーの右クリックはブラウザ標準のメニューのまま、明示した enableColumnMenu だけ開発時に 1 回警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<MinimalGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} enableColumnMenu />);
    expect(menuButton(container)).toBeNull();
    // 既定の動作を止めない = ブラウザ標準のメニューが出る。
    expect(fireEvent.contextMenu(headerCell(container), { clientX: 10, clientY: 10 })).toBe(true);
    expect(document.querySelector('.ssg-menu-label')).toBeNull();
    const warnings = warn.mock.calls.filter(([message]) => String(message).includes('`enableColumnMenu`'));
    expect(warnings).toHaveLength(1);
  });

  it('既定(enableColumnMenu 省略 = true)のままなら警告しない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<MinimalGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('columnMenu だけを入れた構成では ⋮ ボタンとヘッダーの右クリックで列メニューが開く', () => {
    const { container } = render(<ColumnMenuOnlyGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />);
    const button = menuButton(container);
    expect(button).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(button as HTMLElement, { button: 0 });
    });
    expect(document.querySelectorAll('.ssg-menu-label').length).toBeGreaterThan(0);
    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });
    expect(fireEvent.contextMenu(headerCell(container), { clientX: 10, clientY: 10 })).toBe(false);
    expect(document.querySelectorAll('.ssg-menu-label').length).toBeGreaterThan(0);
  });
});

describe('差し込み式: toolPanel', () => {
  const filterColumns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 160, filterType: 'text' }];
  const openColumnMenu = (container: HTMLElement) => {
    const menuButton = container.querySelector<HTMLElement>('[aria-label="列メニュー"]');
    if (!menuButton) throw new Error('列メニューのボタンがありません');
    act(() => {
      fireEvent.pointerDown(menuButton, { button: 0 });
    });
  };
  const menuLabels = () => Array.from(document.querySelectorAll('.ssg-menu-label')).map((el) => el.textContent);
  const panelOpen = () => document.querySelector('.ssg-toolpanel-seg') !== null;

  it('機能セットに無ければパネルを開く入口(列メニューの 3 項目 / Filters チップ)を出さず、openFilterManager は開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    // フィルターは入れておく(フィルターが無いと列フィルターごと切れるため、ツールパネルの有無を見られない)。
    const { container } = render(
      <ColumnMenuFilteringGrid ref={ref} rows={rows} columns={filterColumns} rowKeyGetter={(r) => r.id} onColumnsChange={() => {}} />,
    );
    expect(container.querySelector('[aria-label="フィルター管理パネルを開閉"]')).toBeNull();
    openColumnMenu(container);
    expect(menuLabels()).toContain('昇順で並び替え');
    expect(menuLabels()).toContain('列のリセット');
    expect(menuLabels()).not.toContain('並び替えを管理…');
    expect(menuLabels()).not.toContain('フィルターを管理…');
    expect(menuLabels()).not.toContain('列の表示');
    act(() => {
      ref.current?.openFilterManager();
      ref.current?.openFilterManager();
    });
    expect(panelOpen()).toBe(false);
    const warnings = warn.mock.calls.filter(([message]) => String(message).includes('`openFilterManager()`'));
    expect(warnings).toHaveLength(1);
  });

  it('toolPanel を入れた構成では列メニューの 3 項目と Filters チップが出て、openFilterManager でパネルが開く', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <ColumnMenuToolPanelGrid ref={ref} rows={rows} columns={filterColumns} rowKeyGetter={(r) => r.id} onColumnsChange={() => {}} />,
    );
    expect(container.querySelector('[aria-label="フィルター管理パネルを開閉"]')).not.toBeNull();
    openColumnMenu(container);
    expect(menuLabels()).toContain('並び替えを管理…');
    expect(menuLabels()).toContain('フィルターを管理…');
    expect(menuLabels()).toContain('列の表示');
    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });
    act(() => {
      ref.current?.openFilterManager();
    });
    expect(panelOpen()).toBe(true);
  });

  it('列メニューの無い構成(ツールパネル + フィルター)でも Filters チップでパネルが開き、enableColumnMenu は「列」タブの有無に効く(警告しない)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tabLabels = () => Array.from(document.querySelectorAll('[role="tab"]')).map((el) => el.textContent);
    const view = render(
      <ToolPanelFilteringGrid rows={rows} columns={filterColumns} rowKeyGetter={(r) => r.id} enableColumnMenu onColumnsChange={() => {}} />,
    );
    // 列メニューの機能は無いので ⋮ ボタンは出ない。
    expect(view.container.querySelector('[aria-label="列メニュー"]')).toBeNull();
    const chip = view.container.querySelector<HTMLElement>('[aria-label="フィルター管理パネルを開閉"]');
    expect(chip).not.toBeNull();
    act(() => {
      chip?.click();
    });
    expect(panelOpen()).toBe(true);
    expect(tabLabels().includes('列')).toBe(true);
    view.unmount();
    render(
      <ToolPanelFilteringGrid
        rows={rows}
        columns={filterColumns}
        rowKeyGetter={(r) => r.id}
        enableColumnMenu={false}
        onColumnsChange={() => {}}
      />,
    );
    const chip2 = document.querySelector<HTMLElement>('[aria-label="フィルター管理パネルを開閉"]');
    act(() => {
      chip2?.click();
    });
    expect(panelOpen()).toBe(true);
    expect(tabLabels().includes('列')).toBe(false);
    expect(warn.mock.calls.filter(([message]) => String(message).includes('`enableColumnMenu`'))).toHaveLength(0);
  });
});

describe('差し込み式: totalRow', () => {
  type Sales = { id: number; name: string; qty: number };
  const salesRows: Sales[] = [
    { id: 1, name: 'alpha', qty: 2 },
    { id: 2, name: 'beta', qty: 3 },
  ];
  const salesColumns: GridColumn<Sales>[] = [
    { key: 'name', title: '名前', width: 160 },
    { key: 'qty', title: '数量', width: 100, aggFunc: 'sum' },
  ];
  const MinimalSalesGrid = createSpreadsheetGrid({ features: {} });

  it('機能セットに無ければ totalRow を渡しても合計行を出さず、開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <MinimalSalesGrid rows={salesRows} columns={salesColumns} rowKeyGetter={(r) => r.id} totalRow />,
    );
    expect(container.querySelector('.ssg-total-row')).toBeNull();
    const warnings = warn.mock.calls.filter(([message]) => String(message).includes('`totalRow`'));
    expect(warnings).toHaveLength(1);
  });

  it('totalRow だけを入れた構成では合計行が出て集計される', () => {
    const { container } = render(
      <TotalRowOnlyGrid rows={salesRows} columns={salesColumns} rowKeyGetter={(r) => r.id} totalRow />,
    );
    expect(container.querySelector('.ssg-total-row')).not.toBeNull();
    expect(Array.from(container.querySelectorAll('.ssg-total-value')).map((el) => el.textContent)).toContain('5');
  });
});

describe('差し込み式: imeDirectInput', () => {
  it('機能セットに無ければ imeDirectInput を渡しても入力受けを描画せず、開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <MinimalGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} onRowsChange={() => {}} imeDirectInput />,
    );
    expect(container.querySelector('.ssg-ime-input')).toBeNull();
    const warnings = warn.mock.calls.filter(([message]) => String(message).includes('`imeDirectInput`'));
    expect(warnings).toHaveLength(1);
  });

  it('imeDirectInput だけを入れた構成では入力受けが描画される', () => {
    const { container } = render(
      <ImeOnlyGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} onRowsChange={() => {}} imeDirectInput />,
    );
    expect(container.querySelector('.ssg-ime-input')).not.toBeNull();
  });
});

describe('差し込み式: contextMenu', () => {
  const contextMenuItems = () => [{ kind: 'action' as const, key: 'copy', label: 'コピーする', onSelect: () => {} }];
  const bodyCell = (container: HTMLElement) =>
    container.querySelector('[data-row-index="0"] [data-ssg-col-key="name"]') as HTMLElement;

  it('機能セットに無ければ右クリックはブラウザ標準のメニューのまま(独自メニューを出さない)で、開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onContextMenuOpen = vi.fn();
    const { container } = render(
      <MinimalGrid
        rows={rows}
        columns={columns}
        rowKeyGetter={(r) => r.id}
        enableContextMenu
        getContextMenuItems={contextMenuItems}
        onContextMenuOpen={onContextMenuOpen}
      />,
    );
    // 既定の動作を止めない = ブラウザ標準のメニューが出る。
    expect(fireEvent.contextMenu(bodyCell(container), { clientX: 10, clientY: 10 })).toBe(true);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(onContextMenuOpen).not.toHaveBeenCalled();
    const warnings = warn.mock.calls.filter(([message]) => String(message).includes('`enableContextMenu`'));
    expect(warnings).toHaveLength(1);
  });

  it('contextMenu だけを入れた構成では右クリックで独自メニューが開き、対象のセルが渡る', () => {
    const onContextMenuOpen = vi.fn();
    const { container } = render(
      <ContextMenuOnlyGrid
        rows={rows}
        columns={columns}
        rowKeyGetter={(r) => r.id}
        enableContextMenu
        getContextMenuItems={contextMenuItems}
        onContextMenuOpen={onContextMenuOpen}
      />,
    );
    expect(fireEvent.contextMenu(bodyCell(container), { clientX: 10, clientY: 10 })).toBe(false);
    expect(document.querySelector('[role="menu"]')?.textContent).toContain('コピーする');
    expect(onContextMenuOpen).toHaveBeenCalledTimes(1);
    expect(onContextMenuOpen.mock.calls[0]?.[0].target).toMatchObject({ type: 'cell', rowIndex: 0, colIndex: 0, value: 'alpha' });
  });
});

describe('差し込み式: conditionalFormat', () => {
  type Task = { id: number; status: string; qty: number; score: number };
  const taskRows: Task[] = [
    { id: 1, status: 'done', qty: 2, score: 10 },
    { id: 2, status: 'todo', qty: 8, score: 30 },
  ];
  const taskColumns: GridColumn<Task>[] = [
    { key: 'status', title: '状態', width: 120, conditionalFormat: { chips: { done: { tone: 'good', label: '完了' } } } },
    { key: 'qty', title: '数量', width: 100, conditionalFormat: { dataBar: { showValue: false } } },
    { key: 'score', title: '点数', width: 100, conditionalFormat: { colorScale: {} } },
  ];
  const cellOf = (container: HTMLElement, rowIndex: number, key: string) =>
    container.querySelector(`[data-row-index="${rowIndex}"] [data-ssg-col-key="${key}"]`) as HTMLElement;

  it('機能セットに無ければ conditionalFormat を指定した列も素の表示で(帯 / 背景色 / チップなし、値は出す)、開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<MinimalGrid rows={taskRows} columns={taskColumns} rowKeyGetter={(r) => r.id} />);
    expect(container.querySelector('.ssg-body-cell--cf-bar, .ssg-body-cell--cf-scale, .ssg-cf-bar, .ssg-chip')).toBeNull();
    expect(cellOf(container, 0, 'status').textContent).toBe('done');
    // showValue: false も無視する(帯が無いのに値まで消さない)。
    expect(cellOf(container, 1, 'qty').textContent).toBe('8');
    const warnings = warn.mock.calls.filter(([message]) => String(message).includes('`columns[].conditionalFormat`'));
    expect(warnings).toHaveLength(1);
  });

  it('conditionalFormat だけを入れた構成ではデータバー / カラースケール / チップが出る', () => {
    const { container } = render(
      <ConditionalFormatOnlyGrid rows={taskRows} columns={taskColumns} rowKeyGetter={(r) => r.id} />,
    );
    expect(cellOf(container, 1, 'qty').classList.contains('ssg-body-cell--cf-bar')).toBe(true);
    expect(cellOf(container, 1, 'qty').textContent).toBe('');
    expect(cellOf(container, 1, 'score').classList.contains('ssg-body-cell--cf-scale')).toBe(true);
    expect(cellOf(container, 0, 'status').querySelector('.ssg-chip')?.textContent).toContain('完了');
  });
});

describe('差し込み式: selectionAggregates', () => {
  type Sales = { id: number; qty: number };
  const salesRows: Sales[] = [
    { id: 1, qty: 2 },
    { id: 2, qty: 3 },
  ];
  const salesColumns: GridColumn<Sales>[] = [{ key: 'qty', title: '数量', width: 100 }];
  const aggregateTexts = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('.ssg-bar-aggregates .ssg-bar-chip')).map((chip) => chip.textContent);

  it('機能セットに無ければ範囲を選んでも集計を出さず(slot context も null)、明示した showSelectionAggregates だけ開発時に 1 回警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ref = createRef<SpreadsheetGridHandle<Sales>>();
    const seen: unknown[] = [];
    const { container, rerender } = render(
      <MinimalGrid ref={ref} rows={salesRows} columns={salesColumns} rowKeyGetter={(r) => r.id} />,
    );
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 0 } });
    });
    expect(container.querySelector('.ssg-bar-aggregates')).toBeNull();
    // 既定(省略)は true なので、省略しただけでは警告しない。
    expect(warn.mock.calls.filter(([message]) => String(message).includes('`showSelectionAggregates`'))).toHaveLength(0);
    rerender(
      <MinimalGrid
        ref={ref}
        rows={salesRows}
        columns={salesColumns}
        rowKeyGetter={(r) => r.id}
        showSelectionAggregates
        renderBottomBar={(context) => {
          seen.push(context.selectionAggregates);
          return null;
        }}
      />,
    );
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((value) => value === null)).toBe(true);
    expect(warn.mock.calls.filter(([message]) => String(message).includes('`showSelectionAggregates`'))).toHaveLength(1);
  });

  it('selectionAggregates だけを入れた構成では下部バーに集計が出る', () => {
    const ref = createRef<SpreadsheetGridHandle<Sales>>();
    const { container } = render(
      <SelectionAggregatesOnlyGrid ref={ref} rows={salesRows} columns={salesColumns} rowKeyGetter={(r) => r.id} />,
    );
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 0 } });
    });
    expect(aggregateTexts(container)).toEqual(['平均:2.5', 'データの個数:2', '合計:5']);
  });
});

describe('差し込み式: motionExtras', () => {
  type Sales = { id: number; name: string; qty: number };
  const salesRows: Sales[] = [
    { id: 1, name: 'alpha', qty: 5 },
    { id: 2, name: 'beta', qty: 12 },
  ];
  const salesColumns: GridColumn<Sales>[] = [
    { key: 'name', title: '名前', width: 160 },
    { key: 'qty', title: '数量', width: 100 },
  ];
  const changedRows = salesRows.map((r) => (r.id === 2 ? { ...r, qty: 20 } : r));
  const bodyCellOf = (container: HTMLElement, rowIndex: number, key: string) =>
    container.querySelector(`.ssg-body-row[data-row-index="${rowIndex}"] [data-ssg-col-key="${key}"]`) as HTMLElement;
  const copyRange = async (container: HTMLElement, ref: React.RefObject<SpreadsheetGridHandle<Sales> | null>) => {
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
    });
    await act(async () => {
      fireEvent.keyDown(container.querySelector('.ssg-shell') as HTMLElement, { key: 'c', ctrlKey: true });
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  let writeText: ReturnType<typeof vi.fn>;
  beforeAll(() => {
    writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  it('機能セットに無ければ変更セルの強調 / コピー範囲の点線 / クロスヘアを出さず、明示した prop だけ開発時に 1 回ずつ警告する', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ref = createRef<SpreadsheetGridHandle<Sales>>();
    const props = { columns: salesColumns, rowKeyGetter: (r: Sales) => r.id, highlightChanges: true, showCopyRange: true };
    const { container, rerender } = render(
      <MinimalGrid ref={ref} rows={salesRows} hoverHighlight="cross" {...props} />,
    );
    rerender(<MinimalGrid ref={ref} rows={changedRows} hoverHighlight="cross" {...props} />);
    expect(container.querySelector('.ssg-body-cell--changed')).toBeNull();
    expect(container.querySelector('.ssg-root')?.classList.contains('ssg-root--hover-cross')).toBe(false);
    fireEvent.pointerEnter(bodyCellOf(container, 1, 'qty'));
    expect(container.querySelector('.ssg-col-hover-overlay')).toBeNull();
    await copyRange(container, ref);
    expect(writeText).toHaveBeenCalled();
    expect(document.querySelector('.ssg-copy-range-overlay')).toBeNull();
    for (const prop of ['highlightChanges', 'showCopyRange', 'hoverHighlight']) {
      expect(warn.mock.calls.filter(([message]) => String(message).includes(`\`${prop}\``))).toHaveLength(1);
    }
  });

  it('既定(showCopyRange 省略 = true)のままなら警告しない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<MinimalGrid rows={salesRows} columns={salesColumns} rowKeyGetter={(r) => r.id} />);
    expect(warn.mock.calls.filter(([message]) => String(message).includes('spreadsheet-grid'))).toHaveLength(0);
  });

  it('motionExtras だけを入れた構成では 3 つとも動く', async () => {
    const ref = createRef<SpreadsheetGridHandle<Sales>>();
    const props = { columns: salesColumns, rowKeyGetter: (r: Sales) => r.id, highlightChanges: true };
    const { container, rerender } = render(
      <MotionExtrasOnlyGrid ref={ref} rows={salesRows} hoverHighlight="cross" {...props} />,
    );
    rerender(<MotionExtrasOnlyGrid ref={ref} rows={changedRows} hoverHighlight="cross" {...props} />);
    expect(bodyCellOf(container, 1, 'qty').classList.contains('ssg-body-cell--changed')).toBe(true);
    expect(container.querySelector('.ssg-root')?.classList.contains('ssg-root--hover-cross')).toBe(true);
    fireEvent.pointerEnter(bodyCellOf(container, 1, 'qty'));
    expect(container.querySelector('.ssg-col-hover-overlay')).not.toBeNull();
    await copyRange(container, ref);
    expect(document.querySelectorAll('.ssg-copy-range-overlay').length).toBeGreaterThan(0);
  });
});

describe('差し込み式: export', () => {
  it('機能セットに無ければ exportCsv / getExportData は空を返し、呼ぶと開発時にメソッドごと 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<MinimalGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />);
    // 描画しただけでは警告しない(メソッドを呼んだときだけ)。
    expect(warn.mock.calls.filter(([message]) => String(message).includes('spreadsheet-grid'))).toHaveLength(0);
    expect(ref.current?.exportCsv()).toBe('');
    expect(ref.current?.exportCsv()).toBe('');
    expect(ref.current?.getExportData()).toEqual({ columns: [], rows: [] });
    expect(warn.mock.calls.filter(([message]) => String(message).includes('`exportCsv()`'))).toHaveLength(1);
    expect(warn.mock.calls.filter(([message]) => String(message).includes('`getExportData()`'))).toHaveLength(1);
  });

  it('export だけを入れた構成では CSV と整形済みデータが出る', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<ExportOnlyGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />);
    expect(ref.current?.exportCsv()).toBe('名前\r\nalpha\r\nbeta');
    expect(ref.current?.getExportData().rows.map((cells) => cells.map((cell) => cell.value))).toEqual([['alpha'], ['beta']]);
  });
});

describe('差し込み式: autoHeight', () => {
  // jsdom のレイアウトスタブはどの要素も高さ 600px と答えるため、実測すれば行の高さは 600px になる。
  const autoHeightColumns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 160, autoHeight: true }];
  const firstRowHeight = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.ssg-body-row[data-row-index="0"]')?.style.height;

  it('機能セットに無ければ autoHeight を渡しても実測せず行の高さは固定のまま、開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <MinimalGrid rows={rows} columns={autoHeightColumns} rowKeyGetter={(r) => r.id} rowHeight={30} autoHeight />,
    );
    expect(container.querySelector('[data-autoheight-cell]')).toBeNull();
    expect(firstRowHeight(container)).toBe('30px');
    expect(warn.mock.calls.filter(([message]) => String(message).includes('`autoHeight`'))).toHaveLength(1);
  });

  it('autoHeight だけを入れた構成ではセルを実測して行の高さに反映する', () => {
    const { container } = render(
      <AutoHeightOnlyGrid rows={rows} columns={autoHeightColumns} rowKeyGetter={(r) => r.id} rowHeight={30} autoHeight />,
    );
    expect(container.querySelector('[data-autoheight-cell]')).not.toBeNull();
    expect(firstRowHeight(container)).toBe('600px');
  });
});

describe('差し込み式: filtering', () => {
  const filterColumns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 160, filterType: 'text' }];
  const bodyTexts = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('.ssg-body-cell[data-ssg-col-key="name"]')).map((cell) => cell.textContent);
  const searchBox = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input.ssg-bar-input');
  const openColumnMenu = (container: HTMLElement) => {
    const menuButton = container.querySelector<HTMLElement>('[aria-label="列メニュー"]');
    if (!menuButton) throw new Error('列メニューのボタンがありません');
    act(() => {
      fireEvent.pointerDown(menuButton, { button: 0 });
    });
  };
  const menuLabels = () => Array.from(document.querySelectorAll('.ssg-menu-label')).map((el) => el.textContent);
  const columnFilterState = {
    version: GRID_STATE_VERSION,
    columnWidths: {},
    filters: { globalText: '', columnFilters: { name: { kind: 'text' as const, value: 'be' } } },
    sort: [],
  };

  it('機能セットに無ければ検索欄と列メニューの「フィルター…」を出さず行を絞り込まない。明示した prop だけ開発時に 1 回ずつ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onFiltersChange = vi.fn();
    const { container } = render(
      <ColumnMenuOnlyGrid
        rows={rows}
        columns={filterColumns}
        rowKeyGetter={(r) => r.id}
        enableGlobalFilter
        onFiltersChange={onFiltersChange}
        showFilterChipBar
        globalFilterPlaceholder="検索"
      />,
    );
    expect(searchBox(container)).toBeNull();
    expect(container.querySelector('.ssg-filter-chip-bar')).toBeNull();
    expect(bodyTexts(container)).toEqual(['alpha', 'beta']);
    openColumnMenu(container);
    expect(menuLabels()).toContain('昇順で並び替え');
    expect(menuLabels()).not.toContain('フィルター…');
    for (const prop of [
      '`enableGlobalFilter`',
      '`columns[].filterType`',
      '`onFiltersChange`',
      '`showFilterChipBar`',
      '`globalFilterPlaceholder`',
    ]) {
      expect(warn.mock.calls.filter(([message]) => String(message).includes(prop))).toHaveLength(1);
    }
    expect(warn.mock.calls.filter(([message]) => String(message).includes('`enableColumnFilter`'))).toHaveLength(0);
  });

  it('機能セットに無い構成で applyState に渡したフィルターは行に効かず、開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<MinimalGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />);
    act(() => {
      ref.current?.applyState(columnFilterState);
    });
    act(() => {
      ref.current?.applyState({ ...columnFilterState, filters: { globalText: 'al', columnFilters: {} } });
    });
    expect(bodyTexts(container)).toEqual(['alpha', 'beta']);
    expect(warn.mock.calls.filter(([message]) => String(message).includes('フィルターの状態'))).toHaveLength(1);
  });

  it('フィルターの prop を使わなければ警告しない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<MinimalGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('filtering だけを入れた構成では検索欄で行が絞り込まれ、列フィルター(状態の復元)とチップバーも効く', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onFiltersChange = vi.fn();
    const { container } = render(
      <FilteringOnlyGrid
        ref={ref}
        rows={rows}
        columns={filterColumns}
        rowKeyGetter={(r) => r.id}
        onFiltersChange={onFiltersChange}
        showFilterChipBar
      />,
    );
    const input = searchBox(container);
    expect(input).not.toBeNull();
    act(() => {
      fireEvent.change(input as HTMLInputElement, { target: { value: 'alp' } });
    });
    expect(bodyTexts(container)).toEqual(['alpha']);
    act(() => {
      fireEvent.change(input as HTMLInputElement, { target: { value: '' } });
    });
    expect(bodyTexts(container)).toEqual(['alpha', 'beta']);
    act(() => {
      ref.current?.applyState(columnFilterState);
    });
    expect(bodyTexts(container)).toEqual(['beta']);
    expect(container.querySelector('.ssg-header-filtered-mark')).not.toBeNull();
    expect(onFiltersChange).toHaveBeenCalled();
    // チップバーに適用中のフィルターが出て、× で外せる。
    expect(container.querySelector('.ssg-filter-chip-bar')?.textContent).toContain('名前');
    act(() => {
      fireEvent.click(container.querySelector('[aria-label="名前 のフィルターをクリア"]') as HTMLElement);
    });
    expect(bodyTexts(container)).toEqual(['alpha', 'beta']);
    expect(container.querySelector('.ssg-filter-chip-bar')).toBeNull();
  });

  it('列メニューと組み合わせると「フィルター…」でポップオーバーが開き、候補のチェックで絞り込める', () => {
    const setColumns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 160, filterType: 'set' }];
    const { container } = render(<ColumnMenuFilteringGrid rows={rows} columns={setColumns} rowKeyGetter={(r) => r.id} />);
    openColumnMenu(container);
    const filterItem = Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-menu-item')).find((item) =>
      item.textContent?.includes('フィルター…'),
    );
    expect(filterItem).toBeDefined();
    act(() => {
      fireEvent.click(filterItem as HTMLButtonElement);
    });
    const popover = document.querySelector<HTMLElement>('.ssg-filter-popover');
    expect(popover).not.toBeNull();
    // 候補は行から集まる(alpha / beta)。alpha のチェックを外すと beta だけになる。
    const alphaOption = Array.from(popover?.querySelectorAll<HTMLElement>('.ssg-filter-option') ?? []).find(
      (option) => option.textContent === 'alpha',
    );
    expect(alphaOption).toBeDefined();
    act(() => {
      fireEvent.click(alphaOption?.querySelector('input') as HTMLInputElement);
    });
    expect(bodyTexts(container)).toEqual(['beta']);
  });
});

describe('差し込み式: serverSide', () => {
  const nameTexts = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('.ssg-body-cell[data-ssg-col-key="name"]')).map((cell) => cell.textContent);
  const createDataSource = (options?: { fail?: boolean }) => {
    const getRows = vi.fn<ServerSideDataSource<Row>['getRows']>((params) =>
      options?.fail
        ? Promise.reject(new Error('失敗'))
        : Promise.resolve({ rows: rows.slice(params.startIndex, params.endIndex), totalRowCount: rows.length }),
    );
    return { getRows } satisfies ServerSideDataSource<Row>;
  };
  const flush = async () => {
    await act(async () => {
      for (let i = 0; i < 4; i += 1) {
        await Promise.resolve();
      }
    });
  };

  it('機能セットに無ければ dataSource を渡しても取得せず空の表(clientSide)のまま、開発時に 1 回だけ警告する', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dataSource = createDataSource();
    const { container } = render(<MinimalGrid columns={columns} dataSource={dataSource} rowKeyGetter={(r) => r.id} />);
    await flush();
    expect(dataSource.getRows).not.toHaveBeenCalled();
    expect(nameTexts(container)).toEqual([]);
    expect(warn.mock.calls.filter(([message]) => String(message).includes('`dataSource`'))).toHaveLength(1);
  });

  it('serverSide だけを入れた構成では getRows で行を取得して描画し、失敗するとエラーバーが出る', async () => {
    const dataSource = createDataSource();
    const view = render(<ServerSideOnlyGrid columns={columns} dataSource={dataSource} rowKeyGetter={(r) => r.id} />);
    await flush();
    expect(dataSource.getRows).toHaveBeenCalled();
    expect(nameTexts(view.container)).toEqual(['alpha', 'beta']);
    view.unmount();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = createDataSource({ fail: true });
    const { container } = render(<ServerSideOnlyGrid columns={columns} dataSource={failing} rowKeyGetter={(r) => r.id} />);
    await flush();
    expect(container.querySelector('.ssg-ssrm-error-bar')?.textContent).toContain('行の取得に失敗しました');
  });
});