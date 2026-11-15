// 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-33 / RV2-L2): メニューとツールパネルをキーボードと読み上げで使えることの結合テストです。
//   - Shift+F10 / メニューキーでアクティブセルの右クリックメニューが開き、先頭の項目へフォーカスが移る。続けて来る
//     キーボードの contextmenu は標準のメニューを止めるだけ。keydown を経ずに来た contextmenu でも開く。
//   - 右クリックで開いたメニューはパネルにフォーカスが移る(↓ で先頭、↑ で末尾の項目へ)。
//   - 列メニューは role="menu" で、並び替えは menuitemradio + aria-checked、⋮ は aria-haspopup / aria-expanded。
//   - ツールパネルは role="dialog" と名前を持ち、開くと選ばれているタブへフォーカスが移り、Tab はパネルの中で回る。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type {
  GridColumn,
  GridContextMenuItem,
  GridContextMenuParams,
  SpreadsheetGridHandle,
  SpreadsheetGridProps,
} from './model/gridTypes';

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 160, filterType: 'text' },
  { key: 'qty', title: 'Qty', width: 100, filterType: 'number' },
];
const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 10 },
  { id: 2, name: 'beta', qty: 20 },
  { id: 3, name: 'gamma', qty: 30 },
];

const menuItems = (): GridContextMenuItem[] => [
  { kind: 'action', id: 'copy', label: 'コピー', onSelect: () => {} },
  { kind: 'separator' },
  { kind: 'action', id: 'remove', label: '削除', onSelect: () => {} },
];

const setup = (props: Partial<SpreadsheetGridProps<Row>> = {}) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const view = render(
    <SpreadsheetGrid<Row> ref={ref} rows={rows} columns={columns} rowKeyGetter={(row) => row.id} {...props} />,
  );
  const shell = view.container.querySelector<HTMLElement>('.ssg-shell');
  if (!shell) {
    throw new Error('shell が見つかりません');
  }
  return { ...view, ref, shell };
};

