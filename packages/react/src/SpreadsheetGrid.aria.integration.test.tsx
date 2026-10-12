// 追加(audit V-05 / RD-10 / V-14): WAI-ARIA の grid パターンに沿った役割と状態の結合テストです。
//   表(role="grid")・行(row + aria-rowindex)・セル(gridcell / columnheader / rowheader + aria-colindex)・
//   ソート(aria-sort は第 1 キーだけ)・aria-activedescendant(アクティブセルが描画されているときだけ)・
//   行選択チェックボックスの名前と状態・編集不可セル・編集中エディタの名前を固定します。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent, within } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle, SpreadsheetGridProps } from './model/gridTypes';

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 160 },
  { key: 'qty', title: 'Qty', width: 100 },
];
const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 10 },
  { id: 2, name: 'beta', qty: 20 },
  { id: 3, name: 'gamma', qty: 30 },
];

const setup = (props: Partial<SpreadsheetGridProps<Row>> = {}) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const view = render(
    <SpreadsheetGrid<Row>
      ref={ref}
      rows={rows}
      columns={columns}
      rowKeyGetter={(row) => row.id}
      {...props}
    />,
  );
  const shell = view.container.querySelector<HTMLElement>('.ssg-shell');
  const grid = view.container.querySelector<HTMLElement>('[role="grid"]');
  if (!shell || !grid) {
    throw new Error('shell / grid が見つかりません');
  }
  return { ...view, ref, shell, grid };
};

const setupGrid = (shell: HTMLElement): HTMLElement => shell.querySelector<HTMLElement>('[role="grid"]') as HTMLElement;

// aria-rowindex / aria-colindex で 1 セルを引きます(複数ペインにまたがっても 1 つだけのはず)。
const cellAt = (grid: HTMLElement, rowIndex: number, colIndex: number): HTMLElement => {
  const matches = grid.querySelectorAll<HTMLElement>(
    `[role="row"][aria-rowindex="${rowIndex}"] > [aria-colindex="${colIndex}"]`,
  );
  expect(matches.length).toBe(1);
  return matches[0];
};

