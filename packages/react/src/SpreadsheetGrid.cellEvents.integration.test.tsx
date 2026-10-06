// 追加(G-1)の回帰テスト: セル操作の通知(onCellClick / onCellDoubleClick / onActiveCellChange)です。
//   実グリッドを render し、
//   ①データセルのクリックで行データ + rowKey + 列 + DOM の MouseEvent が届き、列ヘッダー / 行番号 / ラベル行 /
//     セル以外(範囲選択ドラッグを離した共通の親)では呼ばれない
//   ②ダブルクリックは読み取り専用セルでも呼ばれ、preventDefault() で編集開始を止められる
//   ③アクティブセルの変化はクリック / キー操作 / ハンドル由来を問わず通知され、同じセルへの再設定では呼ばれず、
//     座標が同じでも行が入れ替わったら通知される
//   を検証します。本体行 / セルの描画には testing サブパスの installJsdomLayoutStubs を使います。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type {
  GridCellDoubleClickParams,
  GridColumn,
  LabelRowOptions,
  SpreadsheetGridHandle,
} from './model/gridTypes';

type Row = { id: string; kind?: 'label'; name: string; qty: number };

const rows: Row[] = [
  { id: 'a', name: 'alpha', qty: 5 },
  { id: 'b', name: 'beta', qty: 12 },
  { id: 'c', name: 'gamma', qty: 30 },
];

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160 },
  { key: 'qty', title: '数量', width: 100, readOnly: true },
];

const rowKeyGetter = (row: Row) => row.id;

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

const getBodyRows = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('.ssg-body-row'));

// viewRowIndex 行の colIndex 番目のデータセルを返します。
const getCell = (container: HTMLElement, rowIndex: number, colIndex: number): HTMLElement => {
  const cell = getBodyRows(container)[rowIndex]?.querySelectorAll<HTMLElement>('.ssg-body-cell')[colIndex];
  if (!cell) {
    throw new Error(`セル (${rowIndex}, ${colIndex}) が見つかりません`);
  }
  return cell;
};

const getShell = (container: HTMLElement): HTMLElement => {
  const shell = container.querySelector<HTMLElement>('.ssg-shell');
  if (!shell) {
    throw new Error('ssg-shell が見つかりません');
  }
  return shell;
};

// クリック 1 回ぶん(pointerdown → click)。pointerdown がアクティブセルを動かし、click が onCellClick を呼びます。
const clickCell = (cell: HTMLElement, init: MouseEventInit = {}) => {
  fireEvent.pointerDown(cell, { button: 0, pointerType: 'mouse', pointerId: 1 });
  fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
  fireEvent.click(cell, { button: 0, ...init });
};

