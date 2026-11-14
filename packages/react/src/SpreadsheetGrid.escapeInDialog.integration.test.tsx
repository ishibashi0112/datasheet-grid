// 追加(1.0.1 / 実アプリの総点検 AP-17): ダイアログの中のグリッドで、グリッドが使う Escape(編集の取り消し・ポップアップを
//   閉じる・範囲の選択を外す)ではダイアログが閉じないことの結合テストです。ダイアログの聞き方を 3 つ模します:
//   document の capture で defaultPrevented を見る(Radix / Headless UI)、window の capture で対象の
//   data-mantine-stop-propagation を見る(Mantine)、React の onKeyDown(React Aria / HeroUI)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string };
const rows: Row[] = [
  { id: 1, name: 'a' },
  { id: 2, name: 'b' },
  { id: 3, name: 'c' },
];
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160, filterType: 'set' },
  { key: 'id', title: 'ID', width: 80 },
];

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

const setup = () => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const reactDialogEscape = vi.fn();
  const utils = render(
    // React の onKeyDown で Escape を聞くモーダル(React Aria / HeroUI)の代わり。
    <div
      onKeyDown={(event) => {
        if (event.key === 'Escape') reactDialogEscape();
      }}
    >
      <SpreadsheetGrid<Row>
        ref={ref}
        rows={rows}
        onRowsChange={() => {}}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        enableColumnFilter
        enableContextMenu
        getContextMenuItems={() => [{ kind: 'action', key: 'a', label: 'A', onSelect: () => {} }]}
      />
    </div>,
  );
  // document の capture で defaultPrevented を見るダイアログ(Radix / Headless UI)と、window の capture で
  //   data-mantine-stop-propagation を見るダイアログ(Mantine。グリッドより後に付いた)の代わり。
  const radixClosed = vi.fn();
  const mantineClosed = vi.fn();
  const onDocument = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.defaultPrevented) radixClosed();
  };
  const onWindow = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && (event.target as Element | null)?.getAttribute('data-mantine-stop-propagation') !== 'true') {
      mantineClosed();
    }
  };
  document.addEventListener('keydown', onDocument, true);
  window.addEventListener('keydown', onWindow, true);
  const detach = () => {
    document.removeEventListener('keydown', onDocument, true);
    window.removeEventListener('keydown', onWindow, true);
  };
  const dialogClosed = () => ({
    radix: radixClosed.mock.calls.length,
    mantine: mantineClosed.mock.calls.length,
    react: reactDialogEscape.mock.calls.length,
  });
  return { ref, ...utils, detach, dialogClosed };
};

const cellAt = (container: HTMLElement, row: number, col: number) =>
  container.querySelectorAll('[data-pane="center"].ssg-body-row')[row]?.querySelectorAll<HTMLElement>('.ssg-body-cell')[col];

const clickCell = (cell: HTMLElement) => {
  fireEvent.pointerDown(cell, { button: 0, pointerType: 'mouse', pointerId: 1 });
  fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
};