describe('ARIA(audit V-05 / RD-10 / V-14)', () => {
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

  it('表は role="grid" で、名前と行数・列数を持つ。フォーカスを受ける要素は role="group"', () => {
    const { grid, shell } = setup({ ariaLabel: '受注一覧' });
    expect(grid.classList.contains('ssg-scroll-container')).toBe(true);
    expect(grid.getAttribute('aria-label')).toBe('受注一覧');
    // 見出し行 1 + データ行 3 / 行番号列 1 + データ列 2。
    expect(grid.getAttribute('aria-rowcount')).toBe('4');
    expect(grid.getAttribute('aria-colcount')).toBe('3');
    expect(shell.getAttribute('role')).toBe('group');
    // 表の中に grid が入れ子にならない(role="grid" は 1 つだけ)。
    expect(document.querySelectorAll('[role="grid"]').length).toBe(1);
  });

  it('見出し行は aria-rowindex=1、列見出しは columnheader で aria-colindex は行番号列の次から', () => {
    const { grid } = setup();
    const headerRow = grid.querySelector<HTMLElement>('[role="row"][aria-rowindex="1"]');
    expect(headerRow).not.toBeNull();
    const headers = within(grid).getAllByRole('columnheader');
    const named = headers.filter((header) => header.getAttribute('aria-colindex') !== '1');
    expect(named.map((header) => header.getAttribute('aria-colindex'))).toEqual(['2', '3']);
    expect(named[0].textContent).toContain('Name');
    expect(named[1].textContent).toContain('Qty');
  });

  it('データ行は aria-rowindex が表示順 + 2、セルは gridcell、行番号は rowheader', () => {
    const { grid } = setup();
    for (const [viewIndex, row] of rows.entries()) {
      const rowEl = grid.querySelector<HTMLElement>(`[role="row"][aria-rowindex="${viewIndex + 2}"]`);
      expect(rowEl).not.toBeNull();
      const header = cellAt(grid, viewIndex + 2, 1);
      expect(header.getAttribute('role')).toBe('rowheader');
      const nameCell = cellAt(grid, viewIndex + 2, 2);
      expect(nameCell.getAttribute('role')).toBe('gridcell');
      expect(nameCell.textContent).toContain(row.name);
      expect(cellAt(grid, viewIndex + 2, 3).textContent).toContain(String(row.qty));
    }
  });

  it('aria-sort はソートの第 1 キーの列だけに付く', () => {
    const { grid, ref } = setup();
    const headerFor = (colIndex: number) =>
      grid.querySelector<HTMLElement>(`[role="columnheader"][aria-colindex="${colIndex}"]`);
    expect(headerFor(2)?.hasAttribute('aria-sort')).toBe(false);
    act(() => {
      ref.current?.applyState({
        version: 2,
        columnWidths: {},
        filters: { globalText: '', columnFilters: {} },
        sort: [
          { columnKey: 'qty', direction: 'desc' },
          { columnKey: 'name', direction: 'asc' },
        ],
      });
    });
    expect(headerFor(3)?.getAttribute('aria-sort')).toBe('descending');
    expect(headerFor(2)?.hasAttribute('aria-sort')).toBe(false);
    // 並び替え後も aria-rowindex は表示順(qty 降順で gamma が先頭)。
    expect(cellAt(grid, 2, 2).textContent).toContain('gamma');
  });

  it('aria-activedescendant はアクティブセルの id を指し、セルは aria-selected になる', () => {
    const { grid, shell, ref } = setup();
    expect(shell.hasAttribute('aria-activedescendant')).toBe(false);
    act(() => {
      ref.current?.selectCell(1, 1);
    });
    const id = shell.getAttribute('aria-activedescendant');
    expect(id).toBeTruthy();
    const target = document.getElementById(id as string);
    expect(target).toBe(cellAt(grid, 3, 3));
    expect(target?.getAttribute('aria-selected')).toBe('true');
    // id を持つのはアクティブセルだけ。
    expect(grid.querySelectorAll(`[id="${id}"]`).length).toBe(1);
    // キー操作で移動すると追従する。
    fireEvent.keyDown(shell, { key: 'ArrowUp' });
    expect(document.getElementById(shell.getAttribute('aria-activedescendant') as string)).toBe(
      cellAt(grid, 2, 3),
    );
    act(() => {
      ref.current?.setActiveCell(null);
    });
    expect(shell.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('アクティブセルが描画されていない(仮想化で外れている)ときは aria-activedescendant を付けない', () => {
    const many: Row[] = Array.from({ length: 2000 }, (_, index) => ({ id: index + 1, name: `r${index}`, qty: index }));
    const { shell, ref } = setup({ rows: many });
    act(() => {
      ref.current?.setActiveCell({ row: 1999, col: 0 });
    });
    expect(document.querySelector('[role="row"][aria-rowindex="2001"]')).toBeNull();
    expect(shell.hasAttribute('aria-activedescendant')).toBe(false);
    // 描画されている行へ戻すと付く。
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 0 });
    });
    const id = shell.getAttribute('aria-activedescendant');
    expect(id && document.getElementById(id)).toBeTruthy();
  });

  it('行選択のチェックボックスは名前と状態を持ち、行は aria-selected', () => {
    const { grid } = setup({ enableRowSelection: true });
    const selectAll = within(grid).getByRole('checkbox', { name: 'すべての行を選択' });
    expect(selectAll.getAttribute('aria-checked')).toBe('false');
    const second = within(grid).getByRole('checkbox', { name: '行 2 を選択' });
    expect(second.getAttribute('aria-checked')).toBe('false');
    const rowEl = grid.querySelector<HTMLElement>('[role="row"][aria-rowindex="3"]');
    expect(rowEl?.getAttribute('aria-selected')).toBe('false');
    // 行番号のセルを押すと選択される(既存の操作)。
    const gutter = cellAt(grid, 3, 1);
    fireEvent.pointerDown(gutter, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(gutter, { button: 0, pointerId: 1 });
    fireEvent.click(gutter);
    expect(within(grid).getByRole('checkbox', { name: '行 2 を選択' }).getAttribute('aria-checked')).toBe('true');
    expect(grid.querySelector('[role="row"][aria-rowindex="3"]')?.getAttribute('aria-selected')).toBe('true');
    expect(within(grid).getByRole('checkbox', { name: 'すべての行を選択' }).getAttribute('aria-checked')).toBe('mixed');
  });

  it('行選択が無いときは行に aria-selected を付けない', () => {
    const { grid } = setup();
    expect(grid.querySelector('[role="row"][aria-rowindex="2"]')?.hasAttribute('aria-selected')).toBe(false);
    expect(within(grid).queryAllByRole('checkbox')).toEqual([]);
  });

  it('編集できないセルは aria-readonly、readOnly の表は grid に aria-readonly', () => {
    const { grid } = setup({ canEditCell: (_rowIndex, colIndex) => colIndex !== 1 });
    expect(cellAt(grid, 2, 3).getAttribute('aria-readonly')).toBe('true');
    expect(cellAt(grid, 2, 2).hasAttribute('aria-readonly')).toBe(false);
    expect(grid.hasAttribute('aria-readonly')).toBe(false);
    cleanup();
    const readOnlyGrid = setup({ readOnly: true }).grid;
    expect(readOnlyGrid.getAttribute('aria-readonly')).toBe('true');
  });

  it('範囲選択が有効な表は aria-multiselectable', () => {
    expect(setup({ enableRangeSelection: true }).grid.getAttribute('aria-multiselectable')).toBe('true');
  });

  it('編集中のエディタは「(列名)を編集」の group に入る', () => {
    const { shell, ref } = setup();
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'F2' });
    const input = document.activeElement as HTMLElement;
    expect(input.tagName).toBe('INPUT');
    const group = input.closest('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Qty を編集');
    // 編集中のセルが aria-owns でエディタを子に持つ(支援技術ではエディタがセルの中に入る)。
    expect(group?.id).toBeTruthy();
    expect(cellAt(setupGrid(shell), 2, 3).getAttribute('aria-owns')).toBe(group?.id);
    expect(document.querySelectorAll(`[aria-owns="${group?.id}"]`).length).toBe(1);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.querySelectorAll('[aria-owns]').length).toBe(0);
  });

  it('縦固定で複製したラベル行(aria-hidden)の中のボタンは Tab で止まらない', () => {
    type LRow = { id: string; kind?: 'label'; name: string };
    const labelRows: LRow[] = [
      { id: 's1', kind: 'label', name: 'セクション 1' },
      ...Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: `row ${i}` })),
    ];
    const { container } = render(
      <SpreadsheetGrid<LRow>
        rows={labelRows}
        columns={[{ key: 'name', title: '名称', width: 160 }]}
        rowKeyGetter={(row) => row.id}
        labelRow={{
          isLabelRow: (row) => row.kind === 'label',
          getLabel: (row) => row.name,
          sticky: true,
          render: (ctx) => <button type="button">{ctx.label} を開閉</button>,
        }}
      />,
    );
    const scroller = container.querySelector<HTMLElement>('.ssg-scroll-container') as HTMLElement;
    act(() => {
      scroller.scrollTop = 200;
      fireEvent.scroll(scroller);
    });
    const cloneButtons = container.querySelectorAll<HTMLButtonElement>('.ssg-sticky-label-layer button');
    expect(cloneButtons.length).toBeGreaterThan(0);
    cloneButtons.forEach((button) => {
      expect(button.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(button.getAttribute('tabindex')).toBe('-1');
    });
    // 本物のラベル行のボタンは Tab で止まる(手を付けない)。
    const realButtons = [...container.querySelectorAll<HTMLButtonElement>('[data-ssg-label-row] button')].filter(
      (button) => !button.closest('.ssg-sticky-label-layer'),
    );
    realButtons.forEach((button) => {
      expect(button.getAttribute('tabindex')).toBeNull();
    });
  });

  it('checkbox 列のセルは列名をアクセシブル名に持つ', () => {
    type FlagRow = { id: number; done: boolean };
    const flagColumns: GridColumn<FlagRow>[] = [
      { key: 'done', title: '完了', width: 80, editor: { type: 'checkbox' } },
    ];
    const { container } = render(
      <SpreadsheetGrid<FlagRow> rows={[{ id: 1, done: true }]} columns={flagColumns} rowKeyGetter={(row) => row.id} />,
    );
    const box = within(container.querySelector('[role="grid"]') as HTMLElement).getByRole('checkbox', { name: '完了' });
    expect(box.getAttribute('aria-checked')).toBe('true');
  });

  it('上部バーの検索欄とコンテキストメニューの区切りに役割・名前がある(V-14)', () => {
    const { container, grid } = setup({
      enableContextMenu: true,
      getContextMenuItems: () => [
        { kind: 'action', key: 'a', label: 'A', onSelect: () => {} },
        { kind: 'separator', key: 's' },
        { kind: 'action', key: 'b', label: 'B', onSelect: () => {} },
      ],
    });
    expect(within(container).getByRole('textbox', { name: '表全体を検索' })).toBeTruthy();
    fireEvent.contextMenu(cellAt(grid, 2, 2), { clientX: 10, clientY: 10 });
    expect(document.querySelectorAll('[role="separator"]').length).toBe(1);
  });

  // 構造の不変条件: 支援技術に見える row は必ずセルを持ち、セルは必ず row の直下にあり、
  //   aria-rowindex を持つ row は表示順(data-row-index)+ 2 と一致する(3 ペインに分かれた同じ行は同じ番号)。
  const expectGridStructure = (grid: HTMLElement) => {
    const isExposed = (element: Element) => element.closest('[aria-hidden="true"]') === null;
    const cellSelector = '[role="gridcell"], [role="rowheader"], [role="columnheader"]';
    const exposedRows = Array.from(grid.querySelectorAll('[role="row"]')).filter(isExposed);
    expect(exposedRows.length).toBeGreaterThan(0);
    for (const rowEl of exposedRows) {
      expect(Array.from(rowEl.children).some((child) => child.matches(cellSelector))).toBe(true);
      const dataRowIndex = rowEl.getAttribute('data-row-index');
      if (dataRowIndex !== null && rowEl.hasAttribute('aria-rowindex')) {
        expect(rowEl.getAttribute('aria-rowindex')).toBe(String(Number(dataRowIndex) + 2));
      }
    }
    for (const cell of Array.from(grid.querySelectorAll(cellSelector)).filter(isExposed)) {
      expect(cell.parentElement?.getAttribute('role')).toBe('row');
    }
  };

  it('固定列(左右)・行選択があっても構造が崩れない', () => {
    const pinned: GridColumn<Row>[] = [
      { key: 'name', title: 'Name', width: 160, pinned: 'left' },
      { key: 'qty', title: 'Qty', width: 100, pinned: 'right' },
      { key: 'id', title: 'ID', width: 80 },
    ];
    const { grid } = setup({ columns: pinned, enableRowSelection: true });
    expectGridStructure(grid);
    // 同じ行の 3 ペインぶんの row は同じ aria-rowindex。列番号は見た目の順(左固定 → 中央 → 右固定)で通し。
    expect(grid.querySelectorAll('[role="row"][aria-rowindex="2"]').length).toBe(3);
    expect(cellAt(grid, 2, 2).textContent).toContain('alpha');
    expect(cellAt(grid, 2, 3).getAttribute('data-ssg-col-key')).toBe('id');
    expect(cellAt(grid, 2, 4).textContent).toContain('10');
  });

  it('ラベル行: 行番号のある帯は rowheader、中身は gridcell、どちらも無い帯は支援技術から隠す', () => {
    type LRow = { id: string; kind?: 'label'; name: string; qty: number };
    const labelRows: LRow[] = [
      { id: 's1', kind: 'label', name: 'セクション 1', qty: 0 },
      { id: 'a', name: 'alpha', qty: 1 },
    ];
    const labelColumns: GridColumn<LRow>[] = [
      { key: 'id', title: 'ID', width: 80, pinned: 'left' },
      { key: 'name', title: '名称', width: 160 },
      { key: 'qty', title: '数量', width: 100, pinned: 'right' },
    ];
    const { container } = render(
      <SpreadsheetGrid<LRow>
        rows={labelRows}
        columns={labelColumns}
        rowKeyGetter={(row) => row.id}
        labelRow={{ isLabelRow: (row) => row.kind === 'label', getLabel: (row) => row.name }}
      />,
    );
    const grid = container.querySelector<HTMLElement>('[role="grid"]') as HTMLElement;
    expectGridStructure(grid);
    const label = (pane: string) =>
      grid.querySelector<HTMLElement>(`[data-pane="${pane}"][data-ssg-label-row]`) as HTMLElement;
    expect(label('left').getAttribute('aria-rowindex')).toBe('2');
    expect(label('left').querySelector('[role="rowheader"]')).not.toBeNull();
    expect(within(label('center')).getByRole('gridcell').textContent).toContain('セクション 1');
    expect(label('right').getAttribute('aria-hidden')).toBe('true');
    // 後続のデータ行の番号はラベル行のぶん進む。
    expect(cellAt(grid, 3, 3).textContent).toContain('alpha');
  });

  it('グループ行: 行番号は rowheader、中身は gridcell で、データ行と通しの aria-rowindex', () => {
    type GRow = { id: number; region: string; qty: number };
    const groupColumns: GridColumn<GRow>[] = [
      { key: 'region', title: '地域', width: 100, rowGroup: true },
      { key: 'qty', title: '数量', width: 100, aggFunc: 'sum' },
    ];
    const { container } = render(
      <SpreadsheetGrid<GRow>
        rows={[
          { id: 1, region: '東', qty: 1 },
          { id: 2, region: '西', qty: 2 },
        ]}
        columns={groupColumns}
        rowKeyGetter={(row) => row.id}
      />,
    );
    const grid = container.querySelector<HTMLElement>('[role="grid"]') as HTMLElement;
    expectGridStructure(grid);
    const groupRows = Array.from(grid.querySelectorAll<HTMLElement>('[data-ssg-group-row][role="row"]'));
    expect(groupRows.length).toBeGreaterThan(0);
    for (const groupRow of groupRows) {
      expect(groupRow.hasAttribute('aria-rowindex')).toBe(true);
    }
  });

  it('展開行: 中央ペインの帯は row + gridcell(カードの中身はそのまま操作できる)、固定ペインの帯は隠す', () => {
    const pinned: GridColumn<Row>[] = [
      { key: 'name', title: 'Name', width: 160, pinned: 'left' },
      { key: 'qty', title: 'Qty', width: 100 },
    ];
    const { grid, ref } = setup({
      columns: pinned,
      detailRow: {
        height: 80,
        render: ({ row }) => <button type="button">{`詳細 ${row.name}`}</button>,
      },
    });
    act(() => {
      ref.current?.setDetailRowExpanded(1, true);
    });
    expectGridStructure(grid);
    const centerBand = grid.querySelector<HTMLElement>('.ssg-center-pane .ssg-detail-band') as HTMLElement;
    expect(centerBand.getAttribute('role')).toBe('row');
    expect(within(centerBand).getByRole('button', { name: '詳細 alpha' })).toBeTruthy();
    const bands = Array.from(grid.querySelectorAll<HTMLElement>('.ssg-detail-band'));
    expect(bands.length).toBe(2);
    // 中央以外(左固定ペイン)の帯は支援技術から隠れる。
    expect(bands.filter((band) => band !== centerBand).every((band) => band.getAttribute('aria-hidden') === 'true')).toBe(
      true,
    );
  });
});