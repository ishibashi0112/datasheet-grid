// 追加(1.0 前の最終チェック FC-03): ライブラリの合成列(行ドラッグハンドル / 展開トグル)があるときのコピーと貼り付けです。
//   コピーの TSV に合成列の空の列が入らないこと(Excel に貼ると 1 列ずれていた)、貼り付けでも合成列を 1 列と数えないこと
//   (合成列のセルから貼ると先頭のデータ列から書く)を固定します。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import type { Ref } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle, SpreadsheetGridProps } from './model/gridTypes';

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 100, editable: true },
  { key: 'qty', title: 'Qty', width: 100, editable: true, editor: { type: 'number' } },
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

let currentRows: Row[] = [];

function Harness({ gridRef, extra }: { gridRef: Ref<SpreadsheetGridHandle<Row>>; extra: Partial<SpreadsheetGridProps<Row>> }) {
  const [rows, setRows] = useState<Row[]>([
    { id: 1, name: 'a', qty: 1 },
    { id: 2, name: 'b', qty: 2 },
  ]);
  useEffect(() => {
    currentRows = rows;
  }, [rows]);
  return <SpreadsheetGrid ref={gridRef} rows={rows} onRowsChange={setRows} columns={columns} rowKeyGetter={(r) => r.id} {...extra} />;
}

const VARIANTS: [string, Partial<SpreadsheetGridProps<Row>>][] = [
  ['合成列なし', {}],
  ['行ドラッグ', { enableRowDrag: true }],
  ['展開行 + 行ドラッグ', { enableRowDrag: true, detailRow: { render: () => null } }],
];

const setup = (extra: Partial<SpreadsheetGridProps<Row>>) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const { container } = render(<Harness gridRef={ref} extra={extra} />);
  const shell = container.querySelector<HTMLElement>('.ssg-shell')!;
  return { ref, shell };
};

const copy = async (shell: HTMLElement) => {
  await act(async () => {
    fireEvent.keyDown(shell, { key: 'c', ctrlKey: true });
    await Promise.resolve();
  });
  return writeText.mock.calls[writeText.mock.calls.length - 1]?.[0] as string | undefined;
};

describe('FC-03: 合成列はコピー / 貼り付けの列に数えない', () => {
  it.each(VARIANTS)('%s: Ctrl+A → Ctrl+C の TSV に空の列が入らない', async (_name, extra) => {
    const { ref, shell } = setup(extra);
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 0 });
    });
    act(() => {
      fireEvent.keyDown(shell, { key: 'a', ctrlKey: true });
    });
    expect(await copy(shell)).toBe('a\t1\nb\t2');
  });

  it.each(VARIANTS)('%s: 合成列を含むセル範囲のコピーも合成列を出さない', async (_name, extra) => {
    const { ref, shell } = setup(extra);
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
    });
    const synthetic = (extra.enableRowDrag ? 1 : 0) + (extra.detailRow ? 1 : 0);
    const callsBefore = writeText.mock.calls.length;
    const text = await copy(shell);
    // 範囲の先頭 2 列のうち合成列のぶんだけデータ列が減る(合成列だけの範囲なら何もコピーしない)
    if (synthetic === 2) {
      expect(writeText.mock.calls.length).toBe(callsBefore);
    } else {
      expect(text).toBe(synthetic === 0 ? 'a\t1\nb\t2' : 'a\nb');
    }
  });

  it.each(VARIANTS)('%s: 合成列のセルから貼ると先頭のデータ列から書く', (_name, extra) => {
    const { ref, shell } = setup(extra);
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 0 });
    });
    fireEvent.paste(shell, { clipboardData: { getData: () => 'X\t9\nY\t8' } });
    expect(currentRows).toEqual([
      { id: 1, name: 'X', qty: 9 },
      { id: 2, name: 'Y', qty: 8 },
    ]);
  });
});