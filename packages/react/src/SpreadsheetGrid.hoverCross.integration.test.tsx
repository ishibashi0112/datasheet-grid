// 追加(motion-5 / M-6): クロスヘア(hoverHighlight='cross')の結合テストです。jsdom の layout スタブで本体行を描画し、
//   本体セルのホバーで列の帯(.ssg-col-hover-overlay)と列ヘッダーの --hovered が付くこと、既定('row')では付かないこと、
//   本体から出ると消えることを固定します。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
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

const bodyCell = (container: HTMLElement, rowIndex: number, colKey: string) =>
  container.querySelector(
    `.ssg-body-row[data-row-index="${rowIndex}"] .ssg-body-cell[data-ssg-col-key="${colKey}"]`,
  ) as HTMLElement;
const headerCell = (container: HTMLElement, colKey: string) =>
  container.querySelector(`.ssg-header-cell[data-ssg-col-key="${colKey}"]`) as HTMLElement;

describe('motion-5: クロスヘア(hoverHighlight)', () => {
  it("'cross' では本体セルのホバーで列の帯と列ヘッダーの強調が付き、本体から出ると消える", () => {
    const { container } = render(
      <SpreadsheetGrid<Row> rows={rows} columns={columns} hoverHighlight="cross" />,
    );
    expect(container.querySelector('.ssg-root')?.classList.contains('ssg-root--hover-cross')).toBe(true);
    expect(container.querySelectorAll('.ssg-col-hover-overlay')).toHaveLength(0);
    fireEvent.pointerEnter(bodyCell(container, 1, 'qty'));
    expect(container.querySelectorAll('.ssg-col-hover-overlay').length).toBeGreaterThan(0);
    expect(headerCell(container, 'qty').classList.contains('ssg-header-cell--hovered')).toBe(true);
    expect(headerCell(container, 'name').classList.contains('ssg-header-cell--hovered')).toBe(false);
    fireEvent.pointerLeave(container.querySelector('.ssg-shell') as HTMLElement);
    expect(container.querySelectorAll('.ssg-col-hover-overlay')).toHaveLength(0);
  });

  it("既定('row')では列の帯も root 修飾子も付かない", () => {
    const { container } = render(<SpreadsheetGrid<Row> rows={rows} columns={columns} />);
    expect(container.querySelector('.ssg-root')?.classList.contains('ssg-root--hover-cross')).toBe(false);
    fireEvent.pointerEnter(bodyCell(container, 1, 'qty'));
    expect(container.querySelectorAll('.ssg-col-hover-overlay')).toHaveLength(0);
    expect(headerCell(container, 'qty').classList.contains('ssg-header-cell--hovered')).toBe(false);
  });
});
