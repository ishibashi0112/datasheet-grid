// 追加(段階 3-3 ポップアップの遅延読み込み): 列フィルターのポップオーバー / ツールパネルを後から読み込む経路のテストです
//   (React 版の SpreadsheetGrid.lazyPopups.integration.test.tsx と同じ場面)。vitest.setup.ts はテストの前に部品を読み込むので、
//   ここではテストごとに vi.resetModules() で読み込む前のモジュール(入口と view/lazyPopups)を取り直します(solid-js は
//   取り直されない = テストの JSX と同じもの)。@solidjs/testing-library も一緒に取り直す: @solidjs/web は取り直されるので、
//   前のままの render で描くと、ポータルの中のクリックを受ける仕組み(イベントの委譲)が取り直した部品と別のものになり、
//   ポータルの中のメニューの項目を押しても何も起きない。
//   - 先読みの前に開くと、読み込み終わるまでは何も出ず、読み込み後に出て入力欄へフォーカスが入る。
//   - 描いた後の暇なとき(jsdom は requestIdleCallback が無いので setTimeout)に先読みする。その機能が使えない表では先読みしない。
//   - 読み込みに失敗したら console.error に出して閉じる。読み込み中に Escape で閉じられる。
//   - 暇なときの先読みが終わっても、セルを描き直さない。
//   - ツールパネルは閉じて開き直しても、開き直しの光りを出さない(Solid 版は閉じている間は描かない)。
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSignal, flush } from 'solid-js';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import type { GridColumn, SpreadsheetGridHandle } from './index';

type EntryModule = typeof import('./index');
type LazyPopupsModule = typeof import('./view/lazyPopups');
type TestingLibraryModule = typeof import('@solidjs/testing-library');
type Row = { id: number; name: string };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 160, filterType: 'text' },
];
const rows: Row[] = [
  { id: 1, name: 'alpha' },
  { id: 2, name: 'beta' },
];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 1600, height: 900 });
});

let entry: EntryModule;
let lazyPopups: LazyPopupsModule;
let render: TestingLibraryModule['render'];
let fireEvent: TestingLibraryModule['fireEvent'];
let waitFor: TestingLibraryModule['waitFor'];
let unmount: (() => void) | undefined;

beforeEach(async () => {
  vi.resetModules();
  entry = await import('./index');
  lazyPopups = await import('./view/lazyPopups');
  ({ render, fireEvent, waitFor } = await import('@solidjs/testing-library'));
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  vi.doUnmock('./view/ColumnFilterPopover');
});

const mount = (element: () => ReturnType<EntryModule['SpreadsheetGrid']>) => {
  const view = render(element);
  unmount = view.unmount;
  flush();
  return view;
};

// 列メニューの ⋮ →「フィルター…」で開きます(メニューは開いた直後の押下を受けないので、少し待ってから押す。shellBehavior.test と同じ)。
const openFilterFromColumnMenu = async (container: HTMLElement, columnKey: string) => {
  const menuButton = container.querySelector<HTMLElement>(`.ssg-header-cell[data-ssg-col-key="${columnKey}"] .ssg-icon-btn`);
  expect(menuButton).not.toBeNull();
  fireEvent.pointerDown(menuButton as HTMLElement, { button: 0, pointerId: 1, pointerType: 'mouse' });
  fireEvent.pointerUp(menuButton as HTMLElement, { button: 0, pointerId: 1, pointerType: 'mouse' });
  fireEvent.click(menuButton as HTMLElement, { detail: 1 });
  flush();
  await wait(60);
  const filterItem = Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((item) =>
    item.textContent?.includes('フィルター…'),
  );
  expect(filterItem).toBeDefined();
  fireEvent.click(filterItem as HTMLElement, { detail: 1 });
  flush();
};

