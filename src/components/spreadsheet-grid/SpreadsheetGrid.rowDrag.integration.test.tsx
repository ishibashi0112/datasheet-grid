// SpreadsheetGrid を実際に render し、行ドラッグ並び替え(row-drag batch 1〜3)の配線を実行検証する
//   結合テストです。配列移動 / スロット解決は logic/rowReorder.test.ts、controller の window リスナー
//   後始末は hooks/useRowDragController.test.ts が正本で、ここでは実コンポーネント越しに
//   「ハンドル列の注入条件 / ドラッグ&ドロップ → onRowsChange・onRowMove / キャンセル経路 /
//   undo 連携 / ソート・フィルター中の無効化 / moveRow()」を確認します。
//   行の DOM を検証するため展開行結合テストと同じ寸法スタブを使い、ヒットテスト(getBoundingClientRect
//   ベース)のためコンテナ矩形もスタブします。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useState } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { ROW_DRAG_HANDLE_COLUMN_KEY, ROW_DRAG_DISABLED_TOOLTIP } from './logic/rowReorder';
import { GRID_STATE_VERSION } from './logic/gridState';
import type {
  GridColumn,
  GridState,
  RowMoveParams,
  ServerSideDataSource,
  SpreadsheetGridHandle,
} from './model/gridTypes';

const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 40;

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      ResizeObserverStub;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 1600,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 900,
  });
  // ヒットテストはスクロールコンテナ / 中央ペインの矩形を基準にします。jsdom は常に 0 矩形のため、
  //   全要素を原点 (0,0) の広い矩形にします(枠外判定は clientY で行うため、これで
  //   「clientY = HEADER_HEIGHT + 行 top」がそのまま content-y になります)。
  Element.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1600,
      bottom: 900,
      width: 1600,
      height: 900,
      toJSON: () => ({}),
    }) as DOMRect;
});

afterEach(() => {
  cleanup();
  document.body.style.cursor = '';
});

type Row = { id: string; name: string; qty: number };

const rows: Row[] = [
  { id: 'a', name: 'alpha', qty: 10 },
  { id: 'b', name: 'beta', qty: 0 },
  { id: 'c', name: 'gamma', qty: 30 },
];

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: '名称', width: 160 },
  { key: 'qty', title: '数量', width: 100 },
];

const rowKeyGetter = (row: Row) => row.id;

const headerKeys = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>('.ssg-header-row [data-ssg-col-key]'),
  ).map((cell) => cell.dataset.ssgColKey);
const headerCell = (container: HTMLElement, key: string) =>
  container.querySelector<HTMLElement>(
    `.ssg-header-row [data-ssg-col-key="${key}"]`,
  );
const handleAt = (container: HTMLElement, index: number) =>
  container.querySelector<HTMLElement>(
    `[data-pane="center"][data-row-index="${index}"] .ssg-row-drag-handle`,
  );
const centerIndicator = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(
    '.ssg-center-pane .ssg-row-drop-indicator',
  );
const getShell = (container: HTMLElement): HTMLElement => {
  const shell = container.querySelector<HTMLElement>('.ssg-shell');
  if (!shell) {
    throw new Error('ssg-shell が見つかりません');
  }
  return shell;
};

// 行 index の「上半分」/「下半分」の clientY(ヒットテストで slot = index / index + 1 になる)。
const upperHalfY = (index: number) => HEADER_HEIGHT + index * ROW_HEIGHT + 5;
const lowerHalfY = (index: number) =>
  HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT - 5;

// window へ PointerEvent を dispatch します(controller は window 登録 + pointerId フィルタ)。
const dispatchWindowPointer = (
  type: string,
  pointerId: number,
  clientY: number,
) => {
  const ev = new window.PointerEvent(type, {
    pointerId,
    clientX: 100,
    clientY,
    bubbles: true,
  });
  if (ev.pointerId !== pointerId) {
    Object.defineProperty(ev, 'pointerId', { value: pointerId });
  }
  window.dispatchEvent(ev);
};

const pressHandle = (handle: HTMLElement, pointerId: number, clientY: number) => {
  fireEvent.pointerDown(handle, {
    button: 0,
    buttons: 1,
    pointerId,
    clientX: 100,
    clientY,
  });
};

const sortedState: GridState = {
  version: GRID_STATE_VERSION,
  columnWidths: {},
  filters: { globalText: '', columnFilters: {} },
  sort: [{ columnKey: 'qty', direction: 'asc' }],
};

