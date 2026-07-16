// SSRM セル編集書き戻し(dataSource.updateRows)の「配線」を実行検証する結合テストです。
//   楽観更新・ロールバック・世代/epoch ガードの挙動そのものは useServerSideRowModel.test.ts が
//   正本で、ここでは各編集経路が実コンポーネント越しに updateRows へ届くことを確認します:
//   - 経路 A: エディタ commit(Enter 編集開始 → 値変更 → Enter 確定)/ reject 列の確定拒否
//   - 経路 B: ペースト(単一セル / 複数行はスキップ含む行単位集約)
//   - 経路 C: Delete クリア
//   - 経路 D: checkbox の Space 直接トグル
//   - updateRows 未指定の serverSide では編集 UI 自体が開かない(canEditCell 合成ガード)
//   駆動は undoRedo / validation 結合テストと同じ「ハンドル setActiveCell + ルート要素への
//   イベント発火」方式です(仮想化行の DOM は jsdom では描画されないため)。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import type {
  GridColumn,
  ServerSideDataSource,
  ServerSideUpdateRowsParams,
  SpreadsheetGridHandle,
} from './model/gridTypes';

// jsdom には ResizeObserver / Element.scrollTo が無いため、最小スタブを入れます
//   (他の結合テストと同じ流儀)。
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

type Row = { id: number; name: string; qty: number; active: boolean };

const serverRows: Row[] = [
  { id: 1, name: 'alpha', qty: 10, active: true },
  { id: 2, name: 'beta', qty: 20, active: false },
  { id: 3, name: 'gamma', qty: 30, active: true },
];

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 160 },
  { key: 'qty', title: 'Qty', width: 100, editor: { type: 'number' } },
  { key: 'active', title: 'Active', width: 80, editor: { type: 'checkbox' } },
];

// 記録つき dataSource です。getRows は即時解決、updateRows は呼び出しを記録して
//   自動成功(rows 省略 = 楽観値そのまま確定)します。
const createWritableDataSource = (opts?: { withUpdateRows?: boolean }) => {
  const updateCalls: ServerSideUpdateRowsParams<Row>[] = [];
  const dataSource: ServerSideDataSource<Row> = {
    getRows: (params) =>
      Promise.resolve({
        rows: serverRows.slice(params.startIndex, params.endIndex),
        totalRowCount: serverRows.length,
      }),
    ...(opts?.withUpdateRows === false
      ? {}
      : {
          updateRows: vi.fn((params: ServerSideUpdateRowsParams<Row>) => {
            updateCalls.push(params);
            return Promise.resolve();
          }),
        }),
  };
  return { dataSource, updateCalls };
};

// grid root(keyboard / paste ハンドラの配線先)を引きます。
const getShell = (container: HTMLElement): HTMLElement => {
  const shell = container.querySelector<HTMLElement>('.ssg-shell');
  if (!shell) {
    throw new Error('ssg-shell が見つかりません');
  }
  return shell;
};

// getRows / updateRows の Promise 連鎖と setState を流します。
const flushMicrotasks = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

// SSRM グリッドを render し、block 0 のロード完了まで流します。
const renderSsrmGrid = async (props?: {
  withUpdateRows?: boolean;
  columnsOverride?: GridColumn<Row>[];
}) => {
  const { dataSource, updateCalls } = createWritableDataSource({
    withUpdateRows: props?.withUpdateRows,
  });
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const view = render(
    <SpreadsheetGrid
      ref={ref}
      columns={props?.columnsOverride ?? columns}
      dataSource={dataSource}
      rowKeyGetter={(row) => row.id}
    />,
  );
  await flushMicrotasks();
  return { ...view, ref, dataSource, updateCalls };
};

