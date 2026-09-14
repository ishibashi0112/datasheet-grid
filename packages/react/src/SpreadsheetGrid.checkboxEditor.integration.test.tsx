// SpreadsheetGrid を実際に render し、checkbox 列(直接トグル方式)の「配線」を実行検証する
//   結合テストです。仮想化行の DOM は jsdom では描画されないため、トグルは keyboard 経路
//   (Space)で代表させます(クリック経路の単体は editors/CheckboxCell.test.tsx で担保)。
//   - Space トグルが履歴ラッパ(handleRowsChange)経由で rows を更新し、undo で戻る
//   - checkedValue / uncheckedValue のカスタムマッピング
//   - readOnly 列は Space でも不変
//   - Enter / F2 / 印字キーで編集セッション(エディタ input)が開かない
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

type Row = { id: number; done: boolean; flag: string; locked: boolean };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'done', title: 'Done', width: 80, editor: { type: 'checkbox' } },
  {
    key: 'flag',
    title: 'Flag',
    width: 80,
    editor: { type: 'checkbox', checkedValue: '有', uncheckedValue: '無' },
  },
  {
    key: 'locked',
    title: 'Locked',
    width: 80,
    readOnly: true,
    editor: { type: 'checkbox' },
  },
];

const initialRows: Row[] = [
  { id: 1, done: false, flag: '無', locked: true },
  { id: 2, done: true, flag: '有', locked: false },
];

let currentRows: Row[] = initialRows;

function CheckboxHarness({
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
      enableUndoRedo
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

const pressKeyOnCell = (
  container: HTMLElement,
  gridRef: RefObject<SpreadsheetGridHandle<Row> | null>,
  cell: { row: number; col: number },
  key: string,
) => {
  act(() => {
    gridRef.current?.setActiveCell(cell);
  });
  fireEvent.keyDown(getShell(container), { key });
};

describe('SpreadsheetGrid checkbox エディタ(結合)', () => {
  it('Space でトグルされ(履歴経由)、Ctrl+Z で変更前 rows へ戻る', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<CheckboxHarness gridRef={ref} />);

    pressKeyOnCell(container, ref, { row: 0, col: 1 }, ' ');
    expect(currentRows[0].done).toBe(true);
    // 他セル / 他行は不変(参照維持)。
    expect(currentRows[1]).toBe(initialRows[1]);

    // もう一度 Space で往復する。
    pressKeyOnCell(container, ref, { row: 0, col: 1 }, ' ');
    expect(currentRows[0].done).toBe(false);

    // undo で 1 つ前(done=true)へ戻る。
    fireEvent.keyDown(getShell(container), { key: 'z', ctrlKey: true });
    expect(currentRows[0].done).toBe(true);
  });

  it('checkedValue / uncheckedValue のカスタムマッピングでトグルする', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<CheckboxHarness gridRef={ref} />);

    pressKeyOnCell(container, ref, { row: 0, col: 2 }, ' ');
    expect(currentRows[0].flag).toBe('有');
    pressKeyOnCell(container, ref, { row: 0, col: 2 }, ' ');
    expect(currentRows[0].flag).toBe('無');
  });

  it('readOnly 列は Space でも不変', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<CheckboxHarness gridRef={ref} />);

    pressKeyOnCell(container, ref, { row: 0, col: 3 }, ' ');
    expect(currentRows).toBe(initialRows);
  });

  it('Enter / F2 / 印字キーで編集セッション(エディタ input)が開かない', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<CheckboxHarness gridRef={ref} />);

    pressKeyOnCell(container, ref, { row: 0, col: 1 }, 'Enter');
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();

    pressKeyOnCell(container, ref, { row: 0, col: 1 }, 'F2');
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();

    pressKeyOnCell(container, ref, { row: 0, col: 1 }, 'a');
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
    expect(currentRows).toBe(initialRows);

    // 対照: 通常のテキスト列(id)は Enter でエディタが開く。
    pressKeyOnCell(container, ref, { row: 0, col: 0 }, 'Enter');
    expect(container.querySelector('.ssg-cell-editor-input')).not.toBeNull();
  });
});