describe('ダイアログの中の Escape(AP-17)', () => {
  it('編集中の Escape は編集だけを取り消し、ダイアログは閉じない', () => {
    const { container, detach, dialogClosed } = setup();
    try {
      clickCell(cellAt(container, 0, 0)!);
      fireEvent.keyDown(document.activeElement!, { key: 'F2' });
      const editor = container.querySelector<HTMLInputElement>('.ssg-cell-editor-input')!;
      expect(editor).not.toBeNull();
      fireEvent.keyDown(editor, { key: 'Escape' });
      expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
      expect(dialogClosed()).toEqual({ radix: 0, mantine: 0, react: 0 });
    } finally {
      detach();
    }
  });

  it('範囲を選んでいるときの Escape は選択を外すだけ。1 セルを選んでいるだけならダイアログが閉じる', async () => {
    const { container, ref, detach, dialogClosed } = setup();
    try {
      clickCell(cellAt(container, 0, 0)!);
      act(() => {
        ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
      });
      fireEvent.keyDown(container.querySelector('.ssg-shell')!, { key: 'Escape' });
      expect(ref.current?.getSelection()).toBeNull();
      expect(dialogClosed()).toEqual({ radix: 0, mantine: 0, react: 0 });
      // Mantine 向けの印(data-mantine-stop-propagation)は次のタスクで外れる(実際の次のキー操作はその後)。
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(container.querySelector('.ssg-shell')?.hasAttribute('data-mantine-stop-propagation')).toBe(false);

      clickCell(cellAt(container, 1, 0)!);
      fireEvent.keyDown(container.querySelector('.ssg-shell')!, { key: 'Escape' });
      expect(dialogClosed()).toEqual({ radix: 1, mantine: 1, react: 1 });
    } finally {
      detach();
    }
  });

  it('列フィルターのポップオーバーの中の Escape はポップオーバーだけを閉じる', () => {
    const { container, detach, dialogClosed } = setup();
    try {
      const menuButton = container.querySelector<HTMLButtonElement>(
        '.ssg-header-row [data-ssg-col-key="name"] [data-ssg-tooltip="列メニュー"]',
      );
      expect(menuButton).not.toBeNull();
      act(() => {
        fireEvent.pointerDown(menuButton!, { button: 0 });
        fireEvent.click(menuButton!);
      });
      const filterItem = Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-menu-item')).find((item) =>
        item.textContent?.includes('フィルター…'),
      );
      expect(filterItem).toBeDefined();
      act(() => {
        fireEvent.click(filterItem!);
      });
      const popover = document.querySelector<HTMLElement>('.ssg-filter-popover');
      expect(popover).not.toBeNull();
      const checkbox = popover!.querySelector<HTMLElement>('input[type="checkbox"]')!;
      checkbox.focus();
      fireEvent.keyDown(checkbox, { key: 'Escape' });
      expect(document.querySelector('.ssg-filter-popover')).toBeNull();
      expect(dialogClosed()).toEqual({ radix: 0, mantine: 0, react: 0 });
    } finally {
      detach();
    }
  });

  // 1.0.1 のレビュー RA-6: 右クリックメニューとマウスで開いた列メニューは開くときにフォーカスを外すので、Escape の対象が
  //   body になり、印が付かずに Mantine の Modal が閉じていた。
  it('右クリックメニューとマウスで開いた列メニューの Escape はメニューだけを閉じる(フォーカスが body のとき)', async () => {
    const { container, detach, dialogClosed } = setup();
    try {
      fireEvent.contextMenu(cellAt(container, 1, 0)!, { clientX: 10, clientY: 10 });
      expect(document.querySelector('.ssg-menu-panel')).not.toBeNull();
      expect(document.activeElement).toBe(document.body);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(document.querySelector('.ssg-menu-panel')).toBeNull();
      expect(dialogClosed()).toEqual({ radix: 0, mantine: 0, react: 0 });

      const menuButton = container.querySelector<HTMLButtonElement>(
        '.ssg-header-row [data-ssg-col-key="name"] [data-ssg-tooltip="列メニュー"]',
      )!;
      act(() => {
        fireEvent.pointerDown(menuButton, { button: 0 });
        fireEvent.click(menuButton);
      });
      expect(document.querySelector('.ssg-menu-panel')).not.toBeNull();
      (document.activeElement as HTMLElement | null)?.blur();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(document.querySelector('.ssg-menu-panel')).toBeNull();
      expect(dialogClosed()).toEqual({ radix: 0, mantine: 0, react: 0 });

      // メニューが開いていないときの body の Escape には何もしない(ダイアログが閉じる)。Mantine 向けの印は次のタスクで外れる。
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(document.body.hasAttribute('data-mantine-stop-propagation')).toBe(false);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(dialogClosed()).toEqual({ radix: 1, mantine: 1, react: 0 });
    } finally {
      detach();
    }
  });
});