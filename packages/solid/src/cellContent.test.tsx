// セルと見出しの中身を作り直さないことの確かめ(段階 1-1 で実ブラウザの確かめで見つけた不具合の回帰テスト)。
//   Solid は React と違い要素を使い回さないので、中身を作る式がホバーやアクティブセルの変化を読むと、そのたびに
//   中身の要素が作り直される。pointerdown と pointerup が別の要素に落ちて click が起きず、チェックボックスのセルや
//   renderCell / renderHeader の中のボタンが押せなかった。
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createSignal, flush } from 'solid-js';
import { fireEvent, render } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from './index';

type Row = { id: number; name: string; qty: number; done: boolean };

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}`, qty: i * 10, done: false }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

const cellOf = (container: HTMLElement, row: number, key: string) => {
  const cell = container.querySelector<HTMLElement>(`.ssg-body-row[data-row-index="${row}"] [data-ssg-col-key="${key}"]`);
  if (!cell) {
    throw new Error(`セルがありません: ${row} ${key}`);
  }
  return cell;
};

const hover = (target: Element) => {
  target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerId: 1 }));
  target.dispatchEvent(new PointerEvent('pointerenter', { pointerId: 1 }));
};

function setup(columns: GridColumn<Row>[]) {
  const onRowsChange = vi.fn();
  let handle: SpreadsheetGridHandle<Row> | undefined;
  const result = render(() => {
    const [rows, setRows] = createSignal(makeRows(30));
    return (
      <SpreadsheetGrid<Row>
        ref={(h) => {
          handle = h;
        }}
        rows={rows()}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        onRowsChange={(next) => {
          onRowsChange(next);
          setRows(next);
        }}
        height={300}
      />
    );
  });
  flush();
  return { ...result, onRowsChange, getHandle: () => handle };
}

describe('セルと見出しの中身', () => {
  it('ホバー・アクティブセル・選択が変わっても、チェックボックスのセルの要素は同じまま(押すと切り替わる)', () => {
    const { container, onRowsChange } = setup([
      { key: 'name', title: '品名', width: 120 },
      { key: 'done', title: '済', width: 60, editor: { type: 'checkbox' } },
    ]);
    const checkbox = cellOf(container, 2, 'done').querySelector('.ssg-cell-checkbox');
    expect(checkbox).not.toBeNull();
    hover(cellOf(container, 5, 'name'));
    flush();
    hover(cellOf(container, 2, 'done'));
    flush();
    fireEvent.pointerDown(cellOf(container, 2, 'done'), { button: 0, pointerId: 1 });
    flush();
    fireEvent.pointerUp(window, { button: 0, pointerId: 1 });
    flush();
    expect(cellOf(container, 2, 'done').querySelector('.ssg-cell-checkbox')).toBe(checkbox);
    fireEvent.click(checkbox as Element);
    flush();
    expect(onRowsChange).toHaveBeenCalledTimes(1);
    expect(onRowsChange.mock.calls[0]?.[0][2]).toMatchObject({ id: 3, done: true });
  });

  it('renderCell の中身はアクティブセルが変わっても作り直さず、状態は ctx から読んだ所で追従する', () => {
    const renderCell = vi.fn((ctx: { isActive: boolean; row: Row }) => (
      <button type="button" class="probe" data-active={ctx.isActive ? 'yes' : 'no'}>
        {ctx.row.name}
      </button>
    ));
    const { container } = setup([
      { key: 'name', title: '品名', width: 120 },
      { key: 'act', title: '操作', width: 100, renderCell },
    ]);
    const button = cellOf(container, 1, 'act').querySelector('.probe');
    const callsBefore = renderCell.mock.calls.length;
    fireEvent.pointerDown(cellOf(container, 1, 'act'), { button: 0, pointerId: 1 });
    flush();
    fireEvent.pointerUp(window, { button: 0, pointerId: 1 });
    flush();
    hover(cellOf(container, 4, 'name'));
    flush();
    expect(cellOf(container, 1, 'act').querySelector('.probe')).toBe(button);
    expect(button?.getAttribute('data-active')).toBe('yes');
    expect(renderCell.mock.calls.length).toBe(callsBefore);
  });

  it('renderCell の setValue は、並びが変わった後でも描いた行へ書く', () => {
    let setters = new Map<number, (value: unknown) => void>();
    const { container, onRowsChange, getHandle } = setup([
      { key: 'name', title: '品名', width: 120 },
      { key: 'qty', title: '数量', width: 80, editor: { type: 'number' } },
      {
        key: 'probe',
        title: '書く',
        width: 80,
        renderCell: (ctx) => {
          setters.set(ctx.row.id, (value) => ctx.setValue(value));
          return String(ctx.row.id);
        },
      },
    ]);
    expect(container.querySelector('.ssg-body-cell')).not.toBeNull();
    const writeToId3 = setters.get(3);
    setters = new Map();
    getHandle()?.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] });
    flush();
    writeToId3?.('書いた');
    flush();
    expect(onRowsChange).toHaveBeenCalledTimes(1);
    const written = onRowsChange.mock.calls[0]?.[0] as (Row & { probe?: unknown })[];
    expect(written.find((row) => row.id === 3)).toMatchObject({ probe: '書いた' });
    expect(written.filter((row) => 'probe' in row)).toHaveLength(1);
  });

  it('renderHeader の中身は列見出しのホバーや選択で作り直さない', () => {
    const renderHeader = vi.fn(() => (
      <button type="button" class="header-probe">
        並べ替え
      </button>
    ));
    const { container } = setup([
      { key: 'name', title: '品名', width: 140, renderHeader },
      { key: 'qty', title: '数量', width: 80 },
    ]);
    const header = container.querySelector<HTMLElement>('.ssg-header-cell[data-ssg-col-key="name"]');
    const button = header?.querySelector('.header-probe');
    expect(button).toBeTruthy();
    const callsBefore = renderHeader.mock.calls.length;
    const qtyHeader = container.querySelector<HTMLElement>('.ssg-header-cell[data-ssg-col-key="qty"]');
    hover(qtyHeader as HTMLElement);
    flush();
    fireEvent.pointerDown(qtyHeader as HTMLElement, { button: 0, pointerId: 1 });
    flush();
    fireEvent.pointerUp(window, { button: 0, pointerId: 1 });
    flush();
    hover(header as HTMLElement);
    flush();
    expect(header?.querySelector('.header-probe')).toBe(button);
    expect(renderHeader.mock.calls.length).toBe(callsBefore);
  });
});