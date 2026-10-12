// 追加(フィルハンドル 1A): フィルハンドルの結合テストです。既定では何も変わらないこと(ハンドルなし)、出す条件
//   (readOnly / onRowsChange なし / 行選択 / 編集中では出さない)、下へ引いて埋める・選択が広がる・ボタンで選び直す・
//   元に戻す 1 回で埋める前へ・Escape でやめる・ダブルクリック・getFillValue・編集できないセルを飛ばす、を実コンポーネント
//   越しに固定します(jsdom のレイアウトスタブ: 矩形はすべて (0, 0, 1200, 600)。行 = (clientY - 40) / 30、列は行番号 56px の右から)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useState } from 'react';
import type { Ref } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle, SpreadsheetGridProps } from './model/gridTypes';

type Row = { id: number; no: number | null; code: string; qty: number | null; memo: string };

const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 40;
const ROW_HEADER_WIDTH = 56;

const columns: GridColumn<Row>[] = [
  { key: 'no', title: 'No', width: 80 },
  { key: 'code', title: 'Code', width: 100 },
  { key: 'qty', title: 'Qty', width: 80 },
  { key: 'memo', title: 'Memo', width: 120, editable: false },
];
const initialRows: Row[] = [
  { id: 1, no: 1, code: 'P-001', qty: 120, memo: 'a' },
  { id: 2, no: 2, code: '', qty: null, memo: 'b' },
  { id: 3, no: 3, code: '', qty: null, memo: 'c' },
  { id: 4, no: 4, code: '', qty: null, memo: 'd' },
  { id: 5, no: null, code: '', qty: null, memo: 'e' },
];

type HarnessProps = Partial<SpreadsheetGridProps<Row>> & {
  gridRef: Ref<SpreadsheetGridHandle<Row>>;
  onRows?: (rows: Row[]) => void;
};

function Harness({ gridRef, onRows, ...rest }: HarnessProps) {
  const [rows, setRows] = useState(initialRows);
  return (
    <SpreadsheetGrid<Row>
      ref={gridRef}
      rows={rows}
      columns={columns}
      onRowsChange={(next) => {
        setRows(next);
        onRows?.(next);
      }}
      rowKeyGetter={(row) => row.id}
      rowHeight={ROW_HEIGHT}
      headerHeight={HEADER_HEIGHT}
      rowHeaderWidth={ROW_HEADER_WIDTH}
      {...rest}
    />
  );
}

const setup = (props: Partial<HarnessProps> = {}) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const onRows = vi.fn<(rows: Row[]) => void>();
  const view = render(<Harness gridRef={ref} onRows={onRows} {...props} />);
  return { ...view, ref, onRows };
};

// セル(行 / 列 index)の中心のクライアント座標。
const columnLeft = (col: number) => ROW_HEADER_WIDTH + columns.slice(0, col).reduce((sum, c) => sum + c.width, 0);
const cellPoint = (row: number, col: number) => ({
  clientX: columnLeft(col) + columns[col].width / 2,
  clientY: HEADER_HEIGHT + row * ROW_HEIGHT + ROW_HEIGHT / 2,
});

const pointer = (
  target: EventTarget,
  type: string,
  init: { clientX: number; clientY: number; pointerId?: number; ctrlKey?: boolean; timeStamp?: number },
) => {
  const event = new window.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: init.clientX,
    clientY: init.clientY,
    ctrlKey: init.ctrlKey ?? false,
  });
  const pointerId = init.pointerId ?? 1;
  if (event.pointerId !== pointerId) {
    Object.defineProperty(event, 'pointerId', { value: pointerId });
  }
  if (init.timeStamp !== undefined) {
    Object.defineProperty(event, 'timeStamp', { value: init.timeStamp });
  }
  act(() => {
    target.dispatchEvent(event);
  });
};

const handleOf = (container: HTMLElement) => container.querySelector<HTMLElement>('.ssg-fill-handle');

const selectCell = (ref: { current: SpreadsheetGridHandle<Row> | null }, row: number, col: number) => {
  act(() => {
    ref.current?.selectCell(row, col);
  });
};

// ハンドルを押して、指定セルまで引いて離す。
const dragHandleTo = (container: HTMLElement, row: number, col: number, init: { ctrlKey?: boolean } = {}) => {
  const handle = handleOf(container);
  if (!handle) throw new Error('ハンドルがありません');
  pointer(handle, 'pointerdown', { clientX: 0, clientY: 0, timeStamp: 1000 });
  pointer(window, 'pointermove', { ...cellPoint(row, col), ...init });
  pointer(window, 'pointerup', { ...cellPoint(row, col), ...init, timeStamp: 2000 });
};

