// 追加(数値の打ち始め): number 列のセルを選んで「-」「.」から打ち始めたとき、その文字が消えずに数値になることを
//   SpreadsheetGrid を render して確かめる結合テストです(キー操作で編集を始める経路 = keyboardController の印字キー)。
//   従来は「-」を type="number" の入力欄の value に入れていたため空になり、「-5」と打つと 5 が入っていました。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import type { Ref } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
});

afterEach(() => {
  cleanup();
});

type Row = { id: number; qty: unknown };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'qty', title: 'Qty', width: 100, editable: true, editor: { type: 'number', min: 0, step: 1 } },
];

const initialRows: Row[] = [
  { id: 1, qty: 10 },
  { id: 2, qty: 20 },
];

let currentRows: Row[] = initialRows;

function Harness({ gridRef }: { gridRef: Ref<SpreadsheetGridHandle<Row>> }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  useEffect(() => {
    currentRows = rows;
  }, [rows]);
  return <SpreadsheetGrid ref={gridRef} columns={columns} rows={rows} onRowsChange={setRows} rowKeyGetter={(row) => row.id} />;
}

const startTyping = (key: string) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const { container } = render(<Harness gridRef={ref} />);
  const shell = container.querySelector<HTMLElement>('.ssg-shell');
  if (!shell) {
    throw new Error('ssg-shell が見つかりません');
  }
  act(() => {
    ref.current?.setActiveCell({ row: 0, col: 1 });
  });
  fireEvent.keyDown(shell, { key });
  const input = container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
  if (!input) {
    throw new Error('エディタが開いていません');
  }
  return { container, input };
};

describe('number 列の打ち始め(結合)', () => {
  it('「-」から打ち始めて「-5」で確定すると -5 が入る', () => {
    const { container, input } = startTyping('-');
    expect(input.type).toBe('text');
    expect(input.value).toBe('-');
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(currentRows[0].qty).toBe(-5);
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
  });

  it('「.」から打ち始めて「.5」で確定すると 0.5 が入る', () => {
    const { input } = startTyping('.');
    expect(input.type).toBe('text');
    expect(input.value).toBe('.');
    fireEvent.change(input, { target: { value: '.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(currentRows[0].qty).toBe(0.5);
  });

  it('「-」だけで確定するとセルは空になり、文字列は入らない(type="number" と同じ)', () => {
    const { input } = startTyping('-');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(currentRows[0].qty).toBeNull();
  });

  it('全角や 3 桁区切りも数値になる(列のパーサ)', () => {
    const { input } = startTyping('-');
    fireEvent.change(input, { target: { value: '－１，２３４' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(currentRows[0].qty).toBe(-1234);
  });

  it('数値として読めない文字列は黙って消さずにそのまま入る(貼り付けと同じ。検査があれば印 / reject)', () => {
    const { input } = startTyping('-');
    fireEvent.change(input, { target: { value: '-abc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(currentRows[0].qty).toBe('-abc');
  });

  it('数字から打ち始めたときは従来どおり type="number" で開く', () => {
    const { input } = startTyping('7');
    expect(input.type).toBe('number');
    expect(input.value).toBe('7');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(currentRows[0].qty).toBe(7);
  });
});