// フォーカスの移動はメニューの位置を測った次のフレームです。
const nextFrame = async () => {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const menuPanel = () => document.querySelector<HTMLElement>('.ssg-menu-panel');

describe('キーボードで開く右クリックメニュー(AP-33)', () => {
  let restore: () => void;
  beforeAll(() => {
    restore = installJsdomLayoutStubs();
  });
  afterAll(() => {
    restore();
  });
  afterEach(() => {
    cleanup();
  });

  it('Shift+F10 でアクティブセルのメニューが開き、先頭の項目へフォーカスが移る', async () => {
    const getContextMenuItems = vi.fn<(params: GridContextMenuParams<Row>) => GridContextMenuItem[]>(menuItems);
    const onContextMenuOpen = vi.fn();
    const { ref, shell } = setup({ enableContextMenu: true, getContextMenuItems, onContextMenuOpen });
    act(() => {
      ref.current?.selectCell(1, 1);
    });
    shell.focus();
    const keydown = new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true });
    act(() => {
      shell.dispatchEvent(keydown);
    });
    expect(keydown.defaultPrevented).toBe(true);
    expect(menuPanel()).not.toBeNull();
    const params = getContextMenuItems.mock.calls[0]?.[0] as GridContextMenuParams<Row> | undefined;
    expect(params?.target).toMatchObject({ type: 'cell', rowIndex: 1, colIndex: 1, row: rows[1], value: 20 });
    expect(params?.isTargetSelected).toBe(true);
    expect(onContextMenuOpen).toHaveBeenCalledTimes(1);
    await nextFrame();
    expect(document.activeElement?.textContent).toContain('コピー');

    // 続けてブラウザが送るキーボードの contextmenu(シェルが対象・右ボタンではない)は、標準のメニューを止めるだけ。
    const contextmenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      shell.dispatchEvent(contextmenu);
    });
    expect(contextmenu.defaultPrevented).toBe(true);
    expect(getContextMenuItems).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.textContent).toContain('コピー');
  });

  it('キーで開いた直後のキーボードの contextmenu は、表の外が対象でも 1 回だけ止める(右クリックは止めない)', () => {
    const { ref, shell } = setup({ enableContextMenu: true, getContextMenuItems: menuItems });
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 0 });
    });
    act(() => {
      fireEvent.keyDown(shell, { key: 'ContextMenu' });
    });
    expect(menuPanel()).not.toBeNull();
    // 右ボタンの contextmenu は止めない(見張りも外れる)。
    const rightClick = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    document.body.dispatchEvent(rightClick);
    expect(rightClick.defaultPrevented).toBe(false);
    const late = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0 });
    document.body.dispatchEvent(late);
    expect(late.defaultPrevented).toBe(false);

    // もう一度キーで開くと、続けて表の外へ来たキーボードの contextmenu を 1 回だけ止める。
    act(() => {
      fireEvent.keyDown(shell, { key: 'Escape' });
    });
    shell.focus();
    act(() => {
      fireEvent.keyDown(shell, { key: 'ContextMenu' });
    });
    const keyup = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0 });
    document.body.dispatchEvent(keyup);
    expect(keyup.defaultPrevented).toBe(true);
    const second = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0 });
    document.body.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });

  it('キーで開いた後に別のキー操作かポインタの押し下げがあれば、次のキーボードの contextmenu は止めない', () => {
    const { ref, shell } = setup({ enableContextMenu: true, getContextMenuItems: menuItems });
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 0 });
    });
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    try {
      for (const interrupt of ['keydown', 'pointerdown'] as const) {
        shell.focus();
        act(() => {
          fireEvent.keyDown(shell, { key: 'F10', shiftKey: true });
        });
        expect(menuPanel()).not.toBeNull();
        // keydown を止めたのでブラウザは contextmenu を送らなかった。メニューを閉じて別の入力欄で Shift+F10。
        act(() => {
          if (interrupt === 'keydown') {
            fireEvent.keyDown(outside, { key: 'F10', shiftKey: true });
          } else {
            fireEvent.pointerDown(outside);
          }
        });
        const next = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0 });
        outside.dispatchEvent(next);
        expect(next.defaultPrevented).toBe(false);
        act(() => {
          fireEvent.keyDown(document.activeElement ?? shell, { key: 'Escape' });
        });
      }
    } finally {
      outside.remove();
    }
  });

  it('メニューキー(ContextMenu)でも開く', () => {
    const getContextMenuItems = vi.fn<(params: GridContextMenuParams<Row>) => GridContextMenuItem[]>(menuItems);
    const { ref, shell } = setup({ enableContextMenu: true, getContextMenuItems });
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 0 });
    });
    act(() => {
      fireEvent.keyDown(shell, { key: 'ContextMenu' });
    });
    expect(menuPanel()).not.toBeNull();
    expect(getContextMenuItems.mock.calls[0]?.[0]?.target).toMatchObject({ type: 'cell', rowIndex: 0, colIndex: 0 });
  });

  it('keydown を経ずに来たキーボードの contextmenu でもアクティブセルのメニューを開く', () => {
    const getContextMenuItems = vi.fn<(params: GridContextMenuParams<Row>) => GridContextMenuItem[]>(menuItems);
    const { ref, shell } = setup({ enableContextMenu: true, getContextMenuItems });
    act(() => {
      ref.current?.setActiveCell({ row: 2, col: 0 });
    });
    const contextmenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      shell.dispatchEvent(contextmenu);
    });
    expect(contextmenu.defaultPrevented).toBe(true);
    expect(menuPanel()).not.toBeNull();
    expect(getContextMenuItems.mock.calls[0]?.[0]?.target).toMatchObject({ type: 'cell', rowIndex: 2, colIndex: 0 });
  });

  it('項目が無い・アクティブセルが無い・機能が無効のときは開かず、標準のメニューのまま', () => {
    const emptyItems = vi.fn<(params: GridContextMenuParams<Row>) => GridContextMenuItem[]>(() => []);
    const empty = setup({ enableContextMenu: true, getContextMenuItems: emptyItems });
    act(() => {
      empty.ref.current?.setActiveCell({ row: 0, col: 0 });
    });
    const keydown = new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true });
    act(() => {
      empty.shell.dispatchEvent(keydown);
    });
    expect(keydown.defaultPrevented).toBe(false);
    expect(menuPanel()).toBeNull();
    // 続けて来るキーボードの contextmenu は標準のメニューのまま、項目も問い合わせ直さない(1 回の操作で 1 回)。
    const followUp = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      empty.shell.dispatchEvent(followUp);
    });
    expect(followUp.defaultPrevented).toBe(false);
    expect(emptyItems).toHaveBeenCalledTimes(1);
    cleanup();

    const noActive = setup({ enableContextMenu: true, getContextMenuItems: menuItems });
    const contextmenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      noActive.shell.dispatchEvent(contextmenu);
    });
    expect(contextmenu.defaultPrevented).toBe(false);
    expect(menuPanel()).toBeNull();
    cleanup();

    const disabled = setup({ getContextMenuItems: menuItems });
    act(() => {
      disabled.ref.current?.setActiveCell({ row: 0, col: 0 });
    });
    act(() => {
      fireEvent.keyDown(disabled.shell, { key: 'F10', shiftKey: true });
    });
    expect(menuPanel()).toBeNull();
  });

  it('シェルの中の検索欄でのキーボードの contextmenu は標準のメニューのまま', () => {
    const getContextMenuItems = vi.fn<(params: GridContextMenuParams<Row>) => GridContextMenuItem[]>(menuItems);
    const { ref, container } = setup({ enableContextMenu: true, getContextMenuItems, enableGlobalFilter: true });
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 0 });
    });
    const search = container.querySelector<HTMLInputElement>('input[type="text"], input[type="search"]');
    expect(search).not.toBeNull();
    const contextmenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      search!.dispatchEvent(contextmenu);
    });
    expect(contextmenu.defaultPrevented).toBe(false);
    expect(getContextMenuItems).not.toHaveBeenCalled();
  });

  it('右クリックで開いたメニューはパネルにフォーカスが移り、↓ で先頭・↑ で末尾の項目へ', async () => {
    const { container } = setup({ enableContextMenu: true, getContextMenuItems: menuItems });
    const cell = container.querySelector<HTMLElement>('[data-row-index="0"] [data-ssg-col-key="name"]');
    act(() => {
      fireEvent.contextMenu(cell!, { clientX: 10, clientY: 10, button: 2 });
    });
    const panel = menuPanel();
    expect(panel).not.toBeNull();
    await nextFrame();
    expect(document.activeElement).toBe(panel);
    // パネルの textContent は全項目を含むので、項目(role="menuitem")へ移ったことまで確かめる。
    act(() => {
      fireEvent.keyDown(panel!, { key: 'ArrowDown' });
    });
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
    expect(document.activeElement?.textContent).toBe('コピー');
    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    });
    expect(document.activeElement?.textContent).toBe('削除');
    act(() => {
      panel!.focus();
    });
    act(() => {
      fireEvent.keyDown(panel!, { key: 'ArrowUp' });
    });
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
    expect(document.activeElement?.textContent).toBe('削除');
  });
});