const filteredState: GridState = {
  version: GRID_STATE_VERSION,
  columnWidths: {},
  filters: {
    globalText: '',
    columnFilters: { name: { kind: 'text', value: 'alp' } },
  },
  sort: [],
};

describe('行ドラッグ並び替え(結合)', () => {
  it('enableRowDrag: 先頭にハンドル列(28px・空タイトル)が入り、各行にハンドルが出る。未指定なら入らない', () => {
    const { container, rerender } = render(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={() => {}}
        enableRowDrag
        rowHeight={ROW_HEIGHT}
        headerHeight={HEADER_HEIGHT}
      />,
    );
    expect(headerKeys(container)).toEqual([
      ROW_DRAG_HANDLE_COLUMN_KEY,
      'id',
      'name',
      'qty',
    ]);
    const header = headerCell(container, ROW_DRAG_HANDLE_COLUMN_KEY);
    expect(header?.style.width).toBe('28px');
    expect(header?.textContent).toBe('');
    // 列メニュー(⋮)は合成列には出ません。
    expect(header?.querySelector('[data-ssg-tooltip="列メニュー"]')).toBeNull();
    for (let i = 0; i < rows.length; i += 1) {
      const handle = handleAt(container, i);
      expect(handle).not.toBeNull();
      expect(handle?.classList.contains('ssg-row-drag-handle--disabled')).toBe(false);
    }
    // ガイド線(非表示)は各ペインに常設されます。
    expect(centerIndicator(container)).not.toBeNull();

    rerender(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={() => {}}
        rowHeight={ROW_HEIGHT}
        headerHeight={HEADER_HEIGHT}
      />,
    );
    expect(headerKeys(container)).toEqual(['id', 'name', 'qty']);
    expect(handleAt(container, 0)).toBeNull();
    expect(centerIndicator(container)).toBeNull();
  });

  it('利用不可(onRowsChange なし / serverSide / 行グルーピング)ではハンドル列を出さない', () => {
    const withoutRowsChange = render(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        enableRowDrag
      />,
    );
    expect(headerKeys(withoutRowsChange.container)).toEqual(['id', 'name', 'qty']);
    withoutRowsChange.unmount();

    const dataSource: ServerSideDataSource<Row> = {
      getRows: async () => ({ rows, totalRowCount: rows.length }),
    };
    const serverSide = render(
      <SpreadsheetGrid
        columns={columns}
        dataSource={dataSource}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={() => {}}
        enableRowDrag
      />,
    );
    expect(headerKeys(serverSide.container)).toEqual(['id', 'name', 'qty']);
    serverSide.unmount();

    const groupedColumns: GridColumn<Row>[] = [
      { ...columns[0], rowGroup: true },
      columns[1],
      columns[2],
    ];
    const grouped = render(
      <SpreadsheetGrid
        columns={groupedColumns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={() => {}}
        enableRowDrag
      />,
    );
    expect(headerKeys(grouped.container)).not.toContain(ROW_DRAG_HANDLE_COLUMN_KEY);
  });

  it('isRowDraggable=false の行にはハンドルを描画しない(列は残る)', () => {
    const { container } = render(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={() => {}}
        enableRowDrag
        isRowDraggable={(row, ctx) => row.qty !== 0 && ctx.rowKey !== 'zzz'}
        rowHeight={ROW_HEIGHT}
        headerHeight={HEADER_HEIGHT}
      />,
    );
    expect(handleAt(container, 0)).not.toBeNull();
    expect(handleAt(container, 1)).toBeNull();
    expect(handleAt(container, 2)).not.toBeNull();
  });

  it('ドラッグ&ドロップで onRowsChange(移動後の新配列)→ onRowMove の順に呼ばれ、ガイド線が挿入位置に出る', () => {
    const calls: string[] = [];
    const onRowsChange = vi.fn((next: Row[]) => {
      calls.push(`rows:${next.map((row) => row.id).join(',')}`);
    });
    const onRowMove = vi.fn((params: RowMoveParams<Row>) => {
      calls.push(`move:${String(params.rowKey)}:${params.fromIndex}>${params.toIndex}`);
    });
    const { container } = render(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={onRowsChange}
        onRowMove={onRowMove}
        enableRowDrag
        rowHeight={ROW_HEIGHT}
        headerHeight={HEADER_HEIGHT}
      />,
    );
    const handle = handleAt(container, 0);
    expect(handle).not.toBeNull();

    act(() => {
      pressHandle(handle as HTMLElement, 1, upperHalfY(0));
    });
    expect(document.body.style.cursor).toBe('grabbing');
    // ゴースト(body 直下)にラベル(先頭の表示列 = id の値)が出ます。
    const ghost = document.querySelector<HTMLElement>('[data-grid-drag-ghost]');
    expect(ghost?.textContent).toBe('a');
    // 掴んだ行は淡色属性が付きます(3 ペイン分。ここでは center を確認)。
    expect(
      container
        .querySelector('[data-pane="center"][data-row-index="0"]')
        ?.hasAttribute('data-ssg-row-dragging'),
    ).toBe(true);

    // 行 2 の下半分 → slot 3(末尾)。ガイド線は headerHeight + 3 行分の位置。
    act(() => {
      dispatchWindowPointer('pointermove', 1, lowerHalfY(2));
    });
    const indicator = centerIndicator(container);
    expect(indicator?.style.display).toBe('block');
    expect(indicator?.style.top).toBe(`${HEADER_HEIGHT + ROW_HEIGHT * 3}px`);
    expect(onRowsChange).not.toHaveBeenCalled();

    act(() => {
      dispatchWindowPointer('pointerup', 1, lowerHalfY(2));
    });
    expect(document.body.style.cursor).toBe('');
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    expect(centerIndicator(container)?.style.display).toBe('none');
    expect(onRowsChange).toHaveBeenCalledTimes(1);
    expect(onRowMove).toHaveBeenCalledTimes(1);
    const nextRows = onRowsChange.mock.calls[0][0];
    expect(nextRows.map((row) => row.id)).toEqual(['b', 'c', 'a']);
    // 入力配列は不変(新配列で返す)。
    expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(onRowMove.mock.calls[0][0]).toMatchObject({
      rowKey: 'a',
      fromIndex: 0,
      toIndex: 2,
    });
    // onRowMove の rows は onRowsChange と同じ参照。順序は onRowsChange → onRowMove。
    expect(onRowMove.mock.calls[0][0].rows).toBe(nextRows);
    expect(calls).toEqual(['rows:b,c,a', 'move:a:0>2']);
    expect(
      container
        .querySelector('[data-pane="center"][data-row-index="0"]')
        ?.hasAttribute('data-ssg-row-dragging'),
    ).toBe(false);
  });

  it('後方の行を前方へ(行 2 を行 0 の上へ)移動できる', () => {
    const onRowsChange = vi.fn();
    const { container } = render(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={onRowsChange}
        enableRowDrag
        rowHeight={ROW_HEIGHT}
        headerHeight={HEADER_HEIGHT}
      />,
    );
    act(() => {
      pressHandle(handleAt(container, 2) as HTMLElement, 1, upperHalfY(2));
    });
    act(() => {
      dispatchWindowPointer('pointermove', 1, upperHalfY(0));
    });
    expect(centerIndicator(container)?.style.top).toBe(`${HEADER_HEIGHT}px`);
    act(() => {
      dispatchWindowPointer('pointerup', 1, upperHalfY(0));
    });
    expect(onRowsChange).toHaveBeenCalledTimes(1);
    expect(
      (onRowsChange.mock.calls[0][0] as Row[]).map((row) => row.id),
    ).toEqual(['c', 'a', 'b']);
  });

  it('掴んだ行の直上 / 直下(動かない位置)ではガイド線を出さず、離しても何も呼ばれない', () => {
    const onRowsChange = vi.fn();
    const onRowMove = vi.fn();
    const { container } = render(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={onRowsChange}
        onRowMove={onRowMove}
        enableRowDrag
        rowHeight={ROW_HEIGHT}
        headerHeight={HEADER_HEIGHT}
      />,
    );
    act(() => {
      pressHandle(handleAt(container, 1) as HTMLElement, 1, upperHalfY(1));
    });
    // 行 1 の上半分(slot 1)/ 下半分(slot 2)はどちらも「動かない」。
    act(() => {
      dispatchWindowPointer('pointermove', 1, lowerHalfY(1));
    });
    expect(centerIndicator(container)?.style.display).toBe('none');
    act(() => {
      dispatchWindowPointer('pointerup', 1, lowerHalfY(1));
    });
    expect(document.body.style.cursor).toBe('');
    expect(onRowsChange).not.toHaveBeenCalled();
    expect(onRowMove).not.toHaveBeenCalled();
  });

  it('枠外で離す / Escape / pointercancel はキャンセル(何も変更しない)', () => {
    const onRowsChange = vi.fn();
    const { container } = render(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={onRowsChange}
        enableRowDrag
        rowHeight={ROW_HEIGHT}
        headerHeight={HEADER_HEIGHT}
      />,
    );
    // 枠外(コンテナ矩形 bottom=900 より下)で離す。
    act(() => {
      pressHandle(handleAt(container, 0) as HTMLElement, 1, upperHalfY(0));
    });
    act(() => {
      dispatchWindowPointer('pointermove', 1, lowerHalfY(2));
    });
    expect(centerIndicator(container)?.style.display).toBe('block');
    act(() => {
      dispatchWindowPointer('pointermove', 1, 2000);
    });
    expect(centerIndicator(container)?.style.display).toBe('none');
    act(() => {
      dispatchWindowPointer('pointerup', 1, 2000);
    });
    expect(onRowsChange).not.toHaveBeenCalled();
    expect(document.body.style.cursor).toBe('');

    // Escape。
    act(() => {
      pressHandle(handleAt(container, 0) as HTMLElement, 2, upperHalfY(0));
    });
    act(() => {
      dispatchWindowPointer('pointermove', 2, lowerHalfY(2));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.body.style.cursor).toBe('');
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    // Escape 後の pointerup は無視されます(リスナー解除済み)。
    act(() => {
      dispatchWindowPointer('pointerup', 2, lowerHalfY(2));
    });
    expect(onRowsChange).not.toHaveBeenCalled();

    // pointercancel。
    act(() => {
      pressHandle(handleAt(container, 0) as HTMLElement, 3, upperHalfY(0));
    });
    act(() => {
      dispatchWindowPointer('pointermove', 3, lowerHalfY(2));
    });
    act(() => {
      dispatchWindowPointer('pointercancel', 3, lowerHalfY(2));
    });
    expect(document.body.style.cursor).toBe('');
    expect(onRowsChange).not.toHaveBeenCalled();
  });

  it('ドロップ後に undo() で元の配列(参照)へ戻り、redo() で移動後の配列へ進む(履歴ラッパ経由)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const seen: Row[][] = [];
    const Harness = () => {
      const [state, setState] = useState<Row[]>(rows);
      return (
        <SpreadsheetGrid
          ref={ref}
          columns={columns}
          rows={state}
          rowKeyGetter={rowKeyGetter}
          onRowsChange={(next) => {
            seen.push(next);
            setState(next);
          }}
          enableRowDrag
          rowHeight={ROW_HEIGHT}
          headerHeight={HEADER_HEIGHT}
        />
      );
    };
    const { container } = render(<Harness />);
    act(() => {
      pressHandle(handleAt(container, 0) as HTMLElement, 1, upperHalfY(0));
    });
    act(() => {
      dispatchWindowPointer('pointermove', 1, lowerHalfY(2));
    });
    act(() => {
      dispatchWindowPointer('pointerup', 1, lowerHalfY(2));
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].map((row) => row.id)).toEqual(['b', 'c', 'a']);
    // 表示も移動後の順(行 0 の id セルは 'b')。
    expect(
      container.querySelector('[data-pane="center"][data-row-index="0"] [data-ssg-col-key="id"]')
        ?.textContent,
    ).toBe('b');
    expect(ref.current?.canUndo()).toBe(true);

    act(() => {
      ref.current?.undo();
    });
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(rows);
    expect(
      container.querySelector('[data-pane="center"][data-row-index="0"] [data-ssg-col-key="id"]')
        ?.textContent,
    ).toBe('a');

    act(() => {
      ref.current?.redo();
    });
    expect(seen).toHaveLength(3);
    expect(seen[2]).toBe(seen[0]);
  });

  it('ソート / フィルター適用中はハンドルが無効(淡色クラス + 理由ツールチップ)でドラッグを開始しない。解除で復帰', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onRowsChange = vi.fn();
    const { container } = render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={onRowsChange}
        enableRowDrag
        rowHeight={ROW_HEIGHT}
        headerHeight={HEADER_HEIGHT}
      />,
    );
    act(() => {
      ref.current?.applyState(sortedState);
    });
    // 列自体は残ります(レイアウトが跳ねない)。
    expect(headerKeys(container)[0]).toBe(ROW_DRAG_HANDLE_COLUMN_KEY);
    const disabledHandle = handleAt(container, 0);
    expect(disabledHandle?.classList.contains('ssg-row-drag-handle--disabled')).toBe(true);
    expect(disabledHandle?.dataset.ssgTooltip).toBe(ROW_DRAG_DISABLED_TOOLTIP);
    act(() => {
      pressHandle(disabledHandle as HTMLElement, 1, upperHalfY(0));
    });
    expect(document.body.style.cursor).toBe('');
    act(() => {
      dispatchWindowPointer('pointermove', 1, lowerHalfY(2));
    });
    // ドラッグが始まっていないのでガイド線は出ません(inline style は未設定 = '' か 'none')。
    expect(centerIndicator(container)?.style.display).not.toBe('block');
    act(() => {
      dispatchWindowPointer('pointerup', 1, lowerHalfY(2));
    });
    expect(onRowsChange).not.toHaveBeenCalled();

    // 列フィルターでも同様。
    act(() => {
      ref.current?.applyState(filteredState);
    });
    expect(
      handleAt(container, 0)?.classList.contains('ssg-row-drag-handle--disabled'),
    ).toBe(true);

    // 解除で復帰。
    act(() => {
      ref.current?.applyState({
        version: GRID_STATE_VERSION,
        columnWidths: {},
        filters: { globalText: '', columnFilters: {} },
        sort: [],
      });
    });
    expect(
      handleAt(container, 0)?.classList.contains('ssg-row-drag-handle--disabled'),
    ).toBe(false);
  });

  it('ハンドルの pointerdown はセル選択を開始しない(掴み手方式)', () => {
    const { container } = render(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={() => {}}
        enableRowDrag
        rowHeight={ROW_HEIGHT}
        headerHeight={HEADER_HEIGHT}
      />,
    );
    act(() => {
      pressHandle(handleAt(container, 1) as HTMLElement, 1, upperHalfY(1));
    });
    act(() => {
      dispatchWindowPointer('pointerup', 1, upperHalfY(1));
    });
    // アクティブセルのオーバーレイは出ません(通常セルの pointerdown なら出ます)。
    expect(container.querySelector('.ssg-active-cell-overlay')).toBeNull();
    const cell = container.querySelector<HTMLElement>(
      '[data-pane="center"][data-row-index="1"] [data-ssg-col-key="name"]',
    );
    act(() => {
      fireEvent.pointerDown(cell as HTMLElement, { button: 0, buttons: 1, pointerId: 5 });
    });
    expect(container.querySelector('.ssg-active-cell-overlay')).not.toBeNull();
    getShell(container);
  });

  it('moveRow(rowKey, toIndex) で移動し onRowsChange → onRowMove が呼ばれる。未知キー / 同一位置は no-op', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onRowsChange = vi.fn();
    const onRowMove = vi.fn();
    render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={onRowsChange}
        onRowMove={onRowMove}
      />,
    );
    act(() => {
      ref.current?.moveRow('c', 0);
    });
    expect(onRowsChange).toHaveBeenCalledTimes(1);
    expect(
      (onRowsChange.mock.calls[0][0] as Row[]).map((row) => row.id),
    ).toEqual(['c', 'a', 'b']);
    expect(onRowMove).toHaveBeenCalledWith(
      expect.objectContaining({ rowKey: 'c', fromIndex: 2, toIndex: 0 }),
    );

    act(() => {
      ref.current?.moveRow('zzz', 0);
      ref.current?.moveRow('b', 1);
      ref.current?.moveRow('a', 99);
    });
    expect(onRowsChange).toHaveBeenCalledTimes(1);
    expect(onRowMove).toHaveBeenCalledTimes(1);
  });

  it('serverSide では moveRow は警告して no-op', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onRowsChange = vi.fn();
    const dataSource: ServerSideDataSource<Row> = {
      getRows: async () => ({ rows, totalRowCount: rows.length }),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        dataSource={dataSource}
        rowKeyGetter={rowKeyGetter}
        onRowsChange={onRowsChange}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      ref.current?.moveRow('a', 2);
    });
    expect(onRowsChange).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('moveRow()'));
    warn.mockRestore();
  });
});