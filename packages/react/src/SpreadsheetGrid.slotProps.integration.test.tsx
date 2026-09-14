// 追加(slot-props / StyleX 併用)の回帰テスト: className 系スロットの `{ className, style }` 形と
//   ルート style prop です。実グリッドを render し、
//   ① root: className / style prop と classNames.root(オブジェクト形)が合成される
//   ② classNames の各スロット(文字列 / オブジェクト)が対応要素へ class + inline style で届き、
//      グリッドの座標 / 寸法(left / transform)はスロット style より後勝ちになる
//   ③ cellClassName / getRowClassName がオブジェクト形を返せる(セル / 行 / 行ヘッダーへ付与)
//   ④ 空状態 / チェックボックス / 既定バー / アクティブセル枠のスロット
//   を検証します。本体行 / セルの描画には testing サブパスの installJsdomLayoutStubs を使います。
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

const getRows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.ssg-body-row'));

const getCell = (container: HTMLElement, rowIndex: number, colIndex: number) => {
  const cell = getRows(container)[rowIndex]?.querySelectorAll<HTMLElement>(
    '.ssg-body-cell',
  )[colIndex];
  if (!cell) {
    throw new Error(`セル (${rowIndex}, ${colIndex}) が見つかりません`);
  }
  return cell;
};

const must = <E extends Element>(el: E | null, label: string): E => {
  if (!el) {
    throw new Error(`${label} が見つかりません`);
  }
  return el;
};

describe('slot-props: ルート', () => {
  it('className / style prop と classNames.root(オブジェクト形)が合成され、style prop が後勝ち', () => {
    const { container } = render(
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        className="my-grid"
        style={{ height: 480, color: 'rgb(9, 9, 9)' }}
        classNames={{
          root: {
            className: 'x-root',
            style: { '--ssg-accent': 'rgb(1, 1, 1)', color: 'rgb(2, 2, 2)' } as never,
          },
        }}
      />,
    );
    const root = must(container.querySelector<HTMLElement>('.ssg-root'), '.ssg-root');
    expect(root.classList.contains('my-grid')).toBe(true);
    expect(root.classList.contains('x-root')).toBe(true);
    expect(root.style.height).toBe('480px');
    expect(root.style.getPropertyValue('--ssg-accent')).toBe('rgb(1, 1, 1)');
    // 同じプロパティは style prop(後勝ち)。
    expect(root.style.color).toBe('rgb(9, 9, 9)');
  });

  it('classNames を毎レンダー新しいオブジェクトで渡しても描画は安定する(署名 memo)', () => {
    const view = render(
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        classNames={{ bodyCell: { className: 'x-a', style: { color: 'red' } } }}
      />,
    );
    view.rerender(
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        classNames={{ bodyCell: { className: 'x-a', style: { color: 'red' } } }}
      />,
    );
    expect(getCell(view.container, 0, 0).classList.contains('x-a')).toBe(true);
    view.rerender(
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        classNames={{ bodyCell: { className: 'x-b', style: { color: 'blue' } } }}
      />,
    );
    const cell = getCell(view.container, 0, 0);
    expect(cell.classList.contains('x-a')).toBe(false);
    expect(cell.classList.contains('x-b')).toBe(true);
    expect(cell.style.color).toBe('blue');
  });
});

