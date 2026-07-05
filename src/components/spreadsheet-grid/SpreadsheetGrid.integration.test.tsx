// SpreadsheetGrid を実際に render し、命令的ハンドル(getState / applyState)と onStateChange の
//   「配線」を実行検証する結合テストです。純ロジック(logic/gridState.test.ts)では到達できない以下を、
//   実コンポーネントを通して確認します:
//   - getState がライブの uiState / columns を読んでスナップショット(v2: 列メタ含む)を返す。
//   - applyState が dispatch → reducer → 再レンダーを経て getState に反映される(往復)。
//   - applyState の列メタ(順序 / 可視 / ピン)が onColumnsChange 経由で controlled に反映される(往復)。
//   - onStateChange effect が「初回マウント非発火 / 状態変化(列メタ含む)で発火 / 同値では再発火しない」。
//   renderHook 系テストと同じく DOM を要するため、本ファイルのみ jsdom で回します。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createRef, useState } from 'react';
import type { Ref } from 'react';

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

// 追加(v2): controlled-columns ハーネスです。列メタ(可視 / 順序 / ピン)は consumer 所有のため、
//   applyState の列メタ反映は onColumnsChange を通ります。ここで columns を useState で保持して
//   onColumnsChange へ繋ぎ、applyState → onColumnsChange → 再レンダー → getState の往復を検証します。
function ControlledGrid({
  gridRef,
  initialColumns,
  onStateChange,
}: {
  gridRef: Ref<SpreadsheetGridHandle<Row>>;
  initialColumns: GridColumn<Row>[];
  onStateChange?: (state: GridState) => void;
}) {
  const [cols, setCols] = useState(initialColumns);
  return (
    <SpreadsheetGrid
      ref={gridRef}
      columns={cols}
      onColumnsChange={setCols}
      rows={rows}
      onStateChange={onStateChange}
    />
  );
}

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
    // 追加(v2): 列メタは columns prop から配列順で抽出されます(visible/pinned 未指定は省略)。
    expect(state?.columns).toEqual([
      { key: 'id' },
      { key: 'name' },
      { key: 'qty' },
    ]);
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
      // 追加(v2): この applyState は列メタ非適用(onColumnsChange 未指定)なので columns prop は不変。
      //   snapshot には現 columns の抽出が載ります。
      columns: [{ key: 'id' }, { key: 'name' }, { key: 'qty' }],
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

  it('追加(v2): applyState の列メタ(順序 / 可視 / ピン)が onColumnsChange 経由で反映され getState に出る', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<ControlledGrid gridRef={ref} initialColumns={columns} />);

    const v2State: GridState = {
      version: GRID_STATE_VERSION,
      columnWidths: {},
      filters: { globalText: '', columnFilters: {} },
      sort: [],
      // qty を left 固定 + 先頭、id を非表示、name は既定。
      columns: [
        { key: 'qty', pinned: 'left' },
        { key: 'id', visible: false },
        { key: 'name' },
      ],
    };

    act(() => {
      ref.current?.applyState(v2State);
    });

    const after = ref.current?.getState();
    // reorderColumnsByPane で qty(left)が先頭、続いて center の id, name。visible/pinned も復元。
    expect(after?.columns).toEqual([
      { key: 'qty', pinned: 'left' },
      { key: 'id', visible: false },
      { key: 'name' },
    ]);
  });

  it('追加(v2): onColumnsChange 未指定なら applyState の列メタはスキップ(v1 と同一・列順不変)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    // onColumnsChange を渡さない(controlled でない)素の SpreadsheetGrid。
    render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} />);

    act(() => {
      ref.current?.applyState({
        version: GRID_STATE_VERSION,
        columnWidths: {},
        filters: { globalText: '', columnFilters: {} },
        sort: [],
        columns: [{ key: 'qty' }, { key: 'name' }, { key: 'id' }], // reorder 指示
      });
    });

    // onColumnsChange が無いので列メタは適用されず、列順は初期のまま。
    const after = ref.current?.getState();
    expect(after?.columns).toEqual([
      { key: 'id' },
      { key: 'name' },
      { key: 'qty' },
    ]);
  });

  it('追加(v2): onStateChange は列メタ変化(applyState の reorder)でも発火し、最新の列メタを渡す', () => {
    const onStateChange = vi.fn();
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <ControlledGrid
        gridRef={ref}
        initialColumns={columns}
        onStateChange={onStateChange}
      />,
    );

    act(() => {
      ref.current?.applyState({
        version: GRID_STATE_VERSION,
        columnWidths: {},
        filters: { globalText: '', columnFilters: {} },
        sort: [],
        columns: [{ key: 'qty' }, { key: 'name' }, { key: 'id' }], // reorder
      });
    });

    expect(onStateChange).toHaveBeenCalled();
    const last = onStateChange.mock.calls.at(-1)?.[0] as GridState;
    expect(last.columns).toEqual([
      { key: 'qty' },
      { key: 'name' },
      { key: 'id' },
    ]);
  });
});

// 追加(THEME-3): dimReadOnlyCells の root 修飾子配線を検証します。淡色表示そのもの(CSS)は
//   jsdom では検証できないため、「opt-in で ssg-root--dim-readonly が付く / 既定では付かない」
//   というクラス配線を固定します(セマンティッククラス .ssg-body-cell--readonly の常時付与は
//   GridBodyLayer 側の既存経路で不変)。
describe('THEME-3: dimReadOnlyCells(readonly 淡色表示の opt-in)', () => {
  it('既定(未指定)では root に ssg-root--dim-readonly が付かない', () => {
    const { container } = render(
      <SpreadsheetGrid columns={columns} rows={rows} />,
    );
    const root = container.querySelector('.ssg-root');
    expect(root).not.toBeNull();
    expect(root?.classList.contains('ssg-root--dim-readonly')).toBe(false);
  });

  it('dimReadOnlyCells で root に ssg-root--dim-readonly が付く', () => {
    const { container } = render(
      <SpreadsheetGrid columns={columns} rows={rows} dimReadOnlyCells />,
    );
    const root = container.querySelector('.ssg-root');
    expect(root?.classList.contains('ssg-root--dim-readonly')).toBe(true);
  });
});