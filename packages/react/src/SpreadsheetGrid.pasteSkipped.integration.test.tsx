// 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-09): 貼り付けで書かなかったセルの通知(onPasteSkipped)と、列の parseClipboardValue に
//   渡す組み込みの数値のパーサ(numberParser)の結合テストです。clientSide(末尾へ足す行を含む)と serverSide(SSRM)。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import type { Ref } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { numberParser } from './common';
import { installJsdomLayoutStubs } from './testing';
import type {
  GridColumn,
  GridPasteSkippedParams,
  ServerSideDataSource,
  SpreadsheetGridHandle,
  SpreadsheetGridProps,
} from './model/gridTypes';

type Row = { id: number; name: string; amount: number | string | null; locked: string };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 100, editable: true },
  {
    key: 'amount',
    title: 'Amount',
    width: 100,
    editable: true,
    editor: { type: 'number', min: 0 },
    validationMode: 'reject',
  },
  { key: 'locked', title: 'Locked', width: 100, editable: false },
];

const INITIAL: Row[] = [
  { id: 1, name: 'a', amount: 1, locked: 'x' },
  { id: 2, name: 'b', amount: 2, locked: 'y' },
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

let currentRows: Row[] = [];

function Harness({
  gridRef,
  gridColumns = columns,
  extra,
}: {
  gridRef: Ref<SpreadsheetGridHandle<Row>>;
  gridColumns?: GridColumn<Row>[];
  extra?: Partial<SpreadsheetGridProps<Row>>;
}) {
  const [rows, setRows] = useState<Row[]>(INITIAL);
  useEffect(() => {
    currentRows = rows;
  }, [rows]);
  return <SpreadsheetGrid ref={gridRef} rows={rows} onRowsChange={setRows} columns={gridColumns} rowKeyGetter={(r) => r.id} {...extra} />;
}

const setup = (extra?: Partial<SpreadsheetGridProps<Row>>, gridColumns?: GridColumn<Row>[]) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const view = render(<Harness gridRef={ref} gridColumns={gridColumns} extra={extra} />);
  const shell = view.container.querySelector<HTMLElement>('.ssg-shell')!;
  return { ref, shell };
};

const paste = (shell: HTMLElement, text: string) => {
  act(() => {
    fireEvent.paste(shell, { clipboardData: { getData: () => text } });
  });
};

describe('onPasteSkipped(clientSide)', () => {
  it('編集できないセルと reject の列で検査に通らない値を、1 回の貼り付けで 1 回知らせる(書いたセルは書く)', () => {
    const onPasteSkipped = vi.fn<(params: GridPasteSkippedParams<Row>) => void>();
    const { ref, shell } = setup({
      onPasteSkipped,
      canEditCell: (_rowIndex, _colIndex, row, column) => !(row.id === 2 && column.key === 'name'),
    });
    act(() => {
      ref.current?.selectCell(0, 0);
    });
    paste(shell, 'A\t¥12,000\tL1\nB\t-5\tL2');
    expect(currentRows.map((row) => [row.name, row.amount, row.locked])).toEqual([
      ['A', 1, 'x'],
      ['b', 2, 'y'],
    ]);
    expect(onPasteSkipped).toHaveBeenCalledTimes(1);
    const cells = onPasteSkipped.mock.calls[0]?.[0].cells ?? [];
    expect(cells.map(({ rowKey, rowIndex, columnKey, colIndex, text, reason, value }) => ({ rowKey, rowIndex, columnKey, colIndex, text, reason, value }))).toEqual([
      { rowKey: 1, rowIndex: 0, columnKey: 'amount', colIndex: 1, text: '¥12,000', reason: 'invalid', value: '¥12,000' },
      { rowKey: 1, rowIndex: 0, columnKey: 'locked', colIndex: 2, text: 'L1', reason: 'readOnly', value: undefined },
      { rowKey: 2, rowIndex: 1, columnKey: 'name', colIndex: 0, text: 'B', reason: 'readOnly', value: undefined },
      { rowKey: 2, rowIndex: 1, columnKey: 'amount', colIndex: 1, text: '-5', reason: 'invalid', value: -5 },
      { rowKey: 2, rowIndex: 1, columnKey: 'locked', colIndex: 2, text: 'L2', reason: 'readOnly', value: undefined },
    ]);
    expect(cells[0]?.row).toBe(INITIAL[0]);
    expect(cells[0]?.message).toBe('数値で入力してください');
    expect(cells[3]?.message).toBe('0 以上で入力してください');
    expect(cells[1]?.message).toBeUndefined();
  });

  it('書かなかったセルが無ければ呼ばない', () => {
    const onPasteSkipped = vi.fn();
    const { ref, shell } = setup({ onPasteSkipped });
    act(() => {
      ref.current?.selectCell(0, 0);
    });
    paste(shell, 'Z\t7');
    expect(currentRows[0]).toMatchObject({ name: 'Z', amount: 7 });
    expect(onPasteSkipped).not.toHaveBeenCalled();
  });

  it('末尾へ足した行のセルも、足した後の位置と行キーで知らせる', () => {
    const onPasteSkipped = vi.fn<(params: GridPasteSkippedParams<Row>) => void>();
    const { ref, shell } = setup({
      onPasteSkipped,
      createRow: () => ({ id: 100, name: '', amount: null, locked: '' }),
    });
    act(() => {
      ref.current?.selectCell(1, 1);
    });
    paste(shell, '3\n-1');
    expect(currentRows.map((row) => row.amount)).toEqual([1, 3, null]);
    const cells = onPasteSkipped.mock.calls[0]?.[0].cells ?? [];
    expect(cells.map(({ rowKey, rowIndex, reason }) => ({ rowKey, rowIndex, reason }))).toEqual([
      { rowKey: 100, rowIndex: 2, reason: 'invalid' },
    ]);
  });

  it('numberParser を parseClipboardValue に渡すと、通貨記号や単位を外して数値で書く', () => {
    const onPasteSkipped = vi.fn();
    const parsing = columns.map((column) =>
      column.key === 'amount'
        ? { ...column, parseClipboardValue: numberParser({ strip: ['¥', '￥', '円'], negativeParentheses: true }) }
        : column,
    );
    const { ref, shell } = setup({ onPasteSkipped }, parsing);
    act(() => {
      ref.current?.selectCell(0, 1);
    });
    paste(shell, '¥12,000\n１，２００円');
    expect(currentRows.map((row) => row.amount)).toEqual([12000, 1200]);
    expect(onPasteSkipped).not.toHaveBeenCalled();
    act(() => {
      ref.current?.selectCell(0, 1);
    });
    // かっこの数は負の数(min: 0 の検査に通らない)。
    paste(shell, '(1,200)');
    expect(currentRows[0]?.amount).toBe(12000);
    expect(onPasteSkipped.mock.calls[0]?.[0].cells[0]).toMatchObject({ reason: 'invalid', value: -1200, text: '(1,200)' });
  });

  it('英語の文言(localeText)ならメッセージも英語', () => {
    const onPasteSkipped = vi.fn<(params: GridPasteSkippedParams<Row>) => void>();
    const { ref, shell } = setup({ onPasteSkipped, localeText: { enterNumber: 'Enter a number' } });
    act(() => {
      ref.current?.selectCell(0, 1);
    });
    paste(shell, 'abc');
    expect(onPasteSkipped.mock.calls[0]?.[0].cells[0]?.message).toBe('Enter a number');
  });
});

