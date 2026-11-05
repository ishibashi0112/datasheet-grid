// 追加(1.0 前の最終チェック): 編集と入力の所見(FC-01 / FC-09 / FC-10 / FC-11 / FC-13 / FC-17 / FC-18)の回帰テストです。
//   FC-01 固定列で ↓ と動いたときも縦に追従する / FC-09 何も変えずに確定しても値を書き直さない / FC-10 エディタは編集中の
//   セルに重ねる / FC-11 終わった編集の custom エディタの ctx.commit は何もしない / FC-13 Safari の変換確定の Enter
//   (keyCode 229)でセルを確定しない / FC-17 number 列を英字から打ち始めたら text で開く / FC-18 Enter の移動でラベル行を
//   読み飛ばす。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import type { Ref } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle, SpreadsheetGridProps } from './model/gridTypes';

let restore: () => void;
beforeAll(() => {
  restore = installJsdomLayoutStubs();
});
afterAll(() => {
  restore();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Row = { id: number; due?: unknown; qty?: unknown; memo?: unknown; kind?: 'label' };

let currentRows: Row[] = [];
let changeCount = 0;

function Harness({
  gridRef,
  columns,
  initialRows,
  extra,
}: {
  gridRef: Ref<SpreadsheetGridHandle<Row>>;
  columns: GridColumn<Row>[];
  initialRows: Row[];
  extra?: Partial<SpreadsheetGridProps<Row>>;
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  useEffect(() => {
    currentRows = rows;
  }, [rows]);
  return (
    <SpreadsheetGrid
      ref={gridRef}
      columns={columns}
      rows={rows}
      onRowsChange={(next) => {
        changeCount += 1;
        setRows(next);
      }}
      rowKeyGetter={(row) => row.id}
      {...extra}
    />
  );
}

const setup = (columns: GridColumn<Row>[], initialRows: Row[], extra?: Partial<SpreadsheetGridProps<Row>>) => {
  changeCount = 0;
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const utils = render(<Harness gridRef={ref} columns={columns} initialRows={initialRows} extra={extra} />);
  const shell = utils.container.querySelector<HTMLElement>('.ssg-shell')!;
  return { ...utils, ref, shell };
};

const editorInput = (container: HTMLElement) => container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });

describe('FC-09: 何も変えずに確定しても書き直さない', () => {
  const columns: GridColumn<Row>[] = [
    { key: 'id', title: 'ID', width: 80 },
    { key: 'due', title: 'Due', width: 140, editable: true, editor: { type: 'date' } },
    { key: 'qty', title: 'Qty', width: 100, editable: true },
    { key: 'memo', title: 'Memo', width: 100, editable: true, editor: { type: 'number' } },
  ];

  it.each([
    ['date の ISO 日時(時刻を落とさない)', 1, '2026-07-14T09:30:00Z'],
    ['date の読めない値(null にしない)', 1, '未定'],
    ['text の数値(文字列にしない)', 2, 5],
    ['text の null(空文字にしない)', 2, null],
    ['number の 3 桁区切りの文字列', 3, '1,234'],
  ])('%s: F2 → Enter で値も onRowsChange も変わらない', (_name, col, value) => {
    const key = columns[col].key as keyof Row;
    const { ref, shell, container } = setup(columns, [{ id: 1, [key]: value }]);
    act(() => {
      ref.current?.setActiveCell({ row: 0, col });
    });
    fireEvent.keyDown(shell, { key: 'F2' });
    fireEvent.keyDown(editorInput(container)!, { key: 'Enter' });
    expect(currentRows[0][key]).toBe(value);
    expect(changeCount).toBe(0);
    expect(editorInput(container)).toBeNull();
    expect(ref.current?.canUndo()).toBe(false);
  });

  it('blur で閉じても同じ。変えたときは従来どおり書く', async () => {
    const { ref, shell, container } = setup(columns, [{ id: 1, due: '未定', qty: 5 }]);
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'Enter' });
    fireEvent.blur(editorInput(container)!);
    expect(currentRows[0].due).toBe('未定');
    await nextFrame();
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 2 });
    });
    fireEvent.keyDown(shell, { key: 'F2' });
    fireEvent.change(editorInput(container)!, { target: { value: '6' } });
    fireEvent.keyDown(editorInput(container)!, { key: 'Enter' });
    expect(currentRows[0].qty).toBe('6');
    expect(changeCount).toBe(1);
  });

  it('何も変えない Enter でも下へ移動する', async () => {
    const { ref, shell, container } = setup(columns, [
      { id: 1, qty: 1 },
      { id: 2, qty: 2 },
    ]);
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 2 });
    });
    fireEvent.keyDown(shell, { key: 'F2' });
    fireEvent.keyDown(editorInput(container)!, { key: 'Enter' });
    await nextFrame();
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 2 });
  });
});