describe('セル操作の通知(G-1)', () => {
  it('onCellClick: データセルのクリックで行データ + rowKey + 列 + DOM の MouseEvent が届く', () => {
    const onCellClick = vi.fn();
    const { container } = render(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        rowKeyGetter={rowKeyGetter}
        onCellClick={onCellClick}
      />,
    );

    clickCell(getCell(container, 1, 1), { ctrlKey: true });
    expect(onCellClick).toHaveBeenCalledTimes(1);
    const params = onCellClick.mock.calls[0][0];
    expect(params).toMatchObject({
      row: rows[1],
      rowKey: 'b',
      rowIndex: 1,
      sourceRowIndex: 1,
      columnKey: 'qty',
      colIndex: 1,
      value: 12,
    });
    expect(params.row).toBe(rows[1]);
    expect(params.column).toBe(columns[1]);
    // React の合成イベントではなく DOM 標準の MouseEvent(修飾キーを読める)。
    expect(params.event).toBeInstanceOf(MouseEvent);
    expect(params.event.ctrlKey).toBe(true);
  });

  it('onCellClick: 列ヘッダー / 行番号 / セル以外(範囲選択ドラッグを離した共通の親)では呼ばれない', () => {
    const onCellClick = vi.fn();
    const { container } = render(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        rowKeyGetter={rowKeyGetter}
        onCellClick={onCellClick}
      />,
    );

    const headerCells = Array.from(
      container.querySelectorAll<HTMLElement>('.ssg-header-cell:not(.ssg-row-header-cell):not(.ssg-corner-cell)'),
    );
    expect(headerCells.length).toBeGreaterThan(0);
    headerCells.forEach((cell) => fireEvent.click(cell));
    const rowHeader = getBodyRows(container)[0]?.querySelector<HTMLElement>('.ssg-row-header-cell');
    expect(rowHeader).not.toBeNull();
    fireEvent.click(rowHeader!);
    // 別のセルで離したときの click は、2 つのセルの共通の親(行コンテナ等)で発火する。
    fireEvent.click(getBodyRows(container)[0]!);
    expect(onCellClick).not.toHaveBeenCalled();
  });

  it('onCellClick: ラベル行では呼ばれない', () => {
    const onCellClick = vi.fn();
    const labelRow: LabelRowOptions<Row> = {
      isLabelRow: (row) => row.kind === 'label',
      getLabel: (row) => row.name,
    };
    const withLabel: Row[] = [{ id: 's1', kind: 'label', name: 'セクション', qty: 0 }, ...rows];
    const { container } = render(
      <SpreadsheetGrid<Row>
        rows={withLabel}
        columns={columns}
        rowKeyGetter={rowKeyGetter}
        labelRow={labelRow}
        onCellClick={onCellClick}
      />,
    );
    const labelRowEl = container.querySelector<HTMLElement>('.ssg-body-row[data-ssg-label-row]');
    expect(labelRowEl).not.toBeNull();
    fireEvent.click(labelRowEl!);
    labelRowEl!.querySelectorAll<HTMLElement>('*').forEach((el) => fireEvent.click(el));
    expect(onCellClick).not.toHaveBeenCalled();

    // 対照: ラベル行の次のデータ行(view index 1)は通知される。
    clickCell(getCell(container, 1, 0));
    expect(onCellClick).toHaveBeenCalledWith(expect.objectContaining({ rowKey: 'a', rowIndex: 1 }));
  });

  it('onCellDoubleClick: 読み取り専用セルでも呼ばれ、未 preventDefault なら従来どおり編集を開始する', () => {
    const onCellDoubleClick = vi.fn();
    const { container } = render(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={() => {}}
        onCellDoubleClick={onCellDoubleClick}
      />,
    );

    fireEvent.doubleClick(getCell(container, 0, 1));
    expect(onCellDoubleClick).toHaveBeenCalledWith(
      expect.objectContaining({ rowKey: 'a', columnKey: 'qty', event: expect.any(MouseEvent) }),
    );
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();

    fireEvent.doubleClick(getCell(container, 2, 0));
    expect(onCellDoubleClick).toHaveBeenLastCalledWith(
      expect.objectContaining({ row: rows[2], rowKey: 'c', columnKey: 'name' }),
    );
    expect(container.querySelector('.ssg-cell-editor-input')).not.toBeNull();
  });

  it('onCellDoubleClick: preventDefault() で編集開始を止められる', () => {
    const onCellDoubleClick = vi.fn((params: GridCellDoubleClickParams<Row>) => {
      params.preventDefault();
    });
    const { container } = render(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={() => {}}
        onCellDoubleClick={onCellDoubleClick}
      />,
    );

    // 実ブラウザと同じく、ダブルクリックの前の pointerdown でアクティブセルが決まる。
    clickCell(getCell(container, 0, 0));
    fireEvent.doubleClick(getCell(container, 0, 0));
    expect(onCellDoubleClick).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
    // F2 / Enter など、ダブルクリック以外の編集開始は止めない。
    fireEvent.keyDown(getShell(container), { key: 'F2' });
    expect(container.querySelector('.ssg-cell-editor-input')).not.toBeNull();
    expect(onCellDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('onActiveCellChange: クリック / キー操作 / ハンドル由来で通知され、同じセルへの再設定では呼ばれない', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onActiveCellChange = vi.fn();
    const { container } = render(
      <SpreadsheetGrid<Row>
        ref={ref}
        rows={rows}
        columns={columns}
        rowKeyGetter={rowKeyGetter}
        onActiveCellChange={onActiveCellChange}
      />,
    );
    // 初回マウントでは呼ばない。
    expect(onActiveCellChange).not.toHaveBeenCalled();

    clickCell(getCell(container, 0, 0));
    expect(onActiveCellChange).toHaveBeenCalledTimes(1);
    expect(onActiveCellChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ row: rows[0], rowKey: 'a', rowIndex: 0, columnKey: 'name', colIndex: 0 }),
    );

    // 同じセルのクリック(再設定)では呼ばない。
    clickCell(getCell(container, 0, 0));
    expect(onActiveCellChange).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(getShell(container), { key: 'ArrowDown' });
    expect(onActiveCellChange).toHaveBeenCalledTimes(2);
    expect(onActiveCellChange).toHaveBeenLastCalledWith(expect.objectContaining({ rowKey: 'b', rowIndex: 1 }));

    act(() => {
      ref.current?.setActiveCell({ row: 2, col: 1 });
    });
    expect(onActiveCellChange).toHaveBeenCalledTimes(3);
    expect(onActiveCellChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ rowKey: 'c', columnKey: 'qty', value: 30 }),
    );
  });

  it('onActiveCellChange: 座標が同じでも行が入れ替わったら通知し、行データの更新だけでは呼ばない', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onActiveCellChange = vi.fn();
    const props = {
      ref,
      columns,
      rowKeyGetter,
      onActiveCellChange,
    };
    const { rerender } = render(<SpreadsheetGrid<Row> {...props} rows={rows} />);
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 0 });
    });
    expect(onActiveCellChange).toHaveBeenLastCalledWith(expect.objectContaining({ rowKey: 'a' }));
    expect(onActiveCellChange).toHaveBeenCalledTimes(1);

    // 同じ並びで中身だけ変わった rows(編集の反映など)では呼ばない。
    const edited = rows.map((row) => (row.id === 'a' ? { ...row, name: 'ALPHA' } : row));
    rerender(<SpreadsheetGrid<Row> {...props} rows={edited} />);
    expect(onActiveCellChange).toHaveBeenCalledTimes(1);

    // 並びが変わり、同じ座標に別の行が来たら通知する。
    rerender(<SpreadsheetGrid<Row> {...props} rows={[...edited].reverse()} />);
    expect(onActiveCellChange).toHaveBeenCalledTimes(2);
    expect(onActiveCellChange).toHaveBeenLastCalledWith(expect.objectContaining({ rowKey: 'c', rowIndex: 0 }));
  });
});