describe('onPasteSkipped(serverSide)', () => {
  it('読み込んだ行のうち書かなかったセルを知らせる(書いたセルは updateRows へ)', async () => {
    const serverRows: Row[] = [
      { id: 1, name: 'a', amount: 1, locked: 'x' },
      { id: 2, name: 'b', amount: 2, locked: 'y' },
    ];
    const updateRows = vi.fn(() => Promise.resolve());
    const dataSource: ServerSideDataSource<Row> = {
      getRows: (params) =>
        Promise.resolve({ rows: serverRows.slice(params.startIndex, params.endIndex), totalRowCount: serverRows.length }),
      updateRows,
    };
    const onPasteSkipped = vi.fn<(params: GridPasteSkippedParams<Row>) => void>();
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const view = render(
      <SpreadsheetGrid ref={ref} columns={columns} dataSource={dataSource} rowKeyGetter={(row) => row.id} onPasteSkipped={onPasteSkipped} />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const shell = view.container.querySelector<HTMLElement>('.ssg-shell')!;
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 0 });
    });
    paste(shell, 'A\tx\nB\t9');
    expect(updateRows).toHaveBeenCalledTimes(1);
    const cells = onPasteSkipped.mock.calls[0]?.[0].cells ?? [];
    expect(cells.map(({ rowKey, rowIndex, columnKey, reason }) => ({ rowKey, rowIndex, columnKey, reason }))).toEqual([
      { rowKey: 1, rowIndex: 0, columnKey: 'amount', reason: 'invalid' },
    ]);
  });
});
// 追加(1.2.0 / 2026-11-09 実アプリの総点検 A-08): 1 セルのコピーで選んだ範囲を埋める(既定)と、pasteFillsSelection: false。
describe('pasteFillsSelection', () => {
  it('既定では 1 セルのコピーで範囲を埋め、書かなかったセルは onPasteSkipped へ。元に戻す 1 回で戻る', () => {
    const onPasteSkipped = vi.fn<(params: GridPasteSkippedParams<Row>) => void>();
    const { ref, shell } = setup({ onPasteSkipped });
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 2 } });
    });
    paste(shell, 'Z');
    expect(currentRows.map((row) => [row.name, row.amount, row.locked])).toEqual([
      ['Z', 1, 'x'],
      ['Z', 2, 'y'],
    ]);
    expect(onPasteSkipped.mock.calls[0]?.[0].cells.map((cell) => [cell.rowIndex, cell.columnKey, cell.reason])).toEqual([
      [0, 'amount', 'invalid'],
      [0, 'locked', 'readOnly'],
      [1, 'amount', 'invalid'],
      [1, 'locked', 'readOnly'],
    ]);
    act(() => {
      ref.current?.undo();
    });
    expect(currentRows.map((row) => row.name)).toEqual(['a', 'b']);
  });

  it('pasteFillsSelection: false では範囲の左上から 1 回だけ', () => {
    const { ref, shell } = setup({ pasteFillsSelection: false });
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 0 } });
    });
    paste(shell, 'Z');
    expect(currentRows.map((row) => row.name)).toEqual(['Z', 'b']);
  });
});
