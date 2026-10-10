// 追加(motion-4 / M-3): コピー範囲の動く点線(showCopyRange)の結合テストです。jsdom の layout スタブで本体行を描画し、
//   Ctrl+C → .ssg-copy-range-overlay が出ること、Esc / 編集開始で消えること、ビュー形状(ソート)の変化で描画しなく
//   なること、showCopyRange=false で出ないことを固定します。点線のアニメ(CSS)は jsdom では検証できません。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string; qty: number };

const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 5 },
  { id: 2, name: 'beta', qty: 12 },
  { id: 3, name: 'gamma', qty: 30 },
];

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160, editable: true },
  { key: 'qty', title: '数量', width: 100, editable: true },
];

let restore: () => void;
let writeText: ReturnType<typeof vi.fn>;
beforeAll(() => {
  restore = installJsdomLayoutStubs();
  writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterAll(() => {
  restore();
});
afterEach(() => {
  cleanup();
  writeText.mockClear();
});

const overlays = () => document.querySelectorAll('.ssg-copy-range-overlay');
const shell = (container: HTMLElement) => container.querySelector('.ssg-shell') as HTMLElement;

async function copySelection(container: HTMLElement, ref: React.RefObject<SpreadsheetGridHandle<Row> | null>) {
  act(() => {
    ref.current?.selectCell(0, 0);
    ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
  });
  await act(async () => {
    fireEvent.keyDown(shell(container), { key: 'c', ctrlKey: true });
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('motion-4: コピー範囲の動く点線(showCopyRange)', () => {
  it('Ctrl+C でコピー元の範囲に点線オーバーレイが出て、Esc で消える', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<SpreadsheetGrid<Row> ref={ref} rows={rows} columns={columns} />);
    expect(overlays()).toHaveLength(0);
    await copySelection(container, ref);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(overlays().length).toBeGreaterThan(0);
    act(() => {
      fireEvent.keyDown(shell(container), { key: 'Escape' });
    });
    expect(overlays()).toHaveLength(0);
  });

  it('編集を始めると消える(貼り付け先の移動では残る)', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<SpreadsheetGrid<Row> ref={ref} rows={rows} columns={columns} />);
    await copySelection(container, ref);
    expect(overlays().length).toBeGreaterThan(0);
    // アクティブセルの移動では残る。
    act(() => {
      ref.current?.selectCell(2, 1);
    });
    expect(overlays().length).toBeGreaterThan(0);
    // 編集開始(Enter)で消える。
    act(() => {
      fireEvent.keyDown(shell(container), { key: 'Enter' });
    });
    expect(overlays()).toHaveLength(0);
  });

  it('ソートでビュー形状が変わると描画しなくなる', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<SpreadsheetGrid<Row> ref={ref} rows={rows} columns={columns} />);
    await copySelection(container, ref);
    expect(overlays().length).toBeGreaterThan(0);
    act(() => {
      ref.current?.applyState({ ...ref.current.getState(), sort: [{ columnKey: 'qty', direction: 'desc' }] });
    });
    expect(overlays()).toHaveLength(0);
  });

  it('showCopyRange=false では点線を出さない(コピー自体は行う)', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <SpreadsheetGrid<Row> ref={ref} rows={rows} columns={columns} showCopyRange={false} />,
    );
    await copySelection(container, ref);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(overlays()).toHaveLength(0);
  });
});