describe('FC-17: number 列を数値でない文字から打ち始めたとき', () => {
  const columns: GridColumn<Row>[] = [
    { key: 'id', title: 'ID', width: 80 },
    { key: 'qty', title: 'Qty', width: 100, editable: true, editor: { type: 'number' } },
  ];

  it('英字なら text で開いてその文字を見せる(確定する値と見えている値が同じ)', () => {
    const { ref, shell, container } = setup(columns, [{ id: 1, qty: 10 }]);
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'a' });
    const input = editorInput(container)!;
    expect(input.type).toBe('text');
    expect(input.value).toBe('a');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(currentRows[0].qty).toBe('a');
  });

  it('数字なら従来どおり type="number"。全角や 3 桁区切りの文字列の値は半角の数値で開く', () => {
    const { ref, shell, container } = setup(columns, [
      { id: 1, qty: 10 },
      { id: 2, qty: '１２' },
    ]);
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.keyDown(shell, { key: '7' });
    expect(editorInput(container)!.type).toBe('number');
    expect(editorInput(container)!.value).toBe('7');
    fireEvent.keyDown(editorInput(container)!, { key: 'Escape' });
    act(() => {
      ref.current?.setActiveCell({ row: 1, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'F2' });
    expect(editorInput(container)!.type).toBe('number');
    expect(editorInput(container)!.value).toBe('12');
  });
});

describe('FC-13: Safari の変換を確定する Enter(isComposing=false / keyCode 229)', () => {
  const columns: GridColumn<Row>[] = [
    { key: 'id', title: 'ID', width: 80 },
    { key: 'memo', title: 'Memo', width: 160, editable: true },
  ];
  it('エディタでは確定に使わず、ふつうの Enter で確定する', () => {
    const { ref, shell, container } = setup(columns, [{ id: 1, memo: 'a' }]);
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'F2' });
    const input = editorInput(container)!;
    fireEvent.change(input, { target: { value: 'a東京' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: false });
    expect(editorInput(container)).not.toBeNull();
    expect(currentRows[0].memo).toBe('a');
    fireEvent.keyDown(input, { key: 'Escape', keyCode: 229 });
    expect(editorInput(container)).not.toBeNull();
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(currentRows[0].memo).toBe('a東京');
  });
});

describe('FC-10: エディタは編集中のセルに重ねる', () => {
  const columns: GridColumn<Row>[] = [
    { key: 'id', title: 'ID', width: 80 },
    { key: 'memo', title: 'Memo', width: 160, editable: true },
  ];
  it('編集中に selectCell で別の行を選んでもエディタは動かず、確定は編集中のセルへ', () => {
    const { ref, shell, container } = setup(columns, [
      { id: 1, memo: 'a' },
      { id: 2, memo: 'b' },
      { id: 3, memo: 'c' },
    ]);
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'F2' });
    const wrapper = () => container.querySelector<HTMLElement>('.ssg-cell-editor');
    const topBefore = wrapper()!.style.top;
    act(() => {
      ref.current?.selectCell(2, 1);
    });
    expect(wrapper()!.style.top).toBe(topBefore);
    fireEvent.change(editorInput(container)!, { target: { value: 'XYZ' } });
    fireEvent.keyDown(editorInput(container)!, { key: 'Enter' });
    expect(currentRows.map((r) => r.memo)).toEqual(['XYZ', 'b', 'c']);
  });
});

