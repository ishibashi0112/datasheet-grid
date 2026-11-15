// 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-07): ポップアップを描く場所(popupContainer)の結合テストです。
//   既定('auto')はグリッドを囲むダイアログの中、無ければ body。'body' / 要素 / 関数で変えられる。実ブラウザでの位置と押せることは
//   ハーネス audit/harness/t-popups.mjs(素の <dialog> の showModal() と Radix の Dialog の模擬)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, GridPopupContainer, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 160, filterType: 'text' },
  { key: 'qty', title: 'Qty', width: 100, filterType: 'number' },
];
const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 10 },
  { id: 2, name: 'beta', qty: 20 },
];

const renderIn = (wrap: 'dialog' | 'plain', popupContainer?: GridPopupContainer) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const grid = (
    <SpreadsheetGrid<Row>
      ref={ref}
      rows={rows}
      columns={columns}
      rowKeyGetter={(row) => row.id}
      enableContextMenu
      getContextMenuItems={() => [{ kind: 'action', label: 'A', onSelect: () => {} }]}
      popupContainer={popupContainer}
    />
  );
  const view = render(
    wrap === 'dialog' ? (
      <div role="dialog" data-testid="host">
        <div>{grid}</div>
      </div>
    ) : (
      <div data-testid="host">{grid}</div>
    ),
  );
  const shell = view.container.querySelector<HTMLElement>('.ssg-shell');
  if (!shell) {
    throw new Error('shell が見つかりません');
  }
  return { ...view, ref, shell, host: view.getByTestId('host') };
};

const openColumnMenu = (ref: ReturnType<typeof renderIn>['ref'], shell: HTMLElement) => {
  act(() => {
    ref.current?.setActiveCell({ row: 0, col: 1 });
  });
  act(() => {
    fireEvent.keyDown(shell, { key: 'ArrowDown', altKey: true });
  });
  return document.querySelector<HTMLElement>('.ssg-menu-panel');
};

describe('popupContainer(AP-07)', () => {
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

  it('既定ではグリッドを囲むダイアログの中に列メニュー・右クリックメニュー・ツールパネルを描く', () => {
    const { ref, shell, host, container } = renderIn('dialog');
    const menu = openColumnMenu(ref, shell);
    expect(menu?.parentElement).toBe(host);
    act(() => {
      fireEvent.keyDown(menu!, { key: 'Escape' });
    });
    const cell = container.querySelector<HTMLElement>('[data-row-index="0"] [data-ssg-col-key="name"]');
    act(() => {
      fireEvent.contextMenu(cell!, { clientX: 10, clientY: 10, button: 2 });
    });
    expect(document.querySelector('.ssg-menu-panel')?.parentElement).toBe(host);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    act(() => {
      ref.current?.openFilterManager();
    });
    expect(document.querySelector('.ssg-toolpanel')?.parentElement).toBe(host);
  });

  it('ダイアログの外では今までどおり body の直下', () => {
    const { ref, shell } = renderIn('plain');
    expect(openColumnMenu(ref, shell)?.parentElement).toBe(document.body);
  });

  it("'body' / 要素 / 関数で描く場所を変えられる", () => {
    const body = renderIn('dialog', 'body');
    expect(openColumnMenu(body.ref, body.shell)?.parentElement).toBe(document.body);
    cleanup();

    const target = document.createElement('div');
    document.body.appendChild(target);
    const element = renderIn('dialog', target);
    expect(openColumnMenu(element.ref, element.shell)?.parentElement).toBe(target);
    cleanup();

    const picked: HTMLElement[] = [];
    const fn = renderIn('plain', (gridElement) => {
      picked.push(gridElement);
      return target;
    });
    expect(openColumnMenu(fn.ref, fn.shell)?.parentElement).toBe(target);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.every((element) => element.classList.contains('ssg-shell'))).toBe(true);
    cleanup();
    target.remove();
  });

  it('閉じている間は関数を呼ばない', () => {
    let calls = 0;
    renderIn('plain', () => {
      calls += 1;
      return null;
    });
    expect(calls).toBe(0);
  });
});