// 追加(段階 2 DF-23): ポップオーバーを開いたまま、クリック以外(element.click() やショートカット)で display: none のタブへ
//   切り替えてグリッドを隠すと、ポップオーバーが別の画面の上に残っていました。グリッドが 0 × 0 になったら閉じます。
//   jsdom にはレイアウトが無いので、ResizeObserver の通知と getBoundingClientRect を差し替えて「隠れた」を作ります。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string; qty: number };

const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 3 },
  { id: 2, name: 'beta', qty: 1 },
];

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 160, filterType: 'text' },
  { key: 'qty', title: 'Qty', width: 100, filterType: 'number' },
];

type Callback = (entries: unknown[], observer: unknown) => void;
const observers: { callback: Callback; targets: Element[] }[] = [];
let hidden = false;
let restore: () => void;
let originalRect: () => DOMRect;

beforeAll(() => {
  restore = installJsdomLayoutStubs();
  // スタブの ResizeObserver(observe で今の大きさを即時に通知)を包み、後から「隠れた」通知を送れるようにします。
  const Base = globalThis.ResizeObserver as unknown as new (callback: Callback) => {
    observe: (target: Element) => void;
    disconnect: () => void;
  };
  class RecordingResizeObserver {
    private readonly base: InstanceType<typeof Base>;
    private readonly record: { callback: Callback; targets: Element[] };
    constructor(callback: Callback) {
      this.base = new Base(callback);
      this.record = { callback, targets: [] };
      observers.push(this.record);
    }
    observe(target: Element): void {
      this.record.targets.push(target);
      this.base.observe(target);
    }
    unobserve(): void {}
    disconnect(): void {
      this.record.targets = [];
    }
  }
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = RecordingResizeObserver;
  originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return hidden ? ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 } as DOMRect) : originalRect.call(this);
  };
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = originalRect;
  restore();
});
afterEach(() => {
  cleanup();
  hidden = false;
  observers.length = 0;
});

// display: none のタブへ切り替えたときのように、見張っているすべての要素へ 0 × 0 を通知します。
const hideGrid = () => {
  hidden = true;
  act(() => {
    for (const { callback, targets } of [...observers]) {
      for (const target of targets) {
        callback([{ target, contentRect: { width: 0, height: 0, top: 0, left: 0 }, borderBoxSize: [{ inlineSize: 0, blockSize: 0 }], contentBoxSize: [{ inlineSize: 0, blockSize: 0 }] }], {});
      }
    }
  });
};

const setup = () => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const { container } = render(
    <SpreadsheetGrid<Row> ref={ref} rows={rows} columns={columns} rowKeyGetter={(row) => row.id} enableColumnMenu enableColumnFilter height={300} />,
  );
  const shell = container.querySelector<HTMLElement>('.ssg-shell')!;
  return { ref, shell };
};

describe('グリッドが隠れたらポップオーバーを閉じる(DF-23)', () => {
  it('列メニュー', () => {
    const { ref, shell } = setup();
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    act(() => {
      fireEvent.keyDown(shell, { key: 'ArrowDown', altKey: true });
    });
    expect(document.querySelector('.ssg-menu-panel')).not.toBeNull();
    hideGrid();
    expect(document.querySelector('.ssg-menu-panel')).toBeNull();
  });

  it('列フィルター', () => {
    const { ref, shell } = setup();
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    act(() => {
      fireEvent.keyDown(shell, { key: 'ArrowDown', altKey: true });
    });
    const filterItem = Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-menu-item')).find((item) =>
      item.textContent?.includes('フィルター…'),
    );
    act(() => {
      fireEvent.click(filterItem!);
    });
    expect(document.querySelector('.ssg-filter-popover')).not.toBeNull();
    hideGrid();
    expect(document.querySelector('.ssg-filter-popover')).toBeNull();
  });

  it('ツールパネル(絞り込みの管理)', () => {
    const { ref } = setup();
    act(() => {
      ref.current?.openFilterManager();
    });
    expect(document.querySelector('.ssg-toolpanel')).not.toBeNull();
    hideGrid();
    expect(document.querySelector('.ssg-toolpanel')).toBeNull();
  });

  it('大きさが変わっただけでは閉じない', () => {
    const { ref, shell } = setup();
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    act(() => {
      fireEvent.keyDown(shell, { key: 'ArrowDown', altKey: true });
    });
    act(() => {
      for (const { callback, targets } of [...observers]) {
        for (const target of targets) {
          callback([{ target, contentRect: { width: 500, height: 300, top: 0, left: 0 }, borderBoxSize: [{ inlineSize: 500, blockSize: 300 }], contentBoxSize: [{ inlineSize: 500, blockSize: 300 }] }], {});
        }
      }
    });
    expect(document.querySelector('.ssg-menu-panel')).not.toBeNull();
  });
});