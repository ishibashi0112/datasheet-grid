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

  // 追加(1.1.0 / AP-07 の見直し): transform のあるダイアログ(fixed の基準がダイアログになる)を、位置を測る要素
  //   (position: fixed / 大きさ 0)の getBoundingClientRect で模す。パネルは打ち消し、メニューの中に absolute で置く
  //   「列の固定」の小メニューは打ち消さない(打ち消すとパネルの画面の位置ぶん飛んでいた)。
  it('ダイアログの中の列メニューは位置のずれを打ち消し、「列の固定」の小メニューは打ち消さない', () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.style.position === 'fixed' && this.style.width === '0px') {
        return { left: 400, top: 150, right: 400, bottom: 150, width: 0, height: 0, x: 400, y: 150, toJSON: () => ({}) } as DOMRect;
      }
      return original.call(this);
    };
    // 画面の高さに収まらないと小メニューは項目の下に開く(1.1.0 の確かめ直し X-1)ので、横に開く高さにします。
    const originalInnerHeight = window.innerHeight;
    window.innerHeight = 2000;
    try {
      const { ref, shell } = renderIn('dialog');
      const menu = openColumnMenu(ref, shell);
      expect(menu?.style.getPropertyValue('translate')).toBe('-400px -150px');
      const pin = Array.from(menu!.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((item) => item.textContent?.includes('列の固定'));
      act(() => {
        fireEvent.click(pin!);
      });
      const submenu = menu!.querySelector<HTMLElement>('.ssg-menu-panel');
      expect(submenu).not.toBeNull();
      expect(submenu!.style.getPropertyValue('translate')).toBe('');
    } finally {
      window.innerHeight = originalInnerHeight;
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });
});