describe('SpreadsheetGrid SSRM セル編集書き戻し(結合)', () => {
  it('経路 A: エディタ commit が updateRows へ届く(行キー / changes / 楽観行)', async () => {
    const { container, ref, updateCalls } = await renderSsrmGrid();
    const shell = getShell(container);

    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'Enter' });
    const input = container.querySelector<HTMLInputElement>(
      '.ssg-cell-editor-input',
    );
    expect(input).not.toBeNull();

    fireEvent.change(input!, { target: { value: 'RENAMED' } });
    fireEvent.keyDown(input!, { key: 'Enter' });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].updates).toEqual([
      {
        rowKey: 1,
        rowIndex: 0,
        row: { id: 1, name: 'RENAMED', qty: 10, active: true },
        previousRow: serverRows[0],
        changes: [
          { columnKey: 'name', previousValue: 'alpha', newValue: 'RENAMED' },
        ],
      },
    ]);
    // 確定後はエディタが閉じる(clientSide と同じ確定フロー)。
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
  });

  it('経路 A: reject 列は検証 NG の確定を拒否し、updateRows を呼ばない', async () => {
    const rejectColumns: GridColumn<Row>[] = columns.map((column) =>
      column.key === 'name'
        ? {
            ...column,
            validate: ({ value }) =>
              typeof value === 'string' && value.trim() !== ''
                ? true
                : '必須項目です',
            validationMode: 'reject',
          }
        : column,
    );
    const { container, ref, updateCalls } = await renderSsrmGrid({
      columnsOverride: rejectColumns,
    });
    const shell = getShell(container);

    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'Enter' });
    const input = container.querySelector<HTMLInputElement>(
      '.ssg-cell-editor-input',
    );
    expect(input).not.toBeNull();

    // 空文字 → 確定拒否(updateRows 不発・エディタ継続・エラーバブル表示)。
    fireEvent.change(input!, { target: { value: '' } });
    fireEvent.keyDown(input!, { key: 'Enter' });
    expect(updateCalls).toHaveLength(0);
    expect(container.querySelector('.ssg-cell-editor-input')).not.toBeNull();
    expect(container.querySelector('.ssg-cell-editor-error')?.textContent).toBe(
      '必須項目です',
    );

    // 有効値へ直すと確定できる。
    fireEvent.change(input!, { target: { value: 'ok' } });
    fireEvent.keyDown(input!, { key: 'Enter' });
    expect(updateCalls).toHaveLength(1);
  });

  it('経路 B: ペーストが行単位に集約されて 1 回の updateRows へ届く', async () => {
    const { container, ref, updateCalls } = await renderSsrmGrid();
    const shell = getShell(container);

    // {row:0, col:1} 起点に 2 行 × 2 列(name, qty)をペースト。
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.paste(shell, {
      clipboardData: { getData: () => 'X1\t100\nX2\t200' },
    });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].updates).toEqual([
      {
        rowKey: 1,
        rowIndex: 0,
        row: { id: 1, name: 'X1', qty: 100, active: true },
        previousRow: serverRows[0],
        changes: [
          { columnKey: 'name', previousValue: 'alpha', newValue: 'X1' },
          { columnKey: 'qty', previousValue: 10, newValue: 100 },
        ],
      },
      {
        rowKey: 2,
        rowIndex: 1,
        row: { id: 2, name: 'X2', qty: 200, active: false },
        previousRow: serverRows[1],
        changes: [
          { columnKey: 'name', previousValue: 'beta', newValue: 'X2' },
          { columnKey: 'qty', previousValue: 20, newValue: 200 },
        ],
      },
    ]);
  });

  it('経路 B: 末端行を超えるペーストは行を自動追加せず、ビュー内の行だけ書き込む', async () => {
    const { container, ref, updateCalls } = await renderSsrmGrid();
    const shell = getShell(container);

    // 最終行(row:2)起点に 3 行ぶんペースト → ビュー内は 1 行だけ。
    act(() => {
      ref.current?.setActiveCell({ row: 2, col: 1 });
    });
    fireEvent.paste(shell, {
      clipboardData: { getData: () => 'A\nB\nC' },
    });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].updates).toHaveLength(1);
    expect(updateCalls[0].updates[0]).toMatchObject({
      rowKey: 3,
      rowIndex: 2,
      changes: [{ columnKey: 'name', previousValue: 'gamma', newValue: 'A' }],
    });
  });

  it('経路 C: Delete クリアが updateRows へ届く(number 列は null へ)', async () => {
    const { container, ref, updateCalls } = await renderSsrmGrid();
    const shell = getShell(container);

    act(() => {
      ref.current?.setActiveCell({ row: 1, col: 2 });
    });
    fireEvent.keyDown(shell, { key: 'Delete' });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].updates).toEqual([
      {
        rowKey: 2,
        rowIndex: 1,
        row: { id: 2, name: 'beta', qty: null, active: false },
        previousRow: serverRows[1],
        changes: [{ columnKey: 'qty', previousValue: 20, newValue: null }],
      },
    ]);
  });

  it('経路 D: checkbox の Space トグルが updateRows へ届く', async () => {
    const { container, ref, updateCalls } = await renderSsrmGrid();
    const shell = getShell(container);

    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 3 });
    });
    fireEvent.keyDown(shell, { key: ' ' });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].updates).toEqual([
      {
        rowKey: 1,
        rowIndex: 0,
        row: { id: 1, name: 'alpha', qty: 10, active: false },
        previousRow: serverRows[0],
        changes: [{ columnKey: 'active', previousValue: true, newValue: false }],
      },
    ]);
  });

  it('updateRows 未指定の serverSide では編集 UI が開かず、paste / Delete も no-op', async () => {
    const { container, ref, updateCalls } = await renderSsrmGrid({
      withUpdateRows: false,
    });
    const shell = getShell(container);

    // Enter でも編集セッションが開かない(canEditCell 合成ガード)。
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'Enter' });
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();

    // paste / Delete も書き込み先が無いため何も起きない(クラッシュしないことも含めて検証)。
    fireEvent.paste(shell, { clipboardData: { getData: () => 'X' } });
    fireEvent.keyDown(shell, { key: 'Delete' });
    expect(updateCalls).toHaveLength(0);
  });

  it('readOnly の serverSide では updateRows 指定でも書き込みが起きない', async () => {
    const { dataSource, updateCalls } = createWritableDataSource();
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        dataSource={dataSource}
        rowKeyGetter={(row) => row.id}
        readOnly
      />,
    );
    await flushMicrotasks();
    const shell = getShell(container);

    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'Enter' });
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
    fireEvent.paste(shell, { clipboardData: { getData: () => 'X' } });
    fireEvent.keyDown(shell, { key: 'Delete' });
    expect(updateCalls).toHaveLength(0);
  });
});