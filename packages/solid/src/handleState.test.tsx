// 追加(Solid 版 0.1.2 / 品質の段 2-3): ハンドルと状態の所見。React 版の SpreadsheetGrid.handleState.integration.test.tsx と
//   同じ場面です(処理は core engine/gridApi ほか)。
//   S4-22: <Show> で外した後も `let grid!` + `ref={grid}` の変数に残ったハンドルが、外したグリッドの古い行で親の行を上書きしていた。
//   S4-03: selectRange の直後(flush の前)の exportCsv({ scope: 'selection' }) が古い選択(空)で出ていた。
//   S4-09: 選んだ行を消した後も選択のキーが残り、getSelectedRowKeys() / getSelectedRowCount() が getSelectedRowData() と食い違っていた。
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Show, createSignal, flush } from 'solid-js';
import { cleanup, render } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { SpreadsheetGrid, type GridColumn, type RowSelectionModel, type SpreadsheetGridHandle } from './index';

type Row = { id: number; name: string };

const columns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 160 }];
const makeRows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `r${i + 1}` }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('外したグリッドのハンドル(S4-22)', () => {
  it('状態を変えるメソッドは何もせず(開発時に 1 回知らせる)、読むメソッドは外したときの値を返す', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [rows, setRows] = createSignal(makeRows(3));
    const [shown, setShown] = createSignal(true);
    let changes = 0;
    // eslint-disable-next-line no-unassigned-vars -- Solid のコンパイラが ref={grid} を代入に書き換える(この書き方の場面)
    let grid!: SpreadsheetGridHandle<Row>;
    render(() => (
      <Show when={shown()}>
        <SpreadsheetGrid<Row>
          ref={grid}
          rows={rows()}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          onRowsChange={(next) => {
            changes += 1;
            setRows(next);
          }}
        />
      </Show>
    ));
    flush();
    expect(grid.getState().filters.globalText).toBe('');
    setShown(false);
    flush();
    // 隠したまま親で行を足す。
    setRows([...rows(), { id: 99, name: '足した行' }]);
    flush();
    grid.applyRows((prev) => prev.slice(1));
    grid.undo();
    expect(grid.startEditing(0, 0)).toBe(false);
    grid.selectCell(0, 0);
    flush();
    expect(changes).toBe(0);
    expect(rows().map((row) => row.id)).toEqual([1, 2, 3, 99]);
    expect(warn.mock.calls.filter((call) => String(call[0]).includes('外したグリッドのハンドル'))).toHaveLength(1);
    // 読むメソッドは外したときの値(onCleanup で保存する書き方)。
    expect(grid.getState().filters.globalText).toBe('');
    expect(grid.exportCsv()).toContain('r1');
  });
});

describe('消した行の選択(S4-09)', () => {
  it('選んだ行を消すと選択から外し、数・キー・データがそろう(セルの編集では外さない)', async () => {
    const [rows, setRows] = createSignal(makeRows(4));
    const onRowSelectionChange = vi.fn<(model: RowSelectionModel) => void>();
    let grid!: SpreadsheetGridHandle<Row>;
    render(() => (
      <SpreadsheetGrid<Row>
        ref={(handle) => (grid = handle)}
        rows={rows()}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        onRowsChange={setRows}
        enableRowSelection
        onRowSelectionChange={onRowSelectionChange}
      />
    ));
    flush();
    grid.setRowSelection({ type: 'include', rowKeys: [2, 3] });
    flush();
    onRowSelectionChange.mockClear();
    setRows(rows().filter((row) => row.id !== 2));
    flush();
    expect(grid.getSelectedRowKeys()).toEqual([3]);
    expect(grid.getSelectedRowCount()).toBe(1);
    expect(grid.getSelectedRowData().map((row) => row.id)).toEqual([3]);
    // 描く途中で呼ぶ通知は次のマイクロタスク(S4-21)。
    await Promise.resolve();
    expect(onRowSelectionChange).toHaveBeenCalledTimes(1);
    expect(onRowSelectionChange.mock.calls[0]?.[0]).toEqual({ type: 'include', rowKeys: [3] });
    onRowSelectionChange.mockClear();
    setRows(rows().map((row) => (row.id === 3 ? { ...row, name: 'x' } : row)));
    flush();
    await Promise.resolve();
    expect(grid.getSelectedRowKeys()).toEqual([3]);
    expect(onRowSelectionChange).not.toHaveBeenCalled();
  });
});

describe('選択を変えた直後のエクスポート(S4-03)', () => {
  it('selectRange の直後(flush の前)の exportCsv({ scope: "selection" }) は新しい選択で出す', () => {
    let grid!: SpreadsheetGridHandle<Row>;
    render(() => <SpreadsheetGrid<Row> ref={(handle) => (grid = handle)} rows={makeRows(4)} columns={columns} rowKeyGetter={(row) => row.id} />);
    flush();
    grid.selectRange({ start: { row: 1, col: 0 }, end: { row: 2, col: 0 } });
    const csv = grid.exportCsv({ scope: 'selection', includeHeaders: false });
    expect(csv.split(/\r?\n/).filter(Boolean)).toEqual(['r2', 'r3']);
  });
});