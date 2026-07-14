// SpreadsheetGrid を実際に render し、バリデーション(mark / reject)の「配線」を実行検証する
//   結合テストです。編集経路はペースト / Delete クリア / エディタ commit(Enter 起動)で駆動します
//   (mark のセル表示は仮想化行が jsdom で描画されないため、getInvalidCells と純ロジックで担保)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import type { Ref, RefObject } from 'react';

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
});

type Row = { id: number; name: string; qty: unknown };

// qty: 有限数値のみ有効(number エディタ + validate)。
const qtyValidate = (ctx: { value: unknown }) =>
  typeof ctx.value === 'number' && Number.isFinite(ctx.value)
    ? true
    : '数値を入力してください';

// name: 空文字禁止(必須列)。
const nameValidate = (ctx: { value: unknown }) =>
  String(ctx.value ?? '').length > 0 ? true : '必須項目です';

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  {
    key: 'name',
    title: 'Name',
    width: 160,
    validate: nameValidate,
    validationMode: 'reject',
  },
  {
    key: 'qty',
    title: 'Qty',
    width: 100,
    editor: { type: 'number' },
    validate: qtyValidate,
    // 既定 = mark(不正値も入るが invalid 表示)。
  },
];

const initialRows: Row[] = [
  { id: 1, name: 'alpha', qty: 10 },
  { id: 2, name: 'beta', qty: 20 },
];

let currentRows: Row[] = initialRows;

function ValidationHarness({
  gridRef,
}: {
  gridRef: Ref<SpreadsheetGridHandle<Row>>;
}) {
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

const pasteIntoCell = (
  container: HTMLElement,
  gridRef: RefObject<SpreadsheetGridHandle<Row> | null>,
  cell: { row: number; col: number },
  text: string,
) => {
  act(() => {
    gridRef.current?.setActiveCell(cell);
  });
  fireEvent.paste(getShell(container), {
    clipboardData: { getData: () => text },
  });
};

describe('SpreadsheetGrid バリデーション(結合)', () => {
  it('経路 B: reject 列へのペーストは不正セルのみスキップし、有効値は書き込む', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<ValidationHarness gridRef={ref} />);

    // 空文字(必須 NG)のペースト → スキップ(rows 不変)。
    pasteIntoCell(container, ref, { row: 0, col: 1 }, '');
    expect(currentRows).toBe(initialRows);

    // 有効値のペースト → 書き込まれる。
    pasteIntoCell(container, ref, { row: 0, col: 1 }, 'RENAMED');
    expect(currentRows[0].name).toBe('RENAMED');
  });

  it('経路 B: mark 列(既定)へのペーストは不正値もそのまま書き込む', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<ValidationHarness gridRef={ref} />);

    pasteIntoCell(container, ref, { row: 0, col: 2 }, 'not-a-number');
    expect(currentRows[0].qty).toBe('not-a-number');
  });

  it('経路 C: reject 列は Delete でクリアできない(必須列)、mark 列はクリアできる', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<ValidationHarness gridRef={ref} />);
    const shell = getShell(container);

    // reject 列(name)を Delete → スキップ(不変)。
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'Delete' });
    expect(currentRows).toBe(initialRows);

    // mark 列(qty)を Delete → number 既定パーサで null へクリアされる。
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 2 });
    });
    fireEvent.keyDown(shell, { key: 'Delete' });
    expect(currentRows[0].qty).toBeNull();
  });

  it('経路 A: reject 列のエディタ commit は確定拒否・編集継続し、有効値で確定できる', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<ValidationHarness gridRef={ref} />);
    const shell = getShell(container);

    // Enter で name 列(reject)の編集を開始。
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'Enter' });
    const input = container.querySelector<HTMLInputElement>(
      '.ssg-cell-editor-input',
    );
    expect(input).not.toBeNull();

    // 空文字にして Enter → 確定拒否(rows 不変・エディタ継続・エラーバブル表示)。
    fireEvent.change(input!, { target: { value: '' } });
    fireEvent.keyDown(input!, { key: 'Enter' });
    expect(currentRows).toBe(initialRows);
    expect(container.querySelector('.ssg-cell-editor-input')).not.toBeNull();
    expect(container.querySelector('.ssg-cell-editor-error')?.textContent).toBe(
      '必須項目です',
    );

    // 有効値へ直して Enter → 確定され、エディタが閉じる。
    fireEvent.change(input!, { target: { value: 'valid-name' } });
    fireEvent.keyDown(input!, { key: 'Enter' });
    expect(currentRows[0].name).toBe('valid-name');
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
  });

  it('getInvalidCells: validate 指定列 × 全ソース行を走査して invalid セルを返す', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<ValidationHarness gridRef={ref} />);

    expect(ref.current?.getInvalidCells()).toEqual([]);

    // mark 列(qty)へ不正値をペースト → invalid として検出される。
    pasteIntoCell(container, ref, { row: 1, col: 2 }, 'abc');
    expect(ref.current?.getInvalidCells()).toEqual([
      {
        rowKey: 1,
        sourceRowIndex: 1,
        columnKey: 'qty',
        message: '数値を入力してください',
      },
    ]);
  });
});