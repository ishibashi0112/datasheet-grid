// 追加(motion-0): motion prop('auto' | 'on' | 'off')の配線テストです(jsdom)。
//   実効値が 'off' のとき root とポータル root(ツールパネル)へ .ssg-motion-off が付くこと、'auto' が
//   prefers-reduced-motion の一致状態に従うことを固定します。継続時間トークン(CSS)は jsdom では検証できません。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createRef } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      ResizeObserverStub;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 160, filterType: 'text' },
  { key: 'qty', title: 'Qty', width: 100 },
];

const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 10 },
  { id: 2, name: 'beta', qty: 20 },
];

// matchMedia のフェイク(reduce の一致状態を固定。change は本テストでは不要)。
function stubReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const rootHasOff = (container: HTMLElement) =>
  container.querySelector('.ssg-root')?.classList.contains('ssg-motion-off') ?? false;

describe('motion-0: motion prop の配線', () => {
  it('既定(未指定)では root に ssg-motion-off が付かない(jsdom 素 = 低減なし)', () => {
    const { container } = render(<SpreadsheetGrid columns={columns} rows={rows} />);
    expect(container.querySelector('.ssg-root')).not.toBeNull();
    expect(rootHasOff(container)).toBe(false);
  });

  it("motion='off' で root に ssg-motion-off が付く", () => {
    const { container } = render(
      <SpreadsheetGrid columns={columns} rows={rows} motion="off" />,
    );
    expect(rootHasOff(container)).toBe(true);
  });

  it("motion='auto' は prefers-reduced-motion: reduce が有効なら off、'on' は OS 設定を無視する", () => {
    stubReducedMotion(true);
    const auto = render(<SpreadsheetGrid columns={columns} rows={rows} motion="auto" />);
    expect(rootHasOff(auto.container)).toBe(true);
    auto.unmount();
    const on = render(<SpreadsheetGrid columns={columns} rows={rows} motion="on" />);
    expect(rootHasOff(on.container)).toBe(false);
  });

  it("motion='off' はポータル root(ツールパネル)にも ssg-motion-off が付く(テーマ修飾子と同じ配線)", () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <SpreadsheetGrid ref={ref} columns={columns} rows={rows} motion="off" theme="dark" />,
    );
    act(() => {
      ref.current?.openFilterManager();
    });
    const panel = document.querySelector('.ssg-toolpanel');
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains('ssg-motion-off')).toBe(true);
    // 既存のテーマ修飾子はそのまま付く(両立)。
    expect(panel?.classList.contains('ssg-theme-dark')).toBe(true);
    act(() => {
      ref.current?.closeFilterManager();
    });
  });

  it("motion='on' ではポータル root に ssg-motion-off が付かない", () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} motion="on" />);
    act(() => {
      ref.current?.openFilterManager();
    });
    const panel = document.querySelector('.ssg-toolpanel');
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains('ssg-motion-off')).toBe(false);
    act(() => {
      ref.current?.closeFilterManager();
    });
  });
});