describe('列メニューの役割(AP-33)', () => {
  let restore: () => void;
  beforeAll(() => {
    restore = installJsdomLayoutStubs();
  });
  afterAll(() => {
    restore();
  });
  afterEach(() => {
    cleanup();
  });

  it('role="menu" と名前を持ち、並び替えは menuitemradio + aria-checked、⋮ は aria-haspopup / aria-expanded', () => {
    const { ref, shell, container } = setup({ initialState: { sort: [{ columnKey: 'qty', direction: 'desc' }] } });
    const trigger = container.querySelector<HTMLElement>('[data-ssg-col-key="qty"] [aria-haspopup="menu"]');
    expect(trigger).not.toBeNull();
    expect(trigger!.getAttribute('aria-expanded')).toBe('false');
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    act(() => {
      fireEvent.keyDown(shell, { key: 'ArrowDown', altKey: true });
    });
    const menu = screen.getByRole('menu', { name: 'Qty' });
    expect(menu.getAttribute('tabindex')).toBe('-1');
    const radios = screen.getAllByRole('menuitemradio');
    const asc = radios.find((item) => item.textContent?.includes('昇順'));
    const desc = radios.find((item) => item.textContent?.includes('降順'));
    expect(asc?.getAttribute('aria-checked')).toBe('false');
    expect(desc?.getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0);
    // 項目ではない要素(見出し・区切りの入れ物)は役割を持たない / 読み上げない。
    for (const child of Array.from(menu.children)) {
      const role = child.getAttribute('role');
      const hidden = child.getAttribute('aria-hidden') === 'true';
      expect(hidden || role === 'menuitem' || role === 'menuitemradio' || role === 'separator' || role === 'none').toBe(true);
    }
    const reopenedTrigger = container.querySelector<HTMLElement>('[data-ssg-col-key="qty"] [aria-haspopup="menu"]');
    expect(reopenedTrigger!.getAttribute('aria-expanded')).toBe('true');
  });

  it('⋮ を押して開いた列メニューは、パネルにフォーカスがあっても ↓ で先頭・↑ で末尾の項目へ', async () => {
    const { container } = setup();
    const trigger = container.querySelector<HTMLElement>('[data-ssg-col-key="qty"] [aria-haspopup="menu"]');
    act(() => {
      fireEvent.pointerDown(trigger!, { button: 0, pointerId: 1 });
      fireEvent.click(trigger!);
    });
    const menu = screen.getByRole('menu', { name: 'Qty' });
    await nextFrame();
    const items = Array.from(menu.querySelectorAll<HTMLElement>('.ssg-menu-item:not(:disabled):not([aria-disabled="true"])'));
    expect(items.length).toBeGreaterThan(1);
    // マウスで開いてフォーカスがどこにも無いときの置き場(パネル)から
    act(() => {
      menu.focus();
    });
    act(() => {
      fireEvent.keyDown(menu, { key: 'ArrowDown' });
    });
    expect(document.activeElement).toBe(items[0]);
    act(() => {
      menu.focus();
    });
    act(() => {
      fireEvent.keyDown(menu, { key: 'ArrowUp' });
    });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });
});

