// 追加(F-2 / セル内検索): find prop の結合テストです。jsdom の layout スタブで本体行を描画し、openFind → 検索バー /
//   <mark> の強調 / 順送りでアクティブセルが動く / Esc で閉じる / onFindChange / 既定(無効)では Ctrl+F が効かないこと
//   を固定します。走査は時間分割なので await で流します。
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
  { id: 2, name: 'beta alpha', qty: 12 },
  { id: 3, name: 'gamma', qty: 30 },
];
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160 },
  { key: 'qty', title: '数量', width: 100, valueFormatter: ({ value }) => `${value}個` },
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

const flushScan = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  });
};
const marks = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.ssg-find-mark')).map((el) => ({
    text: el.textContent,
    current: el.classList.contains('ssg-find-mark--current'),
    row: el.closest('.ssg-body-row')?.getAttribute('data-row-key'),
  }));

describe('F-2: セル内検索(find)', () => {
  it('openFind でバーが出てヒットが強調され、findNext で順送り、Esc で閉じる', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onFindChange = vi.fn();
    const { container } = render(
      <SpreadsheetGrid<Row> ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} find onFindChange={onFindChange} />,
    );
    expect(container.querySelector('.ssg-find-bar')).toBeNull();
    act(() => {
      ref.current?.openFind('alpha');
    });
    expect(container.querySelector('.ssg-find-bar')).not.toBeNull();
    await flushScan();
    // 行 1 / 行 2 の name にヒット(大文字小文字を無視)。カレントは先頭。
    expect(marks(container)).toEqual([
      { text: 'alpha', current: true, row: '1' },
      { text: 'alpha', current: false, row: '2' },
    ]);
    expect(ref.current?.getActiveCell()).toEqual({ row: 0, col: 0 });
    expect(onFindChange).toHaveBeenLastCalledWith({ query: 'alpha', matchCount: 2, currentIndex: 0, open: true });
    expect(container.querySelector('.ssg-find-bar-count')?.textContent).toBe('1 / 2');
    act(() => {
      ref.current?.findNext();
    });
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 0 });
    expect(marks(container).map((m) => m.current)).toEqual([false, true]);
    // 整形後の文字列(「12個」)にもヒットする。
    act(() => {
      ref.current?.openFind('2個');
    });
    await flushScan();
    expect(marks(container)).toEqual([{ text: '2個', current: true, row: '2' }]);
    // Esc で閉じる(クエリと強調が消え、フォーカスはグリッド本体)。
    const input = container.querySelector('.ssg-find-bar-input') as HTMLInputElement;
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
    });
    expect(container.querySelector('.ssg-find-bar')).toBeNull();
    expect(marks(container)).toEqual([]);
    expect(onFindChange).toHaveBeenLastCalledWith({ query: '', matchCount: 0, currentIndex: null, open: false });
  });

  it('Ctrl+F は find が有効なときだけ横取りし、入力で再走査する', async () => {
    const { container } = render(<SpreadsheetGrid<Row> rows={rows} columns={columns} rowKeyGetter={(r) => r.id} find />);
    const shell = container.querySelector('.ssg-shell') as HTMLElement;
    act(() => {
      fireEvent.keyDown(shell, { key: 'f', ctrlKey: true });
    });
    expect(container.querySelector('.ssg-find-bar')).not.toBeNull();
    const input = container.querySelector('.ssg-find-bar-input') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'gam' } });
    });
    await flushScan();
    expect(marks(container)).toEqual([{ text: 'gam', current: true, row: '3' }]);
  });

  it('既定(find 未指定)では Ctrl+F で何も出ず、openFind も no-op', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<SpreadsheetGrid<Row> ref={ref} rows={rows} columns={columns} />);
    const shell = container.querySelector('.ssg-shell') as HTMLElement;
    const event = fireEvent.keyDown(shell, { key: 'f', ctrlKey: true });
    expect(event).toBe(true); // preventDefault されない(ブラウザ標準の検索に譲る)
    act(() => {
      ref.current?.openFind('a');
    });
    expect(container.querySelector('.ssg-find-bar')).toBeNull();
  });
});