describe('slot-props: classNames の各スロット', () => {
  it('ヘッダー / 本体 / 行ヘッダー / コーナー / 行へ class + inline style が届き、座標はグリッドが後勝ち', () => {
    const { container } = render(
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        classNames={{
          headerRow: 'x-hr',
          headerCell: { className: 'x-hc', style: { color: 'rgb(1, 2, 3)', left: 999 } },
          bodyRow: { className: 'x-br', style: { outline: '1px solid red' } },
          bodyCell: { className: 'x-bc', style: { backgroundColor: 'rgb(4, 5, 6)', left: 999 } },
          rowHeaderCell: 'x-rh',
          cornerCell: { className: 'x-cc', style: { color: 'rgb(7, 8, 9)' } },
        }}
      />,
    );
    const headerRow = must(container.querySelector<HTMLElement>('.ssg-header-row'), '.ssg-header-row');
    expect(headerRow.classList.contains('x-hr')).toBe(true);

    const headerCell = must(
      container.querySelector<HTMLElement>('.ssg-header-cell:not(.ssg-corner-cell):not(.ssg-row-header-cell)'),
      '列ヘッダーセル',
    );
    expect(headerCell.classList.contains('x-hc')).toBe(true);
    expect(headerCell.style.color).toBe('rgb(1, 2, 3)');
    expect(headerCell.style.left).not.toBe('999px');

    const corner = must(container.querySelector<HTMLElement>('.ssg-corner-cell'), '.ssg-corner-cell');
    expect(corner.classList.contains('x-rh')).toBe(true);
    expect(corner.classList.contains('x-cc')).toBe(true);
    expect(corner.style.color).toBe('rgb(7, 8, 9)');

    const rowHeader = must(container.querySelector<HTMLElement>('.ssg-row-header-cell'), '.ssg-row-header-cell');
    expect(rowHeader.classList.contains('x-rh')).toBe(true);
    expect(rowHeader.classList.contains('x-cc')).toBe(false);

    const row = getRows(container)[0];
    expect(row?.classList.contains('x-br')).toBe(true);
    expect(row?.style.outline).toBe('1px solid red');
    // 行位置(transform)はグリッドが設定したまま。
    expect(row?.style.transform).toMatch(/translateY\(/);

    const cell = getCell(container, 0, 0);
    expect(cell.classList.contains('x-bc')).toBe(true);
    expect(cell.style.backgroundColor).toBe('rgb(4, 5, 6)');
    expect(cell.style.left).not.toBe('999px');
  });

  it('空状態 / 既定バー / チェックボックス / アクティブセル枠のスロット', () => {
    const empty = render(
      <SpreadsheetGrid
        rows={[]}
        columns={columns}
        classNames={{
          emptyState: { className: 'x-empty', style: { color: 'rgb(1, 1, 1)' } },
          statusBar: 'x-status',
          toolbar: 'x-toolbar',
        }}
      />,
    );
    const emptyState = must(empty.container.querySelector<HTMLElement>('.ssg-empty-state'), '.ssg-empty-state');
    expect(emptyState.classList.contains('x-empty')).toBe(true);
    expect(emptyState.style.color).toBe('rgb(1, 1, 1)');
    expect(
      must(empty.container.querySelector<HTMLElement>('.ssg-bar--bottom'), '.ssg-bar--bottom').classList.contains('x-status'),
    ).toBe(true);
    expect(
      must(empty.container.querySelector<HTMLElement>('.ssg-bar--top'), '.ssg-bar--top').classList.contains('x-toolbar'),
    ).toBe(true);
    cleanup();

    const { container } = render(
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        enableRowSelection
        classNames={{
          checkbox: { className: 'x-check', style: { borderRadius: '50%' } },
          activeCellOverlay: { className: 'x-active', style: { outline: '2px solid red' } },
        }}
      />,
    );
    const checkbox = must(container.querySelector<HTMLElement>('.ssg-row-checkbox'), '.ssg-row-checkbox');
    expect(checkbox.classList.contains('x-check')).toBe(true);
    expect(checkbox.style.borderRadius).toBe('50%');

    fireEvent.pointerDown(getCell(container, 1, 1), { button: 0, pointerId: 1 });
    const overlay = must(container.querySelector<HTMLElement>('.ssg-active-cell-overlay'), '.ssg-active-cell-overlay');
    expect(overlay.classList.contains('x-active')).toBe(true);
    expect(overlay.style.outline).toBe('2px solid red');
    // 位置はグリッドが決める(absolute)。
    expect(overlay.style.position).toBe('absolute');
  });
});

describe('slot-props: cellClassName / getRowClassName のオブジェクト形', () => {
  it('セル / 行 / 行ヘッダーへ class + style が付与され、文字列形と混在できる', () => {
    const cols: GridColumn<Row>[] = [
      {
        key: 'name',
        title: '名前',
        width: 160,
        cellClassName: { className: 'x-name', style: { fontWeight: 700 } },
      },
      {
        key: 'qty',
        title: '数量',
        width: 100,
        cellClassName: (ctx) =>
          ctx.row.qty >= 10
            ? { className: 'x-large', style: { color: 'rgb(3, 3, 3)', width: 1 } }
            : 'x-small',
      },
    ];
    const { container } = render(
      <SpreadsheetGrid
        rows={rows}
        columns={cols}
        getRowClassName={(row) =>
          row.id === 2
            ? { className: 'x-row-2', style: { backgroundColor: 'rgb(5, 5, 5)' } }
            : undefined
        }
      />,
    );
    const nameCell = getCell(container, 0, 0);
    expect(nameCell.classList.contains('x-name')).toBe(true);
    expect(nameCell.style.fontWeight).toBe('700');

    expect(getCell(container, 0, 1).classList.contains('x-small')).toBe(true);
    const large = getCell(container, 1, 1);
    expect(large.classList.contains('x-large')).toBe(true);
    expect(large.style.color).toBe('rgb(3, 3, 3)');
    // 列幅はグリッドが後勝ち(width: 1 は効かない)。
    expect(large.style.width).toBe('100px');

    const row2 = getRows(container)[1];
    expect(row2?.classList.contains('x-row-2')).toBe(true);
    expect(row2?.style.backgroundColor).toBe('rgb(5, 5, 5)');
    const row2Header = row2?.querySelector<HTMLElement>('.ssg-row-header-cell');
    expect(row2Header?.classList.contains('x-row-2')).toBe(true);
    expect(row2Header?.style.backgroundColor).toBe('rgb(5, 5, 5)');
    const row2Cell = getCell(container, 1, 0);
    expect(row2Cell.classList.contains('x-row-2')).toBe(true);
    expect(row2Cell.style.backgroundColor).toBe('rgb(5, 5, 5)');
    // 別行には付かない。
    expect(getRows(container)[0]?.classList.contains('x-row-2')).toBe(false);
  });
});