describe('FC-11: 終わった編集の custom エディタの ctx', () => {
  it('取消のあとに始めた別のセルの編集へ、前の ctx.commit / ctx.cancel は効かない', async () => {
    const captured: { commit?: (v: unknown) => unknown; cancel?: () => void }[] = [];
    const columns: GridColumn<Row>[] = [
      { key: 'id', title: 'ID', width: 80 },
      {
        key: 'memo',
        title: 'Memo',
        width: 160,
        editable: true,
        editor: {
          type: 'custom',
          render: (ctx) => {
            captured.push({ commit: ctx.commit, cancel: ctx.cancel });
            return <span data-testid="custom">{String(ctx.value)}</span>;
          },
        },
      },
    ];
    const { ref, shell, container } = setup(columns, [
      { id: 1, memo: 'a' },
      { id: 2, memo: 'b' },
    ]);
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'F2' });
    const ctxA = captured[captured.length - 1];
    act(() => {
      ctxA.cancel!();
    });
    await nextFrame();
    act(() => {
      ref.current?.setActiveCell({ row: 1, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'F2' });
    let result: unknown;
    act(() => {
      result = ctxA.commit!('late-from-A');
    });
    expect(result).toEqual({ status: 'noop' });
    act(() => {
      ctxA.cancel!();
    });
    expect(container.querySelector('[data-testid="custom"]')).not.toBeNull();
    expect(currentRows.map((r) => r.memo)).toEqual(['a', 'b']);
    // 今の編集の ctx は効く
    const ctxB = captured[captured.length - 1];
    act(() => {
      ctxB.commit!('B!');
    });
    expect(currentRows.map((r) => r.memo)).toEqual(['a', 'B!']);
  });
});

describe('FC-18: Enter で確定した後の移動はラベル行を読み飛ばす', () => {
  const columns: GridColumn<Row>[] = [
    { key: 'id', title: 'ID', width: 80 },
    { key: 'memo', title: 'Memo', width: 160, editable: true },
  ];
  const labelRow: SpreadsheetGridProps<Row>['labelRow'] = {
    isLabelRow: (row) => row.kind === 'label',
    getLabel: (row) => String(row.memo),
  };

  it.each([
    ['down', 0, 2],
    ['up', 2, 0],
  ] as const)('editorEnterMove=%s', async (move, from, to) => {
    const { ref, shell, container } = setup(
      columns,
      [
        { id: 1, memo: 'a' },
        { id: 2, memo: 'S2', kind: 'label' },
        { id: 3, memo: 'c' },
      ],
      { labelRow, editorEnterMove: move },
    );
    act(() => {
      ref.current?.setActiveCell({ row: from, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'F2' });
    fireEvent.change(editorInput(container)!, { target: { value: 'X' } });
    fireEvent.keyDown(editorInput(container)!, { key: 'Enter' });
    await nextFrame();
    expect(ref.current?.getActiveCell()).toEqual({ row: to, col: 1 });
  });

  it('先がラベル行だけなら確定した行に留まる', async () => {
    const { ref, shell, container } = setup(
      columns,
      [
        { id: 1, memo: 'a' },
        { id: 2, memo: 'S2', kind: 'label' },
      ],
      { labelRow },
    );
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'F2' });
    fireEvent.change(editorInput(container)!, { target: { value: 'X' } });
    fireEvent.keyDown(editorInput(container)!, { key: 'Enter' });
    await nextFrame();
    expect(ref.current?.getActiveCell()).toEqual({ row: 0, col: 1 });
  });
});

describe('FC-01: 固定列でのキーボード移動も縦に追従する', () => {
  const run = (pinned: 'left' | 'right' | undefined) => {
    const columns: GridColumn<Row>[] = [
      { key: 'memo', title: '名前', width: 160, pinned },
      { key: 'qty', title: '数量', width: 100 },
    ];
    const rows: Row[] = Array.from({ length: 200 }, (_, i) => ({ id: i, memo: `n${i}`, qty: i }));
    const calls: ScrollToOptions[] = [];
    vi.spyOn(Element.prototype, 'scrollTo').mockImplementation(function (this: Element, ...a: unknown[]) {
      calls.push(a[0] as ScrollToOptions);
    });
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <SpreadsheetGrid<Row> ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} height={300} />,
    );
    const col = pinned === 'right' ? 1 : 0;
    act(() => {
      ref.current?.setActiveCell({ row: 0, col });
    });
    const shell = container.querySelector('.ssg-shell') as HTMLElement;
    for (let i = 0; i < 30; i += 1) {
      act(() => {
        fireEvent.keyDown(shell, { key: 'ArrowDown' });
      });
    }
    return { active: ref.current?.getActiveCell(), calls, col };
  };

  it.each([undefined, 'left', 'right'] as const)('pinned=%s', (pinned) => {
    const r = run(pinned);
    expect(r.active).toEqual({ row: 30, col: r.col });
    expect(r.calls.length).toBeGreaterThan(5);
    const last = r.calls[r.calls.length - 1];
    expect(last.top).toBeGreaterThan(0);
    // 固定列は横にスクロールさせない
    if (pinned) {
      expect(r.calls.every((call) => call.left === 0)).toBe(true);
    }
  });
});