// 追加(1.3.0 / Solid 版の品質の段 2 S11-01〜05): Shadow DOM の中のグリッドの結合テストです。Shadow root の中では window /
//   document のリスナーが受けるイベントの target と document.activeElement が host に付け替わるため、ツールチップ・IME の直接
//   入力・メニューの ↑↓・ツールパネルのフォーカス・ポップアップの置き場が効いていなかった(core utils/shadowDom)。
//   実ブラウザでの確かめは audit/harness/t-shadow.mjs。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 160, filterType: 'text', cellNote: ({ row }) => (row.id === 1 ? 'メモ' : undefined) },
  { key: 'qty', title: 'Qty', width: 100, filterType: 'number' },
];
const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 10 },
  { id: 2, name: 'beta', qty: 20 },
];

let restore: () => void;
beforeAll(() => {
  restore = installJsdomLayoutStubs();
});
afterAll(() => {
  restore();
});

let host: HTMLElement | null = null;
afterEach(() => {
  cleanup();
  host?.remove();
  host = null;
});

const renderInShadow = (props: Partial<Parameters<typeof SpreadsheetGrid<Row>>[0]> = {}) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const appRoot = document.createElement('div');
  appRoot.className = 'app-root';
  shadowRoot.appendChild(appRoot);
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  render(
    <SpreadsheetGrid<Row>
      ref={ref}
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
    />,
    { container: appRoot },
  );
  const shell = shadowRoot.querySelector<HTMLElement>('.ssg-shell');
  if (!shell) {
    throw new Error('shell が見つかりません');
  }
  return { ref, shell, shadowRoot, appRoot };
};

const focusedLabel = (shadowRoot: ShadowRoot) => shadowRoot.activeElement?.textContent?.trim() ?? null;

describe('Shadow DOM の中のグリッド(S11-01〜05)', () => {
  it('既定(auto)ではポップアップを Shadow root の中(グリッドを包む要素)へ描き、列メニューの ↓ で 1 つずつ移る', async () => {
    const { ref, shell, shadowRoot, appRoot } = renderInShadow();
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    await act(async () => {
      fireEvent.keyDown(shell, { key: 'ArrowDown', altKey: true });
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    const menu = shadowRoot.querySelector<HTMLElement>('.ssg-menu-panel');
    expect(menu).not.toBeNull();
    expect(menu?.parentElement).toBe(appRoot);
    expect(document.body.querySelector('.ssg-menu-panel')).toBeNull();
    const items = Array.from(menu!.querySelectorAll<HTMLElement>('.ssg-menu-item:not(:disabled)'));
    expect(shadowRoot.activeElement).toBe(items[0]);
    act(() => {
      fireEvent.keyDown(shadowRoot.activeElement!, { key: 'ArrowDown' });
    });
    expect(shadowRoot.activeElement).toBe(items[1]);
    act(() => {
      fireEvent.keyDown(shadowRoot.activeElement!, { key: 'ArrowDown' });
    });
    expect(shadowRoot.activeElement).toBe(items[2]);
    act(() => {
      fireEvent.keyDown(shadowRoot.activeElement!, { key: 'ArrowUp' });
    });
    expect(shadowRoot.activeElement).toBe(items[1]);
  });

  it('Shift+F10 の右クリックメニューも ↓ で 1 つずつ移り、メニューの中を押しても閉じない', async () => {
    const { ref, shell, shadowRoot } = renderInShadow();
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 0 });
    });
    await act(async () => {
      fireEvent.keyDown(shell, { key: 'F10', shiftKey: true });
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    const menu = shadowRoot.querySelector<HTMLElement>('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(focusedLabel(shadowRoot)).toBe('いち');
    act(() => {
      fireEvent.keyDown(shadowRoot.activeElement!, { key: 'ArrowDown' });
    });
    expect(focusedLabel(shadowRoot)).toBe('に');
    act(() => {
      fireEvent.keyDown(shadowRoot.activeElement!, { key: 'ArrowDown' });
    });
    expect(focusedLabel(shadowRoot)).toBe('さん');
    // 中の項目の押し下げ(window で受けると target が host になり、外を押したと見て閉じていた)。
    act(() => {
      fireEvent.pointerDown(shadowRoot.activeElement!, { button: 0, pointerId: 1 });
    });
    expect(shadowRoot.querySelector('[role="menu"]')).not.toBeNull();
  });

  it('ツールパネルを開くと選ばれているタブへフォーカスが移り、Escape でグリッドへ戻る', async () => {
    const { ref, shell, shadowRoot } = renderInShadow();
    act(() => {
      shell.focus();
    });
    await act(async () => {
      ref.current?.openFilterManager();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    const panel = shadowRoot.querySelector<HTMLElement>('.ssg-toolpanel');
    expect(panel).not.toBeNull();
    const selectedTab = panel!.querySelector('[role="tab"][aria-selected="true"]');
    expect(shadowRoot.activeElement).toBe(selectedTab);
    await act(async () => {
      fireEvent.keyDown(shadowRoot.activeElement!, { key: 'Escape' });
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(shadowRoot.querySelector('.ssg-toolpanel--open')).toBeNull();
    expect(shell.contains(shadowRoot.activeElement)).toBe(true);
  });

  it('メモのツールチップが Shadow root の中に出る', () => {
    vi.useFakeTimers();
    try {
      const { shadowRoot } = renderInShadow();
      const cell = shadowRoot.querySelector<HTMLElement>('.ssg-body-cell[data-ssg-tooltip]');
      expect(cell).not.toBeNull();
      act(() => {
        // relatedTarget が同じ Shadow root の中だと、イベントは window まで届きません(Shadow root にも付けたリスナーで受ける)。
        cell!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, composed: true, relatedTarget: shadowRoot.querySelector('.ssg-shell') }));
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });
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
    fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
    expect(shadowRoot.activeElement).toBe(ime);
    fireEvent.compositionStart(ime!, { data: '' });
    ime!.value = 'テスト';
    fireEvent.input(ime!);
    await act(async () => {
      fireEvent.compositionEnd(ime!, { data: 'テスト' });
      await Promise.resolve();
    });
    const editor = shell.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
    expect(editor?.value).toBe('テスト');
  });
});