describe('列フィルターを開いたまま別の列の ⋮(1.1.0 の確かめ直し)', () => {
  let restore: () => void;
  beforeAll(() => {
    restore = installJsdomLayoutStubs();
  });
  afterAll(() => {
    restore();
  });
  afterEach(() => {
    cleanup();
  });

  it('閉じた列フィルターがフォーカスをシェルへ戻しても、開いた列メニューのパネルへフォーカスが移る', async () => {
    const { container } = setup();
    const openMenu = (key: string) => {
      const trigger = container.querySelector<HTMLElement>(`[data-ssg-col-key="${key}"] [aria-haspopup="menu"]`);
      // detail: 1 = マウスの押下(0 はキーボードの扱いで、先頭の項目へフォーカスが移る)。
      act(() => {
        fireEvent.pointerDown(trigger!, { button: 0, pointerId: 1 });
        fireEvent.click(trigger!, { detail: 1 });
      });
    };
    openMenu('name');
    await nextFrame();
    const filterItem = Array.from(screen.getByRole('menu', { name: 'Name' }).querySelectorAll<HTMLElement>('.ssg-menu-item')).find(
      (item) => item.textContent?.includes('フィルター'),
    );
    act(() => {
      filterItem!.click();
    });
    await nextFrame();
    await nextFrame();
    expect(document.querySelector('.ssg-filter-popover')).not.toBeNull();
    openMenu('qty');
    await nextFrame();
    await nextFrame();
    expect(document.querySelector('.ssg-filter-popover')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('menu', { name: 'Qty' }));
  });
});