describe('ポップアップの部品の遅延読み込み', () => {
  it('先読みの前に開いたフィルターのポップオーバーは、読み込み後に出て入力欄へフォーカスが入る', async () => {
    // 部品の取得に数フレーム以上かかる(ネットワーク越し)場面。コントローラのフォーカスの予約(二重の rAF)より読み込みが
    //   遅くても、描いた後にフォーカスが入ること。
    vi.doMock('./view/ColumnFilterPopover', async (importOriginal) => {
      await wait(150);
      return importOriginal();
    });
    const { SpreadsheetGrid } = entry;
    const view = mount(() => <SpreadsheetGrid<Row> columns={columns} rows={rows} />);
    expect(lazyPopups.filterPopoverModule.getSnapshot()).toBeNull();
    await openFilterFromColumnMenu(view.container, 'name');
    // 読み込む前: 開いた状態でも部品は出ない。
    expect(document.querySelector('.ssg-filter-popover')).toBeNull();
    const popover = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('.ssg-filter-popover');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    const input = popover.querySelector<HTMLInputElement>('input[type="text"]');
    expect(input).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('先読みの前に openFilterManager() で開いたツールパネルは、読み込み後に出る', async () => {
    const { SpreadsheetGrid } = entry;
    let handle: SpreadsheetGridHandle<Row> | undefined;
    mount(() => (
      <SpreadsheetGrid<Row>
        ref={(h) => {
          handle = h;
        }}
        columns={columns}
        rows={rows}
      />
    ));
    expect(lazyPopups.toolPanelModule.getSnapshot()).toBeNull();
    handle?.openFilterManager();
    flush();
    expect(document.querySelector('[aria-label="フィルターを追加する列を選択"]')).toBeNull();
    await waitFor(() => expect(document.querySelector('[aria-label="フィルターを追加する列を選択"]')).not.toBeNull());
    handle?.closeFilterManager();
    flush();
    expect(document.querySelector('[aria-label="フィルターを追加する列を選択"]')).toBeNull();
  });

  it('開かなくても、描いた後の暇なときに両方の部品を先読みする', async () => {
    const { SpreadsheetGrid } = entry;
    mount(() => <SpreadsheetGrid<Row> columns={columns} rows={rows} />);
    expect(lazyPopups.filterPopoverModule.getSnapshot()).toBeNull();
    expect(lazyPopups.toolPanelModule.getSnapshot()).toBeNull();
    await waitFor(() => {
      expect(lazyPopups.filterPopoverModule.getSnapshot()).not.toBeNull();
      expect(lazyPopups.toolPanelModule.getSnapshot()).not.toBeNull();
    });
  });

  it('フィルター・列メニュー・並べ替えがすべて使えない表では先読みしない', async () => {
    const { SpreadsheetGrid } = entry;
    mount(() => (
      <SpreadsheetGrid<Row> columns={columns} rows={rows} enableColumnFilter={false} enableColumnMenu={false} enableSorting={false} />
    ));
    // 先読みの予約(jsdom は setTimeout 200ms)より十分長く待っても読み込まれない。
    await wait(500);
    expect(lazyPopups.filterPopoverModule.getSnapshot()).toBeNull();
    expect(lazyPopups.toolPanelModule.getSnapshot()).toBeNull();
  });

  it('列の定義を続けて差し替えても、先読みの予約をやり直さずに先読みする', async () => {
    // 先読みの条件(filterType のある列があるか)は列を読むので、真のまま列が変わるたびに予約を取り消していると、
    //   予約(jsdom は 200ms)より短い間隔で列を差し替え続ける画面では先読みが起きない(段階 3-3 のレビュー)。
    const { SpreadsheetGrid } = entry;
    const [currentColumns, setCurrentColumns] = createSignal(columns);
    mount(() => <SpreadsheetGrid<Row> columns={currentColumns()} rows={rows} />);
    for (let i = 0; i < 8; i += 1) {
      await wait(80);
      setCurrentColumns(columns.map((column) => ({ ...column })));
      flush();
    }
    expect(lazyPopups.filterPopoverModule.getSnapshot()).not.toBeNull();
  });

  it('filterType のある列が無い表では、フィルターのポップオーバーを先読みしない(ツールパネルは先読みする)', async () => {
    const { SpreadsheetGrid } = entry;
    const plainColumns: GridColumn<Row>[] = columns.map((column) => ({ ...column, filterType: undefined }));
    mount(() => <SpreadsheetGrid<Row> columns={plainColumns} rows={rows} />);
    await waitFor(() => expect(lazyPopups.toolPanelModule.getSnapshot()).not.toBeNull());
    await wait(300);
    expect(lazyPopups.filterPopoverModule.getSnapshot()).toBeNull();
  });

  it('列メニューもツールパネルも無い構成(createSpreadsheetGrid)では、フィルターが使えても先読みしない', async () => {
    const { createSpreadsheetGrid, filteringFeature } = entry;
    const MinimalGrid = createSpreadsheetGrid({ features: { filtering: filteringFeature } });
    mount(() => <MinimalGrid<Row> columns={columns} rows={rows} />);
    await wait(500);
    expect(lazyPopups.filterPopoverModule.getSnapshot()).toBeNull();
    expect(lazyPopups.toolPanelModule.getSnapshot()).toBeNull();
  });

  it('読み込みに失敗したら console.error に出し、開いていた状態を閉じる', async () => {
    vi.doMock('./view/ColumnFilterPopover', () => {
      throw new Error('chunk load failed');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { SpreadsheetGrid } = entry;
      const view = mount(() => <SpreadsheetGrid<Row> columns={columns} rows={rows} />);
      const shell = view.container.querySelector<HTMLElement>('.ssg-shell');
      expect(shell?.tabIndex).toBe(0);
      await openFilterFromColumnMenu(view.container, 'name');
      // 開いている間は表のキー操作を止める(tabIndex -1)。
      expect(shell?.tabIndex).toBe(-1);
      await waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith(
          '[SpreadsheetGrid] ポップオーバー部品の読み込みに失敗しました。\n[SpreadsheetGrid] Failed to load the popup components.',
          expect.anything(),
        ),
      );
      await waitFor(() => expect(shell?.tabIndex).toBe(0));
      expect(document.querySelector('.ssg-filter-popover')).toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('読み込み中に Escape で閉じられる(表のキー操作が戻る)', async () => {
    vi.doMock('./view/ColumnFilterPopover', async (importOriginal) => {
      await wait(300);
      return importOriginal();
    });
    const { SpreadsheetGrid } = entry;
    const view = mount(() => <SpreadsheetGrid<Row> columns={columns} rows={rows} />);
    const shell = view.container.querySelector<HTMLElement>('.ssg-shell');
    await openFilterFromColumnMenu(view.container, 'name');
    expect(shell?.tabIndex).toBe(-1);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    flush();
    expect(shell?.tabIndex).toBe(0);
    // 読み込みが終わっても出てこない。
    await wait(500);
    flush();
    expect(document.querySelector('.ssg-filter-popover')).toBeNull();
  });

  it('暇なときの先読みが終わっても、セルを描き直さない', async () => {
    const { SpreadsheetGrid } = entry;
    let renderCellCalls = 0;
    const countedColumns: GridColumn<Row>[] = columns.map((column) => ({
      ...column,
      renderCell: (ctx) => {
        renderCellCalls += 1;
        return <span>{String(ctx.value)}</span>;
      },
    }));
    mount(() => <SpreadsheetGrid<Row> columns={countedColumns} rows={rows} />);
    const before = renderCellCalls;
    expect(before).toBeGreaterThan(0);
    await waitFor(() => {
      expect(lazyPopups.filterPopoverModule.getSnapshot()).not.toBeNull();
      expect(lazyPopups.toolPanelModule.getSnapshot()).not.toBeNull();
    });
    flush();
    expect(renderCellCalls).toBe(before);
  });

  it('ツールパネルは閉じて開き直しても、開き直しの光りを出さない', async () => {
    const { SpreadsheetGrid } = entry;
    let handle: SpreadsheetGridHandle<Row> | undefined;
    mount(() => (
      <SpreadsheetGrid<Row>
        ref={(h) => {
          handle = h;
        }}
        columns={columns}
        rows={rows}
      />
    ));
    await lazyPopups.preloadGridPopups();
    flush();
    handle?.openFilterManager();
    flush();
    // 開いている間にもう一度開く → 開き直しの光り。
    handle?.openFilterManager();
    flush();
    expect(document.querySelector('.ssg-toolpanel')?.classList.contains('ssg-toolpanel--flash')).toBe(true);
    handle?.closeFilterManager();
    flush();
    expect(document.querySelector('.ssg-toolpanel')).toBeNull();
    handle?.openFilterManager();
    flush();
    const panel = document.querySelector('.ssg-toolpanel');
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains('ssg-toolpanel--flash')).toBe(false);
  });

  it('preloadGridPopups() で読み込めば、開いた直後に出る', async () => {
    const { SpreadsheetGrid } = entry;
    const view = mount(() => <SpreadsheetGrid<Row> columns={columns} rows={rows} />);
    await lazyPopups.preloadGridPopups();
    flush();
    await openFilterFromColumnMenu(view.container, 'name');
    // 位置はコントローラが次のフレームで決めるので、少し待つ(読み込みは待たない)。
    await wait(60);
    expect(document.querySelector('.ssg-filter-popover')).not.toBeNull();
  });
});