// 追加(合計行 3A): 表の下端に固定する合計行(totalRow)の結合テストです。
//   既定では何も変わらないこと(合計行なし・高さ / 行数の ARIA 不変)、集計(組み込み / カスタム / values)と見出し、
//   フィルター / 編集での再計算、固定列の 3 ペイン、ラベル行と折りたたんだグループの扱い、表示専用(押しても選択が
//   動かない)、エクスポート、classNames / className / renderCell / height を実コンポーネント越しに固定します。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useState } from 'react';
import type { Ref } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle, SpreadsheetGridProps } from './model/gridTypes';

type Row = { id: number; name: string; region: string; qty: number | string; price: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 120 },
  { key: 'region', title: 'Region', width: 100 },
  { key: 'qty', title: 'Qty', width: 80, aggFunc: 'sum', align: 'right' },
  { key: 'price', title: 'Price', width: 80, aggFunc: 'avg' },
];
const initialRows: Row[] = [
  { id: 1, name: 'alpha', region: '東', qty: 10, price: 1.5 },
  { id: 2, name: 'beta', region: '西', qty: '20', price: 2 },
  { id: 3, name: 'gamma', region: '東', qty: '', price: 3 },
  { id: 4, name: 'delta', region: '西', qty: 5, price: 4 },
];

function Harness(
  props: Partial<SpreadsheetGridProps<Row>> & { gridRef: Ref<SpreadsheetGridHandle<Row>>; initial?: Row[] },
) {
  const { gridRef, initial, ...rest } = props;
  const [rows, setRows] = useState(initial ?? initialRows);
  return (
    <SpreadsheetGrid<Row>
      ref={gridRef}
      rows={rows}
      columns={columns}
      onRowsChange={setRows}
      rowKeyGetter={(row) => row.id}
      {...rest}
    />
  );
}

const setup = (props: Partial<SpreadsheetGridProps<Row>> & { initial?: Row[] } = {}) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const view = render(<Harness gridRef={ref} {...props} />);
  const grid = view.container.querySelector<HTMLElement>('[role="grid"]');
  if (!grid) throw new Error('grid がありません');
  return { ...view, ref, grid };
};

const totalCell = (container: HTMLElement, key: string) =>
  container.querySelector<HTMLElement>(`.ssg-total-row .ssg-total-cell[data-ssg-col-key="${key}"]`);
const totalText = (container: HTMLElement, key: string) => totalCell(container, key)?.textContent ?? null;

