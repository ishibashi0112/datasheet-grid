// 追加(motion-6 / M-2): highlightChanges の結合テストです。jsdom の layout スタブで本体行を描画し、rows を差し替えたとき
//   値が変わったセルだけに .ssg-body-cell--changed が付くこと、既定(false)では付かないことを固定します。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn } from './model/gridTypes';

type Row = { id: number; name: string; qty: number };
const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 5 },
  { id: 2, name: 'beta', qty: 12 },
  { id: 3, name: 'gamma', qty: 30 },
];
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160 },
  { key: 'qty', title: '数量', width: 100 },
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

const changedCells = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.ssg-body-cell--changed')).map(
    (el) => `${el.closest('.ssg-body-row')?.getAttribute('data-row-key')}:${el.getAttribute('data-ssg-col-key')}`,
  );

describe('motion-6: highlightChanges', () => {
  it('rows を差し替えると値が変わったセルだけにフラッシュのクラスが付く', () => {
    const { container, rerender } = render(
      <SpreadsheetGrid<Row> rows={rows} columns={columns} rowKeyGetter={(r) => r.id} highlightChanges />,
    );
    expect(changedCells(container)).toEqual([]);
    const next = rows.map((r) => (r.id === 2 ? { ...r, qty: 20 } : r));
    rerender(
      <SpreadsheetGrid<Row> rows={next} columns={columns} rowKeyGetter={(r) => r.id} highlightChanges />,
    );
    expect(changedCells(container)).toEqual(['2:qty']);
    // 行の挿入(構造変化)では何も付かない。
    const inserted = [{ id: 9, name: 'new', qty: 0 }, ...next];
    rerender(
      <SpreadsheetGrid<Row> rows={inserted} columns={columns} rowKeyGetter={(r) => r.id} highlightChanges />,
    );
    expect(changedCells(container)).toEqual(['2:qty']);
  });

  it('既定(false)では付かない', () => {
    const { container, rerender } = render(
      <SpreadsheetGrid<Row> rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />,
    );
    rerender(
      <SpreadsheetGrid<Row>
        rows={rows.map((r) => (r.id === 1 ? { ...r, name: 'ALPHA' } : r))}
        columns={columns}
        rowKeyGetter={(r) => r.id}
      />,
    );
    expect(changedCells(container)).toEqual([]);
  });
});
