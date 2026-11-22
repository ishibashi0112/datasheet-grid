// 追加(1.3.0 / Solid 版の品質の段 2 S7-03 / S8-04): 編集していた行が表から消えたときの終わり方の結合テストです。
//   これまでは知らせなく編集を終え(打ちかけは捨てる)、エディタと一緒にフォーカスも消えて body に落ちていた。
//   行がまだ rows にある(絞り込みから外れた)→ 打ちかけを確定してその行へ書く。rows に無い(rows が別の行に替わった)→
//   取り消す。どちらもフォーカスはグリッドに残る(core controllers/editController の finishLostEdit)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent, waitFor } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import type { Ref } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle, SpreadsheetGridProps } from './model/gridTypes';

type Row = { id: number; name: string; memo: string; qty?: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160 },
  { key: 'memo', title: 'メモ', width: 160 },
];
const initialRows: Row[] = [
  { id: 1, name: 'alpha', memo: 'a' },
  { id: 2, name: 'beta', memo: 'b' },
  { id: 3, name: 'gamma', memo: 'c' },
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

let currentRows: Row[] = [];
let changeCount = 0;
let replaceRows: (rows: Row[]) => void = () => {};

function Harness({ gridRef, extra }: { gridRef: Ref<SpreadsheetGridHandle<Row>>; extra?: Partial<SpreadsheetGridProps<Row>> }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  useEffect(() => {
    replaceRows = setRows;
  }, []);
  useEffect(() => {
    currentRows = rows;
  }, [rows]);
  return (
    <SpreadsheetGrid<Row>
      ref={gridRef}
      columns={columns}
      rows={rows}
      onRowsChange={(next) => {
        changeCount += 1;
        setRows(next);
      }}
      rowKeyGetter={(row) => row.id}
      {...extra}
    />
  );
}

const setup = (extra?: Partial<SpreadsheetGridProps<Row>>) => {
  changeCount = 0;
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const utils = render(<Harness gridRef={ref} extra={extra} />);
  const shell = utils.container.querySelector<HTMLElement>('.ssg-shell')!;
  return { ...utils, ref, shell };
};

const editorInput = (container: HTMLElement) => container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');

const startEditing = (container: HTMLElement, shell: HTMLElement, rowIndex: number, key: string, value: string) => {
  const cell = container.querySelector<HTMLElement>(`.ssg-body-row[data-row-index="${rowIndex}"] [data-ssg-col-key="${key}"]`);
  act(() => {
    fireEvent.pointerDown(cell!, { button: 0, pointerType: 'mouse', pointerId: 1 });
    fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
  });
  act(() => {
    fireEvent.keyDown(shell, { key: 'F2' });
  });
  const editor = editorInput(container);
  expect(editor).not.toBeNull();
  expect(document.activeElement).toBe(editor);
  fireEvent.change(editor!, { target: { value } });
};

describe('S7-03 / S8-04: 編集していた行が表から消えたとき', () => {
  it('絞り込みから外れた行は、打ちかけを確定してその行へ書き、フォーカスはグリッドに残る', async () => {
    const { container, ref, shell } = setup();
    startEditing(container, shell, 1, 'memo', '打ちかけ');
    act(() => {
      ref.current?.applyState({ filters: { globalText: 'alpha' } });
    });
    await waitFor(() => expect(editorInput(container)).toBeNull());
    expect(currentRows[1]).toEqual({ id: 2, name: 'beta', memo: '打ちかけ' });
    expect(changeCount).toBe(1);
    expect(document.activeElement).toBe(shell);
  });

  it('number 列の打ちかけも、絞り込みから外れた行へ数値で書く', async () => {
    const numberColumns: GridColumn<Row>[] = [
      { key: 'name', title: '名前', width: 160 },
      { key: 'memo', title: 'メモ', width: 160 },
      { key: 'qty', title: '数', width: 100, editor: { type: 'number' } },
    ];
    const { container, ref, shell } = setup({ columns: numberColumns });
    startEditing(container, shell, 2, 'qty', '42');
    act(() => {
      ref.current?.applyState({ filters: { globalText: 'alpha' } });
    });
    await waitFor(() => expect(editorInput(container)).toBeNull());
    expect(currentRows[2]?.qty).toBe(42);
    expect(document.activeElement).toBe(shell);
  });

  it('rows がすべて別の行に替わったら取り消し(書かない)、フォーカスはグリッドに残ってキー操作が効く', async () => {
    const { container, ref, shell } = setup();
    startEditing(container, shell, 1, 'memo', '打ちかけ');
    act(() => {
      replaceRows([
        { id: 11, name: 'x', memo: 'x' },
        { id: 12, name: 'y', memo: 'y' },
        { id: 13, name: 'z', memo: 'z' },
      ]);
    });
    await waitFor(() => expect(editorInput(container)).toBeNull());
    expect(changeCount).toBe(0);
    expect(currentRows.map((row) => row.memo)).toEqual(['x', 'y', 'z']);
    expect(document.activeElement).toBe(shell);
    act(() => {
      fireEvent.keyDown(shell, { key: 'ArrowDown' });
    });
    expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: 1 });
  });

  it('readOnly に替わった行など、書けないときは書かずに終える', async () => {
    const { container, ref, shell } = setup({ canEditCell: (_rowIndex, _colIndex, row) => row.id !== 2 || row.memo === 'b' });
    startEditing(container, shell, 1, 'memo', '打ちかけ');
    // 打ちかけのまま、同じ行が別の値で差し替わってから(canEditCell が false)、絞り込みで外れる。
    act(() => {
      replaceRows(initialRows.map((row) => (row.id === 2 ? { ...row, memo: 'changed' } : row)));
    });
    act(() => {
      ref.current?.applyState({ filters: { globalText: 'alpha' } });
    });
    await waitFor(() => expect(editorInput(container)).toBeNull());
    expect(changeCount).toBe(0);
    expect(currentRows[1]?.memo).toBe('changed');
    expect(document.activeElement).toBe(shell);
  });
});