describe('フィルハンドル(fillHandle)', () => {
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

  it('既定(fillHandle なし)ではハンドルを出さない', () => {
    const { container, ref } = setup();
    selectCell(ref, 0, 0);
    expect(handleOf(container)).toBeNull();
  });

  it('readOnly / onRowsChange なし / 行選択 / 編集中ではハンドルを出さない', () => {
    const readOnly = setup({ fillHandle: true, readOnly: true });
    selectCell(readOnly.ref, 0, 0);
    expect(handleOf(readOnly.container)).toBeNull();
    cleanup();

    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const noWrite = render(<SpreadsheetGrid<Row> ref={ref} rows={initialRows} columns={columns} fillHandle />);
    selectCell(ref, 0, 0);
    expect(handleOf(noWrite.container)).toBeNull();
    cleanup();

    const grid = setup({ fillHandle: true });
    selectCell(grid.ref, 0, 0);
    expect(handleOf(grid.container)).not.toBeNull();
    const rowHeader = grid.container.querySelector<HTMLElement>('.ssg-body-row[data-row-index="1"] .ssg-row-header-cell');
    expect(rowHeader).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(rowHeader!, { button: 0, pointerType: 'mouse', pointerId: 1 });
      fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
    });
    expect(grid.ref.current?.getSelection()).toEqual({ type: 'row', startRow: 1, endRow: 1 });
    expect(handleOf(grid.container)).toBeNull();
    // セルをクリックすると出る。
    const cell = grid.container.querySelectorAll('.ssg-body-row')[2]?.querySelectorAll<HTMLElement>('.ssg-body-cell')[1];
    act(() => {
      fireEvent.pointerDown(cell!, { button: 0, pointerType: 'mouse', pointerId: 1 });
      fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
    });
    expect(grid.ref.current?.getActiveCell()).toEqual({ row: 2, col: 1 });
    expect(handleOf(grid.container)).not.toBeNull();
    // 編集中は出さない。
    fireEvent.keyDown(document.activeElement!, { key: 'F2' });
    expect(grid.container.querySelector('.ssg-cell-editor-input')).not.toBeNull();
    expect(handleOf(grid.container)).toBeNull();
  });

  it('ハンドルは選択範囲の右下の角に出る', () => {
    const { container, ref } = setup({ fillHandle: true });
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
    });
    const handle = handleOf(container);
    // 角 = 列 1 の右端(80 + 100)、行 1 の下端(2 × 30)。left は行番号の幅込み、top はヘッダー込み。
    expect(handle?.style.left).toBe(`${ROW_HEADER_WIDTH + 180}px`);
    expect(handle?.style.top).toBe(`${HEADER_HEIGHT + 60}px`);
  });

  it('下へ引くと連続データで埋め、選択を広げてボタンを出す。ボタンで選び直しても元に戻す 1 回で埋める前へ', () => {
    const { container, ref, onRows } = setup({ fillHandle: true });
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 0 } });
    });
    dragHandleTo(container, 4, 0);
    expect(onRows).toHaveBeenCalledTimes(1);
    expect(onRows.mock.calls[0][0].map((row) => row.no)).toEqual([1, 2, 3, 4, 5]);
    expect(ref.current?.getSelection()).toEqual({
      type: 'cell',
      range: { start: { row: 0, col: 0 }, end: { row: 4, col: 0 } },
    });
    expect(ref.current?.getActiveCell()).toEqual({ row: 0, col: 0 });
    const chip = container.querySelector<HTMLButtonElement>('.ssg-fill-options');
    expect(chip?.getAttribute('aria-label')).toContain('連続データ');

    // ボタン → メニュー → セルのコピー。
    fireEvent.click(chip!);
    const items = document.querySelectorAll<HTMLButtonElement>('.ssg-fill-menu [role="menuitemradio"]');
    expect([...items].map((item) => [item.textContent?.replace('✓', ''), item.getAttribute('aria-checked')])).toEqual([
      ['連続データ', 'true'],
      ['セルのコピー', 'false'],
    ]);
    fireEvent.click(items[1]);
    expect(onRows).toHaveBeenCalledTimes(2);
    expect(onRows.mock.calls[1][0].map((row) => row.no)).toEqual([1, 2, 1, 2, 1]);
    expect(document.querySelector('.ssg-fill-menu')).toBeNull();
    expect(container.querySelector('.ssg-fill-options')?.getAttribute('aria-label')).toContain('セルのコピー');

    // 元に戻す 1 回で埋める前へ。
    act(() => {
      ref.current?.undo();
    });
    expect(onRows.mock.calls[2][0].map((row) => row.no)).toEqual([1, 2, 3, 4, null]);
    expect(container.querySelector('.ssg-fill-options')).toBeNull();
  });

  it('列ごとに決め(数値 1 つはコピー / 末尾の数は連続)、Ctrl を押しながらだと入れ替わる', () => {
    const { container, ref, onRows } = setup({ fillHandle: true });
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 1 }, end: { row: 0, col: 2 } });
    });
    dragHandleTo(container, 2, 2);
    const filled = onRows.mock.calls[0][0];
    expect(filled.map((row) => row.code).slice(0, 3)).toEqual(['P-001', 'P-002', 'P-003']);
    expect(filled.map((row) => row.qty).slice(0, 3)).toEqual([120, 120, 120]);

    act(() => {
      ref.current?.undo();
    });
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 1 }, end: { row: 0, col: 2 } });
    });
    dragHandleTo(container, 2, 2, { ctrlKey: true });
    const toggled = onRows.mock.calls[2][0];
    expect(toggled.map((row) => row.code).slice(0, 3)).toEqual(['P-001', 'P-001', 'P-001']);
    expect(toggled.map((row) => row.qty).slice(0, 3)).toEqual([120, 121, 122]);
  });

  it('編集できない列は飛ばし、右へも埋める', () => {
    const { container, ref, onRows } = setup({ fillHandle: true });
    selectCell(ref, 0, 2);
    // 列 2(Qty)→ 列 3(Memo は editable: false)へ右に引く。
    dragHandleTo(container, 0, 3);
    expect(onRows).not.toHaveBeenCalled();
    selectCell(ref, 0, 0);
    dragHandleTo(container, 0, 2);
    // No=1 を右へ: 数値 1 つはコピー。Code(文字列列)と Qty へ 1。
    expect(onRows.mock.calls[0][0][0]).toMatchObject({ no: 1, code: 1, qty: 1, memo: 'a' });
  });

  it('Escape でやめる(書き込まない・点線を消す)', () => {
    const { container, ref, onRows } = setup({ fillHandle: true });
    selectCell(ref, 0, 0);
    const handle = handleOf(container)!;
    pointer(handle, 'pointerdown', { clientX: 0, clientY: 0 });
    pointer(window, 'pointermove', cellPoint(3, 0));
    expect(container.querySelector('.ssg-fill-preview')).not.toBeNull();
    expect(container.querySelector('.ssg-root--filling')).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(container.querySelector('.ssg-fill-preview')).toBeNull();
    pointer(window, 'pointerup', cellPoint(3, 0));
    expect(onRows).not.toHaveBeenCalled();
    expect(ref.current?.getSelection()).toEqual({
      type: 'cell',
      range: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
    });
  });

  it('ハンドルのダブルクリックで、左隣の列に値が続くところまで下へ埋める', () => {
    const { container, ref, onRows } = setup({ fillHandle: true });
    selectCell(ref, 0, 1);
    const handle = handleOf(container)!;
    pointer(handle, 'pointerdown', { clientX: 5, clientY: 5, timeStamp: 1000 });
    pointer(window, 'pointerup', { clientX: 5, clientY: 5, timeStamp: 1080 });
    pointer(handleOf(container)!, 'pointerdown', { clientX: 5, clientY: 5, timeStamp: 1250 });
    expect(onRows.mock.calls[0][0].map((row) => row.code)).toEqual(['P-001', 'P-002', 'P-003', 'P-004', '']);
  });

  it('getFillValue の返り値を書く', () => {
    const getFillValue = vi.fn(({ defaultValue, column }: { defaultValue: unknown; column: GridColumn<Row> }) =>
      column.key === 'no' ? Number(defaultValue) * 10 : defaultValue,
    );
    const { container, ref, onRows } = setup({ fillHandle: { getFillValue } });
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 0 } });
    });
    dragHandleTo(container, 3, 0);
    expect(onRows.mock.calls[0][0].map((row) => row.no)).toEqual([1, 2, 30, 40, null]);
    expect(getFillValue).toHaveBeenCalledWith(
      expect.objectContaining({ rowIndex: 2, index: 0, direction: 'down', kind: 'series', sourceValues: [1, 2] }),
    );
  });
});