// 行ドラッグの確定まわり(1.0 前の最終チェック FC-02 / FC-12 / FC-31)の結合テストです。
//   - FC-02: rowKeyGetter が無い(行キー = index)とき、確定後の画面の並び(live 方式の translateY)と滑り込み(FLIP)が
//     データの並びと合うこと。
//   - FC-12: ドラッグ中に行の並びが外から変わっても、掴んだ行を動かすこと(消えていれば取り消す)。
//   - FC-31: 利用側が並びを反映しなかったときの滑り込みの予約が、後の無関係な変化で使われないこと。
//   寸法 / 矩形のスタブは SpreadsheetGrid.rowDrag.integration.test.tsx と同じで、行の矩形だけは translateY から求めます
//   (FLIP の before / after を測るため)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useState } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import type { GridColumn, RowMoveParams, SpreadsheetGridHandle } from './model/gridTypes';

const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 40;

const TRANSLATE_Y = /translateY\((-?[\d.]+)px\)/;
// 行以外の矩形を読んだときに呼ぶ関数(FLIP の始点を置いた直後の強制リフローで、始点を控えるため)。
let rectProbe: (() => void) | null = null;

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 1600 });
  // @tanstack/virtual-core 3.19 から、列の仮想化は見える幅を clientWidth で読みます(3.17 までは offsetWidth)。
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 900 });
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element) {
    let top = 0;
    if (this instanceof HTMLElement && this.classList.contains('ssg-body-row')) {
      const match = TRANSLATE_Y.exec(this.style.transform);
      top = HEADER_HEIGHT + (match ? parseFloat(match[1]) : 0);
    } else {
      rectProbe?.();
    }
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      right: 1600,
      bottom: top === 0 ? 900 : top + ROW_HEIGHT,
      width: 1600,
      height: top === 0 ? 900 : ROW_HEIGHT,
      toJSON: () => ({}),
    } as DOMRect;
  };
});

afterEach(() => {
  cleanup();
  document.body.style.cursor = '';
});

type Row = { id: string; name: string };
const initialRows: Row[] = [
  { id: 'a', name: 'alpha' },
  { id: 'b', name: 'beta' },
  { id: 'c', name: 'gamma' },
];
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: '名称', width: 160 },
];

const upperHalfY = (index: number) => HEADER_HEIGHT + index * ROW_HEIGHT + 5;
const lowerHalfY = (index: number) => HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT - 5;
const dispatchWindowPointer = (type: string, pointerId: number, clientY: number) => {
  const event = new window.PointerEvent(type, { pointerId, clientX: 100, clientY, bubbles: true });
  if (event.pointerId !== pointerId) Object.defineProperty(event, 'pointerId', { value: pointerId });
  window.dispatchEvent(event);
};
const nextFrame = () =>
  act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });

const centerRows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-pane="center"].ssg-body-row[data-row-index]'));
const rowById = (container: HTMLElement, id: string) =>
  centerRows(container).find((row) => row.querySelector('[data-ssg-col-key="id"]')?.textContent === id) ?? null;
// 画面上の縦位置(translateY)の順に並べた行の id。
const visualOrder = (container: HTMLElement) =>
  centerRows(container)
    .map((row) => ({
      y: parseFloat(TRANSLATE_Y.exec(row.style.transform)?.[1] ?? 'NaN'),
      id: row.querySelector('[data-ssg-col-key="id"]')?.textContent ?? '',
    }))
    .sort((left, right) => left.y - right.y)
    .map((entry) => entry.id);

const dragRow = (container: HTMLElement, fromIndex: number, toClientY: number) => {
  const handle = container.querySelector<HTMLElement>(
    `[data-pane="center"][data-row-index="${fromIndex}"] .ssg-row-drag-handle`,
  );
  expect(handle).not.toBeNull();
  act(() => {
    fireEvent.pointerDown(handle as HTMLElement, {
      button: 0,
      buttons: 1,
      pointerId: 1,
      clientX: 100,
      clientY: upperHalfY(fromIndex),
    });
  });
  act(() => {
    dispatchWindowPointer('pointermove', 1, toClientY);
  });
  act(() => {
    dispatchWindowPointer('pointerup', 1, toClientY);
  });
};

type HarnessProps = { withKey: boolean; motion: 'ghost' | 'live' };
const Harness = ({ withKey, motion }: HarnessProps) => {
  const [rows, setRows] = useState(initialRows);
  return (
    <SpreadsheetGrid
      columns={columns}
      rows={rows}
      rowKeyGetter={withKey ? (row: Row) => row.id : undefined}
      onRowsChange={setRows}
      enableRowDrag
      rowDragMotion={motion}
      motion="on"
      rowHeight={ROW_HEIGHT}
      headerHeight={HEADER_HEIGHT}
    />
  );
};