describe('合計行(totalRow)', () => {
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

  it('既定(totalRow なし)では合計行を描かず、高さ・ARIA の行数は従来どおり', () => {
    const { container, grid, ref } = setup();
    expect(container.querySelector('.ssg-total-row')).toBeNull();
    expect(container.querySelector('[data-ssg-total-row]')).toBeNull();
    expect(grid.getAttribute('aria-rowcount')).toBe('5');
    const inner = container.querySelector<HTMLElement>('.ssg-inner-row');
    const withTotals = setup({ totalRow: true });
    const innerWithTotals = withTotals.container.querySelector<HTMLElement>('.ssg-inner-row');
    // 合計行の高さ(既定 rowHeight)だけ伸びる。
    expect(parseFloat(innerWithTotals?.style.height ?? '0') - parseFloat(inner?.style.height ?? '0')).toBeGreaterThan(0);
    // aggFunc があっても totalRow なしではエクスポートに出ない。
    expect(ref.current?.exportCsv({ includeTotalRow: true, includeHeaders: false }).split('\r\n')).toHaveLength(4);
  });

  it('true で列の aggFunc ごとに集計し、合計以外は種類を前に出す。見出しは先頭列へ', () => {
    const { container, grid } = setup({ totalRow: true });
    const row = container.querySelector<HTMLElement>('.ssg-total-row');
    expect(row).not.toBeNull();
    // qty: 10 + '20' + 5 = 35(空は数えない)。price: (1.5 + 2 + 3 + 4) / 4 = 2.625。
    expect(totalText(container, 'qty')).toBe('35');
    expect(totalText(container, 'price')).toBe('平均2.625');
    expect(totalCell(container, 'price')?.querySelector('.ssg-total-caption')?.textContent).toBe('平均');
    expect(totalText(container, 'name')).toBe('合計');
    expect(totalText(container, 'region')).toBe('');
    // 右寄せの列は本体と同じ寄せ。
    expect(totalCell(container, 'qty')?.classList.contains('ssg-body-cell--align-right')).toBe(true);
    // ARIA: 表の行数に 1 行足し、合計行は最後の行。
    expect(grid.getAttribute('aria-rowcount')).toBe('6');
    expect(row?.getAttribute('role')).toBe('row');
    expect(row?.getAttribute('aria-rowindex')).toBe('6');
    expect(row?.querySelector('[role="rowheader"]')?.textContent).toBe('');
    expect(totalCell(container, 'qty')?.getAttribute('role')).toBe('gridcell');
    expect(totalCell(container, 'qty')?.getAttribute('aria-colindex')).toBe('4');
    // 行の DOM クエリ / 右クリックメニューの対象にしない(data-row-index を持たない)。
    expect(row?.closest('[data-row-index]')).toBeNull();
    expect(row?.querySelector('[data-row-index]')).toBeNull();
  });

  it('フィルターと編集で計算し直す(見えている行だけ)', () => {
    const { container, ref } = setup({ totalRow: true });
    act(() => {
      ref.current?.applyState({
        version: 2,
        columnWidths: {},
        filters: { globalText: '東', columnFilters: {} },
        sort: [],
      });
    });
    // 東: alpha(10, 1.5)/ gamma('', 3)。
    expect(totalText(container, 'qty')).toBe('10');
    expect(totalText(container, 'price')).toBe('平均2.25');
    act(() => {
      ref.current?.applyState({ version: 2, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [] });
    });
    expect(totalText(container, 'qty')).toBe('35');
    // 編集(alpha の Qty を 100 に)で計算し直す。
    const cell = container.querySelector<HTMLElement>(
      '.ssg-body-row[data-row-index="0"] .ssg-body-cell[data-ssg-col-key="qty"]',
    );
    if (!cell) throw new Error('セルがありません');
    act(() => {
      fireEvent.pointerDown(cell, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
      fireEvent.pointerUp(window, { button: 0, pointerId: 1 });
    });
    const focusTarget = container.querySelector<HTMLElement>('.ssg-root') ?? container;
    act(() => {
      fireEvent.keyDown(document.activeElement ?? focusTarget, { key: 'Delete' });
    });
    // Delete で alpha の Qty を空に → '20' + 5 = 25。
    expect(totalText(container, 'qty')).toBe('25');
  });

  it('values で列の値を差し替え(計算しない)、先頭列に値があれば見出しは行番号の欄へ', () => {
    const { container } = setup({
      totalRow: { label: '総計', values: { name: '4 件', price: 999 } },
    });
    expect(totalText(container, 'name')).toBe('4 件');
    // values の値は種類を出さない。
    expect(totalText(container, 'price')).toBe('999');
    expect(totalText(container, 'qty')).toBe('35');
    expect(container.querySelector('.ssg-total-row [role="rowheader"]')?.textContent).toBe('総計');
  });

  it('カスタム集計 / renderCell / className / classNames / height', () => {
    const custom: GridColumn<Row>[] = [
      { ...columns[0], aggFunc: ({ rows }) => `${rows.length} 行` },
      columns[1],
      columns[2],
      columns[3],
    ];
    const { container } = setup({
      columns: custom,
      totalRow: {
        height: 44,
        className: { className: 'my-total', style: { color: 'rgb(1, 2, 3)' } },
        renderCell: ({ column, text, kind, caption }) => (
          <em data-testid={`total-${column.key}`}>{`${kind}:${caption ?? '-'}:${text}`}</em>
        ),
      },
      classNames: { totalRow: 'slot-row', totalCell: 'slot-cell' },
    });
    const row = container.querySelector<HTMLElement>('.ssg-total-row');
    expect(row?.classList.contains('my-total')).toBe(true);
    expect(row?.classList.contains('slot-row')).toBe(true);
    expect(row?.style.color).toBe('rgb(1, 2, 3)');
    expect(row?.style.height).toBe('44px');
    expect(totalCell(container, 'qty')?.classList.contains('slot-cell')).toBe(true);
    expect(totalCell(container, 'qty')?.style.height).toBe('44px');
    expect(totalText(container, 'name')).toBe('custom:-:4 行');
    expect(totalText(container, 'qty')).toBe('sum:-:35');
    expect(totalText(container, 'price')).toBe('avg:平均:2.625');
    // 値のない列は renderCell を呼ばない。
    expect(totalText(container, 'region')).toBe('');
    // 見出しの列(name)に値があるので行番号の欄へ。
    expect(container.querySelector('.ssg-total-row [role="rowheader"]')?.textContent).toBe('合計');
  });

  it('固定列があっても 3 ペインに描き、列はそれぞれのペインに出る', () => {
    const pinned: GridColumn<Row>[] = [
      { ...columns[0], pinned: 'left' },
      columns[1],
      columns[2],
      { ...columns[3], pinned: 'right' },
    ];
    const { container, grid } = setup({ columns: pinned, totalRow: true });
    const rows = Array.from(container.querySelectorAll<HTMLElement>('.ssg-total-row'));
    expect(rows.map((row) => row.getAttribute('data-pane'))).toEqual(['left', 'center', 'right']);
    expect(rows.every((row) => row.getAttribute('aria-rowindex') === '6')).toBe(true);
    expect(rows[0]?.querySelector('[data-ssg-col-key="name"]')?.textContent).toBe('合計');
    expect(rows[0]?.querySelector('[role="rowheader"]')).not.toBeNull();
    expect(rows[1]?.querySelector('[data-ssg-col-key="qty"]')?.textContent).toBe('35');
    expect(rows[1]?.querySelector('[role="rowheader"]')).toBeNull();
    expect(rows[2]?.querySelector('[data-ssg-col-key="price"]')?.textContent).toBe('平均2.625');
    // 見えている行はすべてセルを持つ(ARIA の構造)。
    for (const rowEl of Array.from(grid.querySelectorAll('[role="row"]'))) {
      if (rowEl.closest('[aria-hidden="true"]')) continue;
      expect(rowEl.querySelector('[role="gridcell"], [role="rowheader"], [role="columnheader"]')).not.toBeNull();
    }
  });

  it('表示専用: 合計行のセルを押しても選択 / アクティブセルは変わらない', () => {
    const { container, ref } = setup({ totalRow: true });
    act(() => {
      ref.current?.selectCell(1, 1);
    });
    const before = ref.current?.getSelection();
    const cell = totalCell(container, 'qty');
    if (!cell) throw new Error('合計行のセルがありません');
    act(() => {
      fireEvent.pointerDown(cell, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
      fireEvent.pointerUp(window, { button: 0, pointerId: 1 });
      fireEvent.doubleClick(cell);
    });
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 1 });
    expect(ref.current?.getSelection()).toEqual(before);
    expect(container.querySelector('.ssg-cell-editor, [data-ssg-editor]')).toBeNull();
  });

  it('本体の行から合計行へポインタが移ると行ホバーを外す', () => {
    const hovered: Array<number | null> = [];
    const { container } = setup({ totalRow: true, onHoveredRowChange: (index) => hovered.push(index) });
    const bodyCell = container.querySelector<HTMLElement>(
      '.ssg-body-row[data-row-index="3"] .ssg-body-cell[data-ssg-col-key="qty"]',
    );
    const totalRowEl = container.querySelector<HTMLElement>('.ssg-total-row[data-pane="center"]');
    if (!bodyCell || !totalRowEl) throw new Error('セル / 合計行がありません');
    act(() => {
      fireEvent.pointerEnter(bodyCell, { pointerId: 1 });
    });
    expect(container.querySelectorAll('.ssg-body-cell--row-hovered').length).toBeGreaterThan(0);
    act(() => {
      fireEvent.pointerEnter(totalRowEl, { pointerId: 1 });
    });
    expect(container.querySelectorAll('.ssg-body-cell--row-hovered')).toHaveLength(0);
    expect(hovered).toEqual([3, null]);
  });

  it('ラベル行は数えず、折りたたんだグループの行は数える', () => {
    type LRow = Row & { kind?: 'label' };
    const labelRows: LRow[] = [
      { id: 100, kind: 'label', name: '第 1 節', region: '', qty: 1000, price: 1000 },
      ...initialRows,
    ];
    const labelView = render(
      <SpreadsheetGrid<LRow>
        rows={labelRows}
        columns={columns as GridColumn<LRow>[]}
        rowKeyGetter={(row) => row.id}
        labelRow={{ isLabelRow: (row) => row.kind === 'label', getLabel: (row) => row.name }}
        totalRow
      />,
    );
    expect(totalText(labelView.container, 'qty')).toBe('35');
    cleanup();

    const grouped: GridColumn<Row>[] = [
      columns[0],
      { ...columns[1], rowGroup: true },
      columns[2],
      columns[3],
    ];
    const { container, ref } = setup({ columns: grouped, totalRow: true });
    act(() => {
      ref.current?.collapseAllGroups();
    });
    expect(container.querySelectorAll('.ssg-body-row[data-ssg-group-row]').length).toBe(2);
    expect(totalText(container, 'qty')).toBe('35');
  });

  // 追加(見直し): 値が列幅で切れたらツールチップで全体を読めるように、値の span に overflow マーカーを付ける
  //   (右寄せ列は M-01 の CSS で span 側が切れるため、セルではなく span に付ける)。空の欄には付けない。
  it('値の span に overflow ツールチップの文言(種類 + 値)を付け、空の欄には付けない', () => {
    const { container } = setup({ totalRow: true });
    const qtyValue = totalCell(container, 'qty')?.querySelector('.ssg-total-value');
    expect(qtyValue?.getAttribute('data-ssg-tooltip-overflow')).toBe('35');
    const priceValue = totalCell(container, 'price')?.querySelector('.ssg-total-value');
    expect(priceValue?.getAttribute('data-ssg-tooltip-overflow')).toBe('平均 2.625');
    expect(totalCell(container, 'region')?.querySelector('[data-ssg-tooltip-overflow]')).toBeNull();
  });

  it('エクスポート: includeTotalRow で末尾に合計行(生値)を付ける', () => {
    const { ref } = setup({ totalRow: true });
    const csv = ref.current?.exportCsv({ includeTotalRow: true }) ?? '';
    expect(csv.split('\r\n').at(-1)).toBe('合計,,35,2.625');
    expect(ref.current?.exportCsv().split('\r\n')).toHaveLength(5);
    const data = ref.current?.getExportData({ includeTotalRow: true });
    expect(data?.rowKinds?.at(-1)).toBe('total');
    expect(data?.rows.at(-1)?.[2]).toEqual({ value: 35, text: '35' });
  });
});