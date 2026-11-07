// 追加(DevBI の報告 2026-11-07): 列見出しの寄せ(GridColumn.headerAlign)の結合テストです。書かなければ列の align と同じ、
//   書いた列はその値、左は修飾クラスなし(0.61.0 までと同じ DOM)。並びの鏡写しは CSS(styles.css)で、実ブラウザの見た目は
//   audit/harness/t-devbi.mjs で確かめます。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn } from './model/gridTypes';

type Row = { id: number; name: string; qty: number; amount: number; status: string; code: string };

const rows: Row[] = [{ id: 1, name: 'alpha', qty: 5, amount: 1200, status: '確定', code: 'A-1' }];
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品名', width: 120 },
  { key: 'qty', title: '数量', width: 80, align: 'right' },
  { key: 'status', title: '状態', width: 80, align: 'center' },
  { key: 'code', title: 'コード', width: 80, align: 'right', headerAlign: 'left' },
  { key: 'amount', title: '金額', width: 100, headerAlign: 'right' },
];

const headerClasses = (container: HTMLElement, key: string) => {
  const cell = container.querySelector(`.ssg-header-cell[data-ssg-col-key="${key}"]`);
  expect(cell).not.toBeNull();
  return {
    right: cell?.classList.contains('ssg-header-cell--align-right'),
    center: cell?.classList.contains('ssg-header-cell--align-center'),
  };
};

describe('列見出しの寄せ(headerAlign)', () => {
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

  it('書かなければ列の align に合わせ、書いた列はその値にする', () => {
    const { container } = render(<SpreadsheetGrid<Row> rows={rows} columns={columns} rowKeyGetter={(row) => row.id} />);
    expect(headerClasses(container, 'name')).toEqual({ right: false, center: false });
    expect(headerClasses(container, 'qty')).toEqual({ right: true, center: false });
    expect(headerClasses(container, 'status')).toEqual({ right: false, center: true });
    expect(headerClasses(container, 'code')).toEqual({ right: false, center: false });
    expect(headerClasses(container, 'amount')).toEqual({ right: true, center: false });
  });

  it('見出しの中身(ラベル → 状態 → 操作)の DOM の順は寄せで変えない(並びは CSS の flex-direction)', () => {
    const { container } = render(
      <SpreadsheetGrid<Row> rows={rows} columns={columns} rowKeyGetter={(row) => row.id} onColumnsChange={() => {}} />,
    );
    const cell = container.querySelector('.ssg-header-cell[data-ssg-col-key="qty"]');
    const order = Array.from(cell?.children ?? []).map((child) => child.className.split(' ')[0]);
    expect(order.slice(0, 3)).toEqual(['ssg-header-label', 'ssg-header-status', 'ssg-header-actions']);
    // ボディのセルの寄せは今までどおり align だけで決まる(headerAlign は見出しだけ)。
    const amountCell = container.querySelector('.ssg-body-cell[data-ssg-col-key="amount"]');
    expect(amountCell).not.toBeNull();
    expect(amountCell?.classList.contains('ssg-body-cell--align-right')).toBe(false);
    expect(container.querySelector('.ssg-body-cell[data-ssg-col-key="qty"]')?.classList.contains('ssg-body-cell--align-right')).toBe(true);
  });
});