describe('行ドラッグの確定後の画面の並び(FC-02)', () => {
  it.each([true, false])('live 方式(rowKeyGetter %s): 行 0 を末尾へ動かすと画面の並びも b, c, a', (withKey) => {
    const { container } = render(<Harness withKey={withKey} motion="live" />);
    dragRow(container, 0, lowerHalfY(2));
    expect(visualOrder(container)).toEqual(['b', 'c', 'a']);
    // 動かした行は新しい位置(index 2)にいて、ドラッグ中の印は残らない。
    expect(rowById(container, 'a')?.getAttribute('data-row-index')).toBe('2');
    expect(container.querySelector('[data-ssg-row-dragging]')).toBeNull();
  });

  // 確定直後の FLIP の始点(transition を止めて置いた位置)を控えます。
  const recordFlipStarts = (container: HTMLElement, run: () => void): Map<string, string> => {
    const starts = new Map<string, string>();
    rectProbe = () => {
      for (const row of centerRows(container)) {
        if (row.style.transition !== 'none') continue;
        const id = row.querySelector('[data-ssg-col-key="id"]')?.textContent ?? '';
        if (!starts.has(id)) starts.set(id, row.style.transform);
      }
    };
    try {
      run();
    } finally {
      rectProbe = null;
    }
    return starts;
  };
  const pressAndMove = (container: HTMLElement, fromIndex: number, clientY: number) => {
    const handle = container.querySelector<HTMLElement>(
      `[data-pane="center"][data-row-index="${fromIndex}"] .ssg-row-drag-handle`,
    );
    act(() => {
      fireEvent.pointerDown(handle as HTMLElement, {
        button: 0,
        buttons: 1,
        pointerId: 1,
        clientX: 100,
        clientY: upperHalfY(fromIndex),
      });
    });
    act(() => {
      dispatchWindowPointer('pointermove', 1, clientY);
    });
  };

  it('ghost 方式・rowKeyGetter なし: 確定後は各行が「確定前にその行が見えていた位置」から滑る', () => {
    const { container } = render(<Harness withKey={false} motion="ghost" />);
    pressAndMove(container, 0, lowerHalfY(2));
    const starts = recordFlipStarts(container, () => {
      act(() => {
        dispatchWindowPointer('pointerup', 1, lowerHalfY(2));
      });
    });
    expect(visualOrder(container)).toEqual(['b', 'c', 'a']);
    // 行の translateY は見出しの高さを含みます(index i の行 = HEADER_HEIGHT + i * ROW_HEIGHT)。
    //   b(index 1 → 0)と c(2 → 1)は 1 行下から上がり、a(0 → 2)は先頭から下がる。
    const rowY = (index: number) => `translateY(${HEADER_HEIGHT + index * ROW_HEIGHT}px)`;
    expect(starts.get('b')).toBe(rowY(1));
    expect(starts.get('c')).toBe(rowY(2));
    expect(starts.get('a')).toBe(rowY(0));
    for (const row of centerRows(container)) {
      expect(row.style.transition).toContain('transform');
    }
  });

  it('live 方式・rowKeyGetter なし: 掴んだ行は離した位置から滑り、退避済みの行は動かない', () => {
    const { container } = render(<Harness withKey={false} motion="live" />);
    pressAndMove(container, 0, lowerHalfY(2));
    const droppedAt = rowById(container, 'a')?.style.transform;
    const starts = recordFlipStarts(container, () => {
      act(() => {
        dispatchWindowPointer('pointerup', 1, lowerHalfY(2));
      });
    });
    expect(visualOrder(container)).toEqual(['b', 'c', 'a']);
    expect(starts.get('a')).toBe(droppedAt);
    expect(starts.has('b')).toBe(false);
    expect(starts.has('c')).toBe(false);
  });
});

