// 追加(audit RD-4): canEditCell の rowIndex がどの経路でもビュー行 index に揃い、第 5 引数で元 rows の index と
//   rowKey が渡ることの結合テストです。ソート中(view 0 = 元 rows の 2 行目)に、編集開始 / 確定 / 貼り付け /
//   Delete クリアのすべてで同じ (0, { sourceRowIndex: 2, rowKey: 3 }) が渡ることを確認します。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import type { Ref } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { CanEditCellContext, GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 160 },
  { key: 'qty', title: 'Qty', width: 100 },
];
const initialRows: Row[] = [
  { id: 1, name: 'alpha', qty: 10 },
  { id: 2, name: 'beta', qty: 20 },
  { id: 3, name: 'gamma', qty: 30 },
];

type CanEditCell = (
  rowIndex: number,
  colIndex: number,
  row: Row,
  column: GridColumn<Row>,
  ctx: CanEditCellContext,
) => boolean;

let latestRows: Row[] = initialRows;

function Harness({ gridRef, canEditCell }: { gridRef: Ref<SpreadsheetGridHandle<Row>>; canEditCell: CanEditCell }) {
  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    latestRows = rows;
  }, [rows]);
  return (
    <SpreadsheetGrid<Row>
      ref={gridRef}
      rows={rows}
      columns={columns}
      onRowsChange={setRows}
      rowKeyGetter={(row) => row.id}
      canEditCell={canEditCell}
    />
  );
}

const getShell = (container: HTMLElement): HTMLElement => {
  const shell = container.querySelector<HTMLElement>('.ssg-shell');
  if (!shell) {
    throw new Error('ssg-shell が見つかりません');
  }
  return shell;
};

describe('canEditCell の rowIndex(audit RD-4)', () => {
  let restore: () => void;
  beforeAll(() => {
    restore = installJsdomLayoutStubs();
  });
  afterAll(() => {
    restore();
  });
  afterEach(() => {
    cleanup();
    latestRows = initialRows;
  });

  const setup = (canEditCell: CanEditCell) => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const view = render(<Harness gridRef={ref} canEditCell={canEditCell} />);
    // name 降順: view 0 = gamma(元 rows の 2 / id 3)。
    act(() => {
      ref.current?.applyState({
        version: 2,
        columnWidths: {},
        filters: { globalText: '', columnFilters: {} },
        sort: [{ columnKey: 'name', direction: 'desc' }],
      });
    });
    act(() => {
      // 書き換えるのは Qty 列(ソートキーの Name を変えると行が並び替わり、再描画の呼び出しが混ざるため)。
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    return { ...view, ref, shell: getShell(view.container) };
  };

  // gamma 行の Qty セルへの呼び出しだけを取り出します。
  const callsForGammaQty = (spy: ReturnType<typeof vi.fn<CanEditCell>>) =>
    spy.mock.calls.filter(([, colIndex, row]) => row.id === 3 && colIndex === 1);

  const expectViewIndexArgs = (spy: ReturnType<typeof vi.fn<CanEditCell>>) => {
    const calls = callsForGammaQty(spy);
    expect(calls.length).toBeGreaterThan(0);
    for (const [rowIndex, , , , ctx] of calls) {
      expect(rowIndex).toBe(0);
      expect(ctx).toEqual({ sourceRowIndex: 2, rowKey: 3 });
    }
  };

  it('貼り付け(clientSide)は view index と元 rows の index / rowKey を渡す', () => {
    const spy = vi.fn<CanEditCell>(() => true);
    const { shell } = setup(spy);
    spy.mockClear();
    fireEvent.paste(shell, { clipboardData: { getData: () => 'PASTED' } });
    expectViewIndexArgs(spy);
    expect(latestRows[2].qty).toBe('PASTED');
  });

  it('Delete クリアも同じ引数(rowIndex = view index)', () => {
    const spy = vi.fn<CanEditCell>(() => true);
    const { shell } = setup(spy);
    spy.mockClear();
    fireEvent.keyDown(shell, { key: 'Delete' });
    expectViewIndexArgs(spy);
    expect(latestRows[2].qty).toBe('');
  });

  it('編集開始(印字キー)と確定も同じ引数', () => {
    const spy = vi.fn<CanEditCell>(() => true);
    const { shell } = setup(spy);
    spy.mockClear();
    fireEvent.keyDown(shell, { key: 'x' });
    expectViewIndexArgs(spy);
    const input = document.activeElement;
    expect(input?.tagName).toBe('INPUT');
    spy.mockClear();
    fireEvent.keyDown(input as Element, { key: 'Enter' });
    expectViewIndexArgs(spy);
    expect(latestRows[2].qty).toBe('x');
  });

  it('view index で弾く canEditCell(先頭行ロック)は貼り付けでも同じセルを弾く', () => {
    const lockFirstViewRow: CanEditCell = (rowIndex) => rowIndex !== 0;
    const { shell } = setup(lockFirstViewRow);
    fireEvent.paste(shell, { clipboardData: { getData: () => 'BLOCKED' } });
    expect(latestRows[2].qty).toBe(30);
    fireEvent.keyDown(shell, { key: 'Delete' });
    expect(latestRows[2].qty).toBe(30);
  });
});