// 追加(Solid 版 0.1.2 / 品質の段 2 S11-01〜05): Shadow DOM の中のグリッド。React 版の
//   SpreadsheetGrid.shadowDom.integration.test.tsx と同じ操作で、ツールチップ・IME の直接入力・メニューの ↑↓・ツールパネルの
//   フォーカス・ポップアップの置き場を確かめます(処理は core utils/shadowDom。実ブラウザは audit/harness/t-shadow.mjs)。
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flush } from 'solid-js';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle, type SpreadsheetGridProps } from './index';

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 160, filterType: 'text', cellNote: ({ row }) => (row.id === 1 ? 'メモ' : undefined) },
  { key: 'qty', title: 'Qty', width: 100, filterType: 'number' },
];
const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 10 },
  { id: 2, name: 'beta', qty: 20 },
];

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

let host: HTMLElement | null = null;
afterEach(() => {
  cleanup();
  host?.remove();
  host = null;
});

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

const renderInShadow = (props: Partial<SpreadsheetGridProps<Row>> = {}) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const appRoot = document.createElement('div');
  appRoot.className = 'app-root';
  shadowRoot.appendChild(appRoot);
  let handle: SpreadsheetGridHandle<Row> | undefined;
  render(
    () => (
      <SpreadsheetGrid<Row>
        ref={(h) => {
          handle = h;
        }}
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        enableContextMenu
        getContextMenuItems={() => [
          { kind: 'action', label: 'いち', onSelect: () => {} },
          { kind: 'action', label: 'に', onSelect: () => {} },
          { kind: 'action', label: 'さん', onSelect: () => {} },
        ]}
        {...props}
      />
    ),
    { container: appRoot },
  );
  flush();
  const shell = shadowRoot.querySelector<HTMLElement>('.ssg-shell');
  if (!shell || !handle) {
    throw new Error('shell が見つかりません');
  }
  return { handle, shell, shadowRoot, appRoot };
};

const focusedLabel = (shadowRoot: ShadowRoot) => shadowRoot.activeElement?.textContent?.trim() ?? null;

const keyDown = (target: Element, init: KeyboardEventInit) => {
  fireEvent.keyDown(target, init);
  flush();
};

describe('Shadow DOM の中のグリッド(S11-01〜05)', () => {
  it('既定(auto)ではポップアップを Shadow root の中(グリッドを包む要素)へ描き、列メニューの ↓ で 1 つずつ移る', async () => {
    const { handle, shell, shadowRoot, appRoot } = renderInShadow();
    handle.setActiveCell({ row: 0, col: 1 });
    flush();
    keyDown(shell, { key: 'ArrowDown', altKey: true });
    await nextFrame();
    flush();
    const menu = shadowRoot.querySelector<HTMLElement>('.ssg-menu-panel');
    expect(menu).not.toBeNull();
    expect(menu?.parentElement).toBe(appRoot);
    expect(document.body.querySelector('.ssg-menu-panel')).toBeNull();
    const items = Array.from(menu!.querySelectorAll<HTMLElement>('.ssg-menu-item:not(:disabled)'));
    expect(shadowRoot.activeElement).toBe(items[0]);
    keyDown(shadowRoot.activeElement!, { key: 'ArrowDown' });
    expect(shadowRoot.activeElement).toBe(items[1]);
    keyDown(shadowRoot.activeElement!, { key: 'ArrowDown' });
    expect(shadowRoot.activeElement).toBe(items[2]);
    keyDown(shadowRoot.activeElement!, { key: 'ArrowUp' });
    expect(shadowRoot.activeElement).toBe(items[1]);
  });

  it('Shift+F10 の右クリックメニューも ↓ で 1 つずつ移り、メニューの中を押しても閉じない', async () => {
    const { handle, shell, shadowRoot } = renderInShadow();
    handle.setActiveCell({ row: 0, col: 0 });
    flush();
    keyDown(shell, { key: 'F10', shiftKey: true });
    await nextFrame();
    flush();
    expect(shadowRoot.querySelector('[role="menu"]')).not.toBeNull();
    expect(focusedLabel(shadowRoot)).toBe('いち');
    keyDown(shadowRoot.activeElement!, { key: 'ArrowDown' });
    expect(focusedLabel(shadowRoot)).toBe('に');
    keyDown(shadowRoot.activeElement!, { key: 'ArrowDown' });
    expect(focusedLabel(shadowRoot)).toBe('さん');
    fireEvent.pointerDown(shadowRoot.activeElement!, { button: 0, pointerId: 1 });
    flush();
    expect(shadowRoot.querySelector('[role="menu"]')).not.toBeNull();
  });

  it('ツールパネルを開くと選ばれているタブへフォーカスが移り、Escape でグリッドへ戻る', async () => {
    const { handle, shell, shadowRoot } = renderInShadow();
    shell.focus();
    handle.openFilterManager();
    flush();
    await nextFrame();
    flush();
    const panel = shadowRoot.querySelector<HTMLElement>('.ssg-toolpanel');
    expect(panel).not.toBeNull();
    const selectedTab = panel!.querySelector('[role="tab"][aria-selected="true"]');
    expect(shadowRoot.activeElement).toBe(selectedTab);
    keyDown(shadowRoot.activeElement!, { key: 'Escape' });
    await nextFrame();
    flush();
    expect(shadowRoot.querySelector('.ssg-toolpanel--open')).toBeNull();
    expect(shell.contains(shadowRoot.activeElement)).toBe(true);
  });

  it('メモのツールチップが Shadow root の中に出る', () => {
    vi.useFakeTimers();
    try {
      const { shadowRoot } = renderInShadow();
      const cell = shadowRoot.querySelector<HTMLElement>('.ssg-body-cell[data-ssg-tooltip]');
      expect(cell).not.toBeNull();
      // relatedTarget が同じ Shadow root の中だと、イベントは window まで届きません(Shadow root にも付けたリスナーで受ける)。
      cell!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, composed: true, relatedTarget: shadowRoot.querySelector('.ssg-shell') }));
      flush();
      vi.advanceTimersByTime(400);
      flush();
      const tooltip = shadowRoot.querySelector('.ssg-tooltip');
      expect(tooltip?.classList.contains('ssg-tooltip--visible')).toBe(true);
      expect(tooltip?.textContent).toContain('メモ');
    } finally {
      vi.useRealTimers();
    }
  });

  it('imeDirectInput: 入力受けで変換を確定すると、その文字で編集が始まる', async () => {
    const { shell, shadowRoot } = renderInShadow({ imeDirectInput: true });
    const ime = shadowRoot.querySelector<HTMLInputElement>('[data-ssg-ime-input]');
    expect(ime).not.toBeNull();
    const cell = shadowRoot.querySelectorAll('[data-pane="center"].ssg-body-row')[1]?.querySelector<HTMLElement>('.ssg-body-cell');
    fireEvent.pointerDown(cell!, { button: 0, pointerType: 'mouse', pointerId: 1 });
    flush();
    fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
    flush();
    expect(shadowRoot.activeElement).toBe(ime);
    fireEvent.compositionStart(ime!, { data: '' });
    ime!.value = 'テスト';
    fireEvent.input(ime!);
    fireEvent.compositionEnd(ime!, { data: 'テスト' });
    await Promise.resolve();
    flush();
    const editor = shell.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
    expect(editor?.value).toBe('テスト');
  });
});