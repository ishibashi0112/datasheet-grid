// 追加(lazy-popups): 列フィルターポップオーバー / ツールパネルの遅延読み込みの結合テストです。
//   vitest.setup.ts は React 版のテストで部品を先読みするため、ここではテストごとに vi.resetModules() で
//   読み込み前のモジュール(SpreadsheetGrid と view/lazyPopups)を取り直して、遅延読み込みの経路を確かめます。
//   - 先読み前に開くと、部品の読み込み完了までは何も出ず、読み込み後に出て入力欄へフォーカスが入る
//     (Suspense の中だけの再描画では controller の update が呼ばれずフォーカスが入らない、の回帰防止)。
//   - マウント後の暇なとき(jsdom は requestIdleCallback が無いので setTimeout)に先読みする。
//   - その機能が使えないグリッドでは先読みしない。
//   - 読み込みに失敗したら console.error に出して閉じる(見えないポップアップでキーボードが止まったままにしない)。
//   - 読み込み中に Escape で閉じられる。
//   - 暇なときの先読みが終わってもシェルを再描画しない(利用側テストで act 外の更新警告を出さない)。
//   - ツールパネルは一度開いたら置き続ける(開き直しのたびにマウントして既開時フラッシュが走らない)。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';

import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type GridModule = typeof import('./SpreadsheetGrid');
type LazyPopupsModule = typeof import('./view/lazyPopups');

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
  // jsdom は要素寸法が常に 0 で列仮想化が 1 列も描画しないため、寸法を広い固定値でスタブします。
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 1600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 900 });
});

let SpreadsheetGrid: GridModule['SpreadsheetGrid'];
let lazyPopups: LazyPopupsModule;

beforeEach(async () => {
  vi.resetModules();
  ({ SpreadsheetGrid } = await import('./SpreadsheetGrid'));
  lazyPopups = await import('./view/lazyPopups');
});

afterEach(() => {
  cleanup();
  vi.doUnmock('./view/ColumnFilterPopover');
});

type Row = { id: number; name: string };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 160, filterType: 'text' },
];

const rows: Row[] = [
  { id: 1, name: 'alpha' },
  { id: 2, name: 'beta' },
];

const openFilterFromColumnMenu = (container: HTMLElement, columnKey: string) => {
  const menuButton = container.querySelector<HTMLButtonElement>(
    `.ssg-header-row [data-ssg-col-key="${columnKey}"] [data-ssg-tooltip="列メニュー"]`,
  );
  expect(menuButton).not.toBeNull();
  act(() => {
    fireEvent.pointerDown(menuButton!, { button: 0 });
    fireEvent.click(menuButton!);
  });
  const filterItem = Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-menu-item')).find(
    (item) => item.textContent?.includes('フィルター…'),
  );
  expect(filterItem).toBeDefined();
  act(() => {
    fireEvent.click(filterItem!);
  });
};