describe('ツールパネルのダイアログ(RV2-L2)', () => {
  let restore: () => void;
  beforeAll(() => {
    restore = installJsdomLayoutStubs();
  });
  afterAll(() => {
    restore();
  });
  afterEach(() => {
    cleanup();
  });

  it('role="dialog" と名前を持ち、開くと選ばれているタブへフォーカスが移り、Tab はパネルの中で回る', async () => {
    const { ref } = setup();
    act(() => {
      ref.current?.openFilterManager();
    });
    await nextFrame();
    const dialog = screen.getByRole('dialog', { name: 'ツールパネル' });
    const selectedTab = dialog.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    expect(selectedTab).not.toBeNull();
    expect(document.activeElement).toBe(selectedTab);

    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([disabled])',
      ),
    ).filter((element) => element.tabIndex >= 0);
    const last = focusables[focusables.length - 1];
    expect(last).toBeDefined();
    act(() => {
      last!.focus();
    });
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => {
      last!.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(last);
  });

  // 追加(1.1.0 / RV2-L2 の見直し): 列メニューを閉じたときの「グリッドへ戻す」(次のフレーム)が、続けて開いたツールパネルの
  //   フォーカスを奪っていた。
  it('列メニューの「並び替えを管理…」から開いたツールパネルは、次のフレームの後もフォーカスがパネルの中にある', async () => {
    const { container } = setup();
    const trigger = container.querySelector<HTMLElement>('[data-ssg-col-key="qty"] [aria-haspopup="menu"]');
    act(() => {
      fireEvent.pointerDown(trigger!, { button: 0, pointerId: 1 });
      fireEvent.click(trigger!);
    });
    await nextFrame();
    const item = screen.getByRole('menuitem', { name: /並び替えを管理/ });
    act(() => {
      fireEvent.pointerDown(item, { button: 0, pointerId: 1 });
      item.focus();
      fireEvent.click(item);
    });
    const dialog = screen.getByRole('dialog', { name: 'ツールパネル' });
    await nextFrame();
    await nextFrame();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('「列」タブで開いたときも選ばれているタブへフォーカス。開いている間に「列」タブへ切り替えたときは検索欄へ', async () => {
    const { container } = setup();
    const trigger = container.querySelector<HTMLElement>('[data-ssg-col-key="qty"] [aria-haspopup="menu"]');
    act(() => {
      fireEvent.pointerDown(trigger!, { button: 0, pointerId: 1 });
      fireEvent.click(trigger!);
    });
    await nextFrame();
    const item = screen.getByRole('menuitem', { name: /列の表示/ });
    act(() => {
      fireEvent.pointerDown(item, { button: 0, pointerId: 1 });
      item.focus();
      fireEvent.click(item);
    });
    const dialog = screen.getByRole('dialog', { name: 'ツールパネル' });
    await nextFrame();
    await nextFrame();
    const selected = () => dialog.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    expect(document.activeElement).toBe(selected());
    const tabs = Array.from(dialog.querySelectorAll<HTMLElement>('[role="tab"]'));
    const columnsTab = selected()!;
    const otherTab = tabs.find((tab) => tab !== columnsTab)!;
    act(() => {
      otherTab.focus();
      fireEvent.click(otherTab);
    });
    // タブを切り替えてもフォーカスはパネルの中(body へ落とさない)。
    expect(document.activeElement).toBe(otherTab);
    act(() => {
      columnsTab.focus();
      fireEvent.click(columnsTab);
    });
    await nextFrame();
    expect(document.activeElement?.tagName).toBe('INPUT');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('上部バーの絞り込みの要約から開くと aria-expanded が true、Escape で閉じると要約へフォーカスが戻る', async () => {
    const { container } = setup({ enableColumnFilter: true, showTopBar: true });
    const chip = container.querySelector<HTMLButtonElement>('.ssg-bar-chip--action');
    expect(chip).not.toBeNull();
    expect(chip!.getAttribute('aria-haspopup')).toBe('dialog');
    expect(chip!.getAttribute('aria-expanded')).toBe('false');
    act(() => {
      chip!.focus();
      fireEvent.click(chip!);
    });
    await nextFrame();
    const dialog = screen.getByRole('dialog', { name: 'ツールパネル' });
    expect(chip!.getAttribute('aria-expanded')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    act(() => {
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    });
    await nextFrame();
    expect(screen.queryByRole('dialog', { name: 'ツールパネル' })).toBeNull();
    expect(document.activeElement).toBe(chip);
    expect(chip!.getAttribute('aria-expanded')).toBe('false');
  });

  it('英語の文言では「Tool panel」', async () => {
    const { ref } = setup({ localeText: { toolPanelLabel: 'Tool panel' } });
    act(() => {
      ref.current?.openFilterManager();
    });
    await nextFrame();
    expect(screen.getByRole('dialog', { name: 'Tool panel' })).toBeTruthy();
  });
});