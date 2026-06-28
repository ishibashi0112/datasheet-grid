// SpreadsheetGrid を実際に render し、命令的ハンドル(getState / applyState)と onStateChange の
//   「配線」を実行検証する結合テストです。純ロジック(logic/gridState.test.ts)では到達できない以下を、
//   実コンポーネントを通して確認します:
//   - getState がライブの uiState を読んでスナップショットを返す。
//   - applyState が dispatch → reducer → 再レンダーを経て getState に反映される(往復)。
//   - onStateChange effect が「初回マウント非発火 / 状態変化で発火 / 同値では再発火しない」を満たす。
//   renderHook 系テストと同じく DOM を要するため、本ファイルのみ jsdom で回します。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { GRID_STATE_VERSION } from './logic/gridState';
import type {
  GridColumn,
  GridState,
  SpreadsheetGridHandle,
} from './model/gridTypes';

// jsdom には ResizeObserver / Element.scrollTo が無い(SpreadsheetGrid がマウント時に new / 呼び出す)
//   ため、最小スタブを入れます。observe は no-op(コールバックを呼ばない)なので、これ起因の setState は
//   発生せず、テストの決定性を保てます。
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
});

afterEach(() => {
  cleanup();
});

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 160 },
  { key: 'qty', title: 'Qty', width: 100 },
];

const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 10 },
  { id: 2, name: 'beta', qty: 20 },
  { id: 3, name: 'gamma', qty: 30 },
];

// テスト全体で使い回す「適用する状態」。columnWidths は 1 列だけ(resetColumnWidths がフル置換である
//   ことの確認も兼ねる)、フィルター(global + 列)とソートも含めます。
const appliedState: GridState = {
  version: GRID_STATE_VERSION,
  columnWidths: { id: 120 },
  filters: {
    globalText: 'be',
    columnFilters: { name: { kind: 'text', value: 'be' } },
  },
  sort: [{ columnKey: 'qty', direction: 'desc' }],
};

describe('SpreadsheetGrid 状態 API(結合)', () => {
  it('getState() が初期スナップショットを返す', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} />);

    const state = ref.current?.getState();
    expect(state).toBeDefined();
    expect(state?.version).toBe(GRID_STATE_VERSION);
    // 初期 columnWidths は非 flex 列の width から作られます(flex 列なし)。
    expect(state?.columnWidths).toEqual({ id: 80, name: 160, qty: 100 });
    expect(state?.filters).toEqual({ globalText: '', columnFilters: {} });
    expect(state?.sort).toEqual([]);
  });

  it('applyState() が reducer 経由で反映され getState() に出る', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} />);

    act(() => {
      ref.current?.applyState(appliedState);
    });

    const after = ref.current?.getState();
    expect(after?.version).toBe(GRID_STATE_VERSION);
    // resetColumnWidths はフル置換なので、適用後は { id: 120 } のみ(他列のエントリは消える)。
    expect(after?.columnWidths).toEqual({ id: 120 });
    expect(after?.filters).toEqual({
      globalText: 'be',
      columnFilters: { name: { kind: 'text', value: 'be' } },
    });
    expect(after?.sort).toEqual([{ columnKey: 'qty', direction: 'desc' }]);
  });

  it('onStateChange は初回マウントで発火しない', () => {
    const onStateChange = vi.fn();
    render(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        onStateChange={onStateChange}
      />,
    );

    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('onStateChange は applyState の状態変化で最新 state を 1 回渡して発火する', () => {
    const onStateChange = vi.fn();
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={rows}
        onStateChange={onStateChange}
      />,
    );

    act(() => {
      ref.current?.applyState(appliedState);
    });

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenLastCalledWith({
      version: GRID_STATE_VERSION,
      columnWidths: { id: 120 },
      filters: {
        globalText: 'be',
        columnFilters: { name: { kind: 'text', value: 'be' } },
      },
      sort: [{ columnKey: 'qty', direction: 'desc' }],
    });
  });

  it('onStateChange は同値の applyState では再発火しない(構造等価で抑止)', () => {
    const onStateChange = vi.fn();
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={rows}
        onStateChange={onStateChange}
      />,
    );

    // 1 回目: 初期状態 → appliedState への変化で発火。
    act(() => {
      ref.current?.applyState(appliedState);
    });
    expect(onStateChange).toHaveBeenCalledTimes(1);

    // 2 回目: 同値を再適用。reducer は新規オブジェクト参照を入れる(columnWidths/filters の参照は変わる)が、
    //   isSameGridState が構造等価と判定するため再発火しない。
    act(() => {
      ref.current?.applyState(appliedState);
    });
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });
});