describe('SpreadsheetGrid ポップオーバー部品の遅延読み込み', () => {
  it('先読み前に開いたフィルターポップオーバーは、読み込み後に出て入力欄へフォーカスが入る', async () => {
    // 部品の取得に数フレーム以上かかる(実際のネットワーク越し)状況を作ります。controller のフォーカス予約
    //   (二重 rAF)より読み込みが遅くても、描画後にフォーカスが入ること。
    vi.doMock('./view/ColumnFilterPopover', async (importOriginal) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return importOriginal();
    });
    const view = render(<SpreadsheetGrid columns={columns} rows={rows} />);
    expect(lazyPopups.filterPopoverModule.getSnapshot()).toBeNull();
    openFilterFromColumnMenu(view.container, 'name');
    // 読み込み前: 開いた状態でも部品は出ない。
    expect(document.querySelector('.ssg-filter-popover')).toBeNull();

    const popover = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('.ssg-filter-popover');
      expect(element).not.toBeNull();
      return element!;
    });
    const input = popover.querySelector<HTMLInputElement>('input[type="text"]');
    expect(input).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('先読み前に openFilterManager() で開いたツールパネルは、読み込み後に出る', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} />);
    expect(lazyPopups.toolPanelModule.getSnapshot()).toBeNull();
    act(() => {
      ref.current?.openFilterManager();
    });
    expect(screen.queryByLabelText('フィルターを追加する列を選択')).toBeNull();
    await waitFor(() => expect(screen.getByLabelText('フィルターを追加する列を選択')).toBeTruthy());
    act(() => {
      ref.current?.closeFilterManager();
    });
    expect(screen.queryByLabelText('フィルターを追加する列を選択')).toBeNull();
  });

  it('開かなくても、マウント後の暇なときに両方の部品を先読みする', async () => {
    render(<SpreadsheetGrid columns={columns} rows={rows} />);
    expect(lazyPopups.filterPopoverModule.getSnapshot()).toBeNull();
    expect(lazyPopups.toolPanelModule.getSnapshot()).toBeNull();
    await waitFor(() => {
      expect(lazyPopups.filterPopoverModule.getSnapshot()).not.toBeNull();
      expect(lazyPopups.toolPanelModule.getSnapshot()).not.toBeNull();
    });
  });

  it('フィルター・列メニュー・ソートがすべて使えないグリッドでは先読みしない', async () => {
    render(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        enableColumnFilter={false}
        enableColumnMenu={false}
        enableSorting={false}
      />,
    );
    // 先読みの予約(jsdom は setTimeout 200ms)より十分長く待っても読み込まれない。
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(lazyPopups.filterPopoverModule.getSnapshot()).toBeNull();
    expect(lazyPopups.toolPanelModule.getSnapshot()).toBeNull();
  });

  // 追加(差し込み式 段階 3): 列フィルターポップオーバーを開く入口(列メニュー / ツールパネル)が無い構成でも先読みしない。
  it('列メニューもツールパネルも無い構成(createSpreadsheetGrid)では、フィルターが使えても先読みしない', async () => {
    const { createSpreadsheetGrid } = await import('./createSpreadsheetGrid');
    // 変更(差し込み式 段階 5): フィルターも機能になったので、フィルターだけを入れた構成で確かめます(機能セットが空だと
    //   フィルターの代役が部品を返さないため、入口の有無に関係なく先読みしない = 確かめたいことを見られない)。
    const { filteringFeature } = await import('./features/filtering');
    const MinimalGrid = createSpreadsheetGrid({ features: { filtering: filteringFeature } });
    render(<MinimalGrid columns={columns} rows={rows} />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(lazyPopups.filterPopoverModule.getSnapshot()).toBeNull();
    expect(lazyPopups.toolPanelModule.getSnapshot()).toBeNull();
  });

  it('読み込みに失敗したら console.error に出し、開いていた状態を閉じる', async () => {
    vi.doMock('./view/ColumnFilterPopover', () => {
      throw new Error('chunk load failed');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const view = render(<SpreadsheetGrid columns={columns} rows={rows} />);
      const shell = view.container.querySelector<HTMLElement>('.ssg-shell');
      expect(shell?.tabIndex).toBe(0);
      openFilterFromColumnMenu(view.container, 'name');
      // 開いている間はグリッドのキーボード操作を止める(tabIndex -1)。
      expect(shell?.tabIndex).toBe(-1);
      await waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith(
          '[SpreadsheetGrid] ポップオーバー部品の読み込みに失敗しました。',
          expect.anything(),
        ),
      );
      await waitFor(() => expect(shell?.tabIndex).toBe(0));
      expect(document.querySelector('.ssg-filter-popover')).toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('読み込み中に Escape で閉じられる(グリッドのキーボード操作が戻る)', async () => {
    vi.doMock('./view/ColumnFilterPopover', async (importOriginal) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return importOriginal();
    });
    const view = render(<SpreadsheetGrid columns={columns} rows={rows} />);
    const shell = view.container.querySelector<HTMLElement>('.ssg-shell');
    openFilterFromColumnMenu(view.container, 'name');
    expect(shell?.tabIndex).toBe(-1);
    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });
    expect(shell?.tabIndex).toBe(0);
    // 読み込みが終わっても出てこない。
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(document.querySelector('.ssg-filter-popover')).toBeNull();
  });

  it('暇なときの先読みが終わってもシェルを再描画しない(act 環境で act 外の更新警告が出ない)', async () => {
    const globals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = globals.IS_REACT_ACT_ENVIRONMENT;
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<SpreadsheetGrid columns={columns} rows={rows} />);
      // act の外で、先読みの予約(jsdom は setTimeout 200ms)と読み込みが終わるまで待つ。
      await new Promise((resolve) => setTimeout(resolve, 800));
      expect(lazyPopups.filterPopoverModule.getSnapshot()).not.toBeNull();
      expect(lazyPopups.toolPanelModule.getSnapshot()).not.toBeNull();
      const actWarnings = consoleError.mock.calls.filter((call) =>
        String(call[0]).includes('not wrapped in act'),
      );
      expect(actWarnings).toHaveLength(0);
    } finally {
      consoleError.mockRestore();
      globals.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  });

  it('ツールパネルは一度開いたら置き続け、開き直しで既開時フラッシュを再生しない', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} />);
    await act(() => lazyPopups.preloadGridPopups());
    act(() => {
      ref.current?.openFilterManager();
    });
    // 開いている間にもう一度開く → 既開時フラッシュ(flashTick が 1 になる)。
    act(() => {
      ref.current?.openFilterManager();
    });
    expect(document.querySelector('.ssg-toolpanel')?.classList.contains('ssg-toolpanel--flash')).toBe(true);
    act(() => {
      ref.current?.closeFilterManager();
    });
    expect(document.querySelector('.ssg-toolpanel')).toBeNull();
    act(() => {
      ref.current?.openFilterManager();
    });
    const panel = document.querySelector('.ssg-toolpanel');
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains('ssg-toolpanel--flash')).toBe(false);
  });

  it('preloadGridPopups() で読み込めば、開いた直後に同期で出る', async () => {
    const view = render(<SpreadsheetGrid columns={columns} rows={rows} />);
    await act(() => lazyPopups.preloadGridPopups());
    openFilterFromColumnMenu(view.container, 'name');
    expect(document.querySelector('.ssg-filter-popover')).not.toBeNull();
  });
});