describe('ドラッグ中に行の並びが変わる(FC-12)', () => {
  const renderGrid = (rows: Row[], calls: RowMoveParams<Row>[], withKey = true) => (
    <SpreadsheetGrid
      columns={columns}
      rows={rows}
      rowKeyGetter={withKey ? (row: Row) => row.id : undefined}
      onRowsChange={() => {}}
      onRowMove={(params) => calls.push(params)}
      enableRowDrag
      rowHeight={ROW_HEIGHT}
      headerHeight={HEADER_HEIGHT}
    />
  );
  const startDrag = (container: HTMLElement, fromIndex: number) => {
    const handle = container.querySelector<HTMLElement>(
      `[data-pane="center"][data-row-index="${fromIndex}"] .ssg-row-drag-handle`,
    );
    act(() => {
      fireEvent.pointerDown(handle as HTMLElement, {
        button: 0,
        buttons: 1,
        pointerId: 1,
        clientX: 100,
        clientY: upperHalfY(fromIndex),
      });
    });
  };
  const finishDrag = (clientY: number) => {
    act(() => {
      dispatchWindowPointer('pointermove', 1, clientY);
    });
    act(() => {
      dispatchWindowPointer('pointerup', 1, clientY);
    });
  };

  it('先頭に行が足されても、掴んだ行(a)を今の並びで動かす', () => {
    const calls: RowMoveParams<Row>[] = [];
    const { container, rerender } = render(renderGrid(initialRows, calls));
    startDrag(container, 0);
    const nextRows = [{ id: 'new', name: 'new' }, ...initialRows];
    rerender(renderGrid(nextRows, calls));
    finishDrag(lowerHalfY(3));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.rowKey).toBe('a');
    expect(calls[0]?.fromIndex).toBe(1);
    expect(calls[0]?.rows.map((row) => row.id)).toEqual(['new', 'b', 'c', 'a']);
  });

  it('行が作り直されても(同じキー)キーで探して動かす', () => {
    const calls: RowMoveParams<Row>[] = [];
    const { container, rerender } = render(renderGrid(initialRows, calls));
    startDrag(container, 0);
    rerender(renderGrid([...initialRows.slice(1), { ...initialRows[0] }], calls));
    // a は今 index 2。先頭(index 0 の上)へ。
    finishDrag(upperHalfY(0));
    expect(calls[0]?.rowKey).toBe('a');
    expect(calls[0]?.rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('掴んだ行が消えたら離しても何もしない', () => {
    const calls: RowMoveParams<Row>[] = [];
    const { container, rerender } = render(renderGrid(initialRows, calls));
    startDrag(container, 0);
    rerender(renderGrid(initialRows.slice(1), calls));
    finishDrag(lowerHalfY(1));
    expect(calls).toHaveLength(0);
    expect(container.querySelector('[data-ssg-row-dragging]')).toBeNull();
  });

  // 追加(FC-12 の見直し): live 方式で掴んだ行が消えて取り消したとき、残りの行を古い基準位置へ戻さない。
  it('live 方式: 掴んだ行が消えて取り消しても、残りの行は今の位置に並ぶ', () => {
    const renderLive = (rows: Row[]) => (
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        rowKeyGetter={(row: Row) => row.id}
        onRowsChange={() => {}}
        enableRowDrag
        rowDragMotion="live"
        motion="on"
        rowHeight={ROW_HEIGHT}
        headerHeight={HEADER_HEIGHT}
      />
    );
    const { container, rerender } = render(renderLive(initialRows));
    startDrag(container, 0);
    act(() => {
      dispatchWindowPointer('pointermove', 1, lowerHalfY(1));
    });
    rerender(renderLive(initialRows.slice(1)));
    expect(container.querySelector('[data-ssg-row-dragging]')).toBeNull();
    // 行の translateY は見出しの高さ + index × 行の高さ。
    expect(rowById(container, 'b')?.style.transform).toBe(`translateY(${HEADER_HEIGHT}px)`);
    expect(rowById(container, 'c')?.style.transform).toBe(`translateY(${HEADER_HEIGHT + ROW_HEIGHT}px)`);
    act(() => {
      dispatchWindowPointer('pointerup', 1, lowerHalfY(1));
    });
  });

  it('rowKeyGetter なし: 行の数が同じまま作り直されただけなら掴んだときの位置で動かし、数が変われば取り消す', () => {
    const calls: RowMoveParams<Row>[] = [];
    const { container, rerender } = render(renderGrid(initialRows, calls, false));
    startDrag(container, 0);
    rerender(renderGrid(initialRows.map((row) => ({ ...row })), calls, false));
    finishDrag(lowerHalfY(2));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.rows.map((row) => row.id)).toEqual(['b', 'c', 'a']);

    startDrag(container, 0);
    rerender(renderGrid([{ id: 'new', name: 'new' }, ...initialRows.map((row) => ({ ...row }))], calls, false));
    finishDrag(lowerHalfY(3));
    expect(calls).toHaveLength(1);
  });
});

describe('並びを反映しなかったときの滑り込みの予約(FC-31)', () => {
  // 追加(FC-02 の見直し): 断ったのに同じフレームの再描画で rows の参照だけが変わっても、行を滑らせない。
  for (const motion of ['ghost', 'live'] as const) {
    for (const withKey of [true, false]) {
      it(`${motion} 方式・rowKeyGetter ${withKey ? 'あり' : 'なし'}: 利用側が断り、同じフレームで rows の参照だけが変わっても滑らない`, () => {
        const Rejecting = () => {
          const [, setTick] = useState(0);
          return (
            <SpreadsheetGrid
              columns={columns}
              rows={initialRows.filter(() => true)}
              rowKeyGetter={withKey ? (row: Row) => row.id : undefined}
              onRowsChange={() => setTick((tick) => tick + 1)}
              enableRowDrag
              rowDragMotion={motion}
              motion="on"
              rowHeight={ROW_HEIGHT}
              headerHeight={HEADER_HEIGHT}
            />
          );
        };
        const { container } = render(<Rejecting />);
        dragRow(container, 0, lowerHalfY(2));
        expect(visualOrder(container)).toEqual(['a', 'b', 'c']);
        for (const row of centerRows(container)) {
          expect(row.style.transition).not.toContain('transform');
        }
      });
    }
  }

  it('利用側が onRowsChange を反映しなければ、後で行が変わっても古い位置から滑らない', async () => {
    const renderGrid = (rows: Row[]) => (
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        rowKeyGetter={(row: Row) => row.id}
        onRowsChange={() => {}}
        enableRowDrag
        motion="on"
        rowHeight={ROW_HEIGHT}
        headerHeight={HEADER_HEIGHT}
      />
    );
    const { container, rerender } = render(renderGrid(initialRows));
    dragRow(container, 0, lowerHalfY(2));
    await nextFrame();
    // 後から無関係な理由で行の並びが変わる(サーバーの順など)。
    rerender(renderGrid([initialRows[2], initialRows[0], initialRows[1]]));
    for (const row of centerRows(container)) {
      expect(row.style.transition).toBe('');
    }
  });
});
// 追加(アプリの再確認): ドラッグで離したら行のホバーを外す。ドラッグ中はハンドルがポインタを受けるのでホバーは掴んだ行の
//   位置のまま残り、離した後はそこへ来た別の行に印が付いていた。
describe('離した後の行のホバー', () => {
  it('ドラッグで離すと行のホバーを外す(onHoveredRowChange に null)', () => {
    const hovered: (number | null)[] = [];
    const HoverHarness = () => {
      const [rows, setRows] = useState(initialRows);
      return (
        <SpreadsheetGrid
          columns={columns}
          rows={rows}
          rowKeyGetter={(row: Row) => row.id}
          onRowsChange={setRows}
          enableRowDrag
          rowHeight={ROW_HEIGHT}
          headerHeight={HEADER_HEIGHT}
          onHoveredRowChange={(index) => hovered.push(index)}
        />
      );
    };
    const { container } = render(<HoverHarness />);
    const cell = container.querySelector<HTMLElement>('[data-pane="center"][data-row-index="0"] [data-ssg-col-key="name"]');
    act(() => {
      fireEvent.pointerEnter(cell as HTMLElement);
    });
    expect(hovered.at(-1)).toBe(0);
    dragRow(container, 0, lowerHalfY(2));
    expect(centerRows(container).length).toBeGreaterThan(0);
    expect(hovered.at(-1)).toBeNull();
  });
});

// 追加(1.0.2 / 2026-11-09 実アプリの総点検 RV-F3): ドラッグの後、フォーカスはグリッドに入るのにアクティブセルが無く、
//   続けて ↓ を押すと表の先頭へ飛んでいた。
describe('行ドラッグの後のアクティブセル(RV-F3)', () => {
  const renderWithRef = () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const Wrapped = () => {
      const [rows, setRows] = useState(initialRows);
      return (
        <SpreadsheetGrid
          ref={ref}
          columns={columns}
          rows={rows}
          rowKeyGetter={(row: Row) => row.id}
          onRowsChange={setRows}
          enableRowDrag
          rowDragMotion="ghost"
          motion="off"
          rowHeight={ROW_HEIGHT}
          headerHeight={HEADER_HEIGHT}
        />
      );
    };
    const view = render(<Wrapped />);
    return { ...view, ref };
  };

  it('離した行(動かした先)の先頭のデータ列がアクティブセルになり、↓ で次の行へ', () => {
    const { container, ref } = renderWithRef();
    dragRow(container, 2, upperHalfY(0));
    const firstDataCol = ref.current?.getColIndex('id');
    expect(firstDataCol).toBeGreaterThan(0);
    expect(ref.current?.getActiveCell()).toEqual({ row: 0, col: firstDataCol });
    const shell = container.querySelector<HTMLElement>('.ssg-shell') as HTMLElement;
    expect(document.activeElement).toBe(shell);
    act(() => {
      fireEvent.keyDown(shell, { key: 'ArrowDown' });
    });
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: firstDataCol });
  });

  it('アクティブセルがデータ列にあればその列を保つ', () => {
    const { container, ref } = renderWithRef();
    const nameCol = ref.current?.getColIndex('name') ?? -1;
    act(() => {
      ref.current?.selectCell(1, nameCol);
    });
    dragRow(container, 0, lowerHalfY(2));
    expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: nameCol });
  });
});