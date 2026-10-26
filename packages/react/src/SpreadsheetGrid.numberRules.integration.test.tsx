// 追加(数値の検査): number エディタの min / max / integer による組み込みの検査を、SpreadsheetGrid を render して
//   確かめる結合テストです(validate の無い列でもセルに印とメッセージが出る / reject の列はエディタの確定を止める /
//   validate の NG が先(利用側のメッセージを優先)/ getInvalidCells が拾う / showValidationMarks=false で印を出さない)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import type { Ref } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle, SpreadsheetGridProps } from './model/gridTypes';

type Row = { id: number; qty: unknown; price: unknown };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  // mark(既定)。validate は無い。
  { key: 'qty', title: '在庫数', width: 100, editable: true, editor: { type: 'number', min: 0, integer: true } },
  // reject + validate(validate の NG が先で、通した値だけ組み込みの検査)。
  {
    key: 'price',
    title: '単価',
    width: 100,
    editable: true,
    editor: { type: 'number', min: 1, max: 9999 },
    validate: ({ value }) => (typeof value === 'number' && value < 0 ? 'マイナスは入力できません' : true),
    validationMode: 'reject',
  },
];

const initialRows: Row[] = [
  { id: 1, qty: 10, price: 100 },
  { id: 2, qty: -3, price: 200 },
  { id: 3, qty: 2.5, price: 300 },
];

let currentRows: Row[] = initialRows;

function Harness({
  gridRef,
  ...props
}: { gridRef: Ref<SpreadsheetGridHandle<Row>> } & Partial<SpreadsheetGridProps<Row>>) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  useEffect(() => {
    currentRows = rows;
  }, [rows]);
  return (
    <SpreadsheetGrid
      ref={gridRef}
      columns={columns}
      rows={rows}
      onRowsChange={setRows}
      rowKeyGetter={(row) => row.id}
      {...props}
    />
  );
}

const setup = (props: Partial<SpreadsheetGridProps<Row>> = {}) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const view = render(<Harness gridRef={ref} {...props} />);
  const shell = view.container.querySelector<HTMLElement>('.ssg-shell');
  if (!shell) {
    throw new Error('ssg-shell が見つかりません');
  }
  return { ...view, ref, shell };
};

// aria-rowindex(見出し行 = 1)/ aria-colindex(行番号列 = 1)で 1 セルを引きます。
const cellAt = (container: HTMLElement, viewRow: number, col: number): HTMLElement => {
  const cell = container.querySelector<HTMLElement>(
    `[role="row"][aria-rowindex="${viewRow + 2}"] > [aria-colindex="${col + 2}"]`,
  );
  if (!cell) {
    throw new Error(`セル (${viewRow}, ${col}) が見つかりません`);
  }
  return cell;
};

describe('数値の検査(結合)', () => {
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

  it('validate の無い number 列でも、min / integer に合わないセルに印とメッセージが出る', () => {
    const { container } = setup();
    expect(cellAt(container, 0, 1).classList.contains('ssg-body-cell--invalid')).toBe(false);
    const negative = cellAt(container, 1, 1);
    expect(negative.classList.contains('ssg-body-cell--invalid')).toBe(true);
    expect(negative.getAttribute('data-ssg-tooltip')).toBe('0 以上で入力してください');
    expect(cellAt(container, 2, 1).getAttribute('data-ssg-tooltip')).toBe('整数で入力してください');
  });

  it('showValidationMarks=false では印を出さない', () => {
    const { container } = setup({ showValidationMarks: false });
    expect(cellAt(container, 1, 1).classList.contains('ssg-body-cell--invalid')).toBe(false);
  });

  it('getInvalidCells は validate の無い number 列も拾う', () => {
    const { ref } = setup();
    expect(ref.current?.getInvalidCells()).toEqual([
      { rowKey: 2, sourceRowIndex: 1, columnKey: 'qty', message: '0 以上で入力してください' },
      { rowKey: 3, sourceRowIndex: 2, columnKey: 'qty', message: '整数で入力してください' },
    ]);
  });

  it('reject の列は範囲外の確定を止めてメッセージを出し、validate の NG はそのメッセージを優先する', () => {
    const { container, ref, shell } = setup();
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 2 });
    });
    // 「-」から打ち始めて -5(validate の NG が先)。
    fireEvent.keyDown(shell, { key: '-' });
    const input = container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
    if (!input) {
      throw new Error('エディタが開いていません');
    }
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(currentRows).toBe(initialRows);
    expect(container.querySelector('.ssg-cell-editor-error')?.textContent).toBe('マイナスは入力できません');
    // validate が通しても min(1)を外れていれば止まる。
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(currentRows).toBe(initialRows);
    expect(container.querySelector('.ssg-cell-editor-error')?.textContent).toBe('1〜9999 で入力してください');
    // 両方を通れば確定する。
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(currentRows[0].price).toBe(150);
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
  });
});