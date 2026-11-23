// 追加(段 3-2 / S1-01): rows を Solid の store(createStore)で持つ形。グリッドは store の中身(snapshot)を読むので、
//   `setStore((s) => { s.rows = next })` / `reconcile(next, key)(s.rows)` で戻せば元に戻すが効き、store の中を直接変えたときは
//   外からの変更として映る(React 版で親が rows を差し替えたときと同じく、履歴は消える)。開発時の Solid の知らせも出ない。
//   React 版と同じ操作で DOM と通知を比べるのは parity/storeRows.parity.test.tsx(と、環境変数 PARITY_SOLID_ROWS で全部の場面)。
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createStore, flush, reconcile } from 'solid-js';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from './index';

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 160 },
  { key: 'qty', title: 'Qty', width: 80, editor: { type: 'number' } },
];
const makeRows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `r${i + 1}`, qty: i }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Write = 'assign' | 'reconcile';

function mountStore(count: number, write: Write) {
  const initial = makeRows(count);
  const [state, setState] = createStore<{ rows: Row[] }>({ rows: initial });
  const received: Row[][] = [];
  // eslint-disable-next-line no-unassigned-vars -- Solid のコンパイラが ref={grid} を代入に書き換える
  let grid!: SpreadsheetGridHandle<Row>;
  const view = render(() => (
    <SpreadsheetGrid<Row>
      ref={grid}
      rows={state.rows}
      columns={columns}
      rowKeyGetter={(row) => row.id}
      height={300}
      onRowsChange={(next) => {
        received.push(next);
        setState((draft) => {
          if (write === 'assign') {
            draft.rows = next;
          } else {
            reconcile(next, 'id')(draft.rows);
          }
        });
      }}
    />
  ));
  flush();
  const shell = () => view.container.querySelector<HTMLElement>('.ssg-shell')!;
  const cellText = (row: number, key: string) =>
    view.container.querySelector(`.ssg-body-row[data-row-index="${row}"] [data-ssg-col-key="${key}"]`)?.textContent ?? null;
  const paste = (row: number, col: number, text: string) => {
    grid.selectCell(row, col);
    flush();
    fireEvent.paste(shell(), { clipboardData: { getData: () => text } });
    flush();
  };
  const key = (init: KeyboardEventInit & { key: string }) => {
    fireEvent.keyDown(shell(), init);
    flush();
  };
  return { initial, state, setState, received, grid: () => grid, cellText, paste, key };
}

describe.each(['assign', 'reconcile'] as const)('rows を store で持つ(%s で戻す)', (write) => {
  it('編集を元に戻す / やり直すと、store の行も画面も前の行に戻る', () => {
    const t = mountStore(5, write);
    t.paste(0, 0, 'EDITED');
    expect(t.cellText(0, 'name')).toBe('EDITED');
    expect(t.state.rows[0]?.name).toBe('EDITED');
    expect(t.grid().canUndo()).toBe(true);
    t.key({ key: 'z', ctrlKey: true });
    expect(t.cellText(0, 'name')).toBe('r1');
    expect(t.state.rows[0]?.name).toBe('r1');
    // 元に戻すは初めの配列そのもの(参照)をグリッドから返す(signal で持つときと同じ)。
    expect(t.received.at(-1)).toBe(t.initial);
    expect(t.grid().canUndo()).toBe(false);
    expect(t.grid().canRedo()).toBe(true);
    t.key({ key: 'y', ctrlKey: true });
    expect(t.cellText(0, 'name')).toBe('EDITED');
    // 続けて編集しても履歴が続く(戻ってきた rows を、グリッドが渡した配列と見分けられる)。
    t.paste(1, 1, '42');
    expect(t.cellText(1, 'qty')).toBe('42');
    t.key({ key: 'z', ctrlKey: true });
    t.key({ key: 'z', ctrlKey: true });
    expect(t.cellText(0, 'name')).toBe('r1');
    expect(t.cellText(1, 'qty')).toBe('1');
    expect(t.received.at(-1)).toBe(t.initial);
  });

  it('store の中を直接変えると画面に映り、外からの変更として履歴は消える', () => {
    const t = mountStore(5, write);
    t.paste(0, 0, 'EDITED');
    expect(t.grid().canUndo()).toBe(true);
    // 項目を変える
    t.setState((draft) => {
      draft.rows[2]!.name = 'mutated';
    });
    flush();
    expect(t.cellText(2, 'name')).toBe('mutated');
    expect(t.grid().canUndo()).toBe(false);
    // 足す / 消す
    t.setState((draft) => {
      draft.rows.push({ id: 99, name: 'pushed', qty: 9 });
    });
    flush();
    expect(t.grid().getViewRowIndex(99)).toBe(5);
    t.setState((draft) => {
      draft.rows.splice(0, 1);
    });
    flush();
    expect(t.cellText(0, 'name')).toBe('r2');
    expect(t.grid().getViewRowIndex(99)).toBe(4);
    // その後のグリッドの編集も元に戻せる。
    t.paste(0, 0, 'AGAIN');
    t.key({ key: 'z', ctrlKey: true });
    expect(t.cellText(0, 'name')).toBe('r2');
  });

  it('2,500 行でも、表示・編集・元に戻す・store の直接の変更で Solid の知らせを出さない', () => {
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    const t = mountStore(2500, write);
    t.paste(0, 0, 'EDITED');
    t.key({ key: 'z', ctrlKey: true });
    t.setState((draft) => {
      draft.rows[1500]!.qty = -1;
    });
    flush();
    t.grid().scrollToRow(1500);
    flush();
    t.setState((draft) => {
      draft.rows.push({ id: 9999, name: 'pushed', qty: 0 });
    });
    flush();
    expect(t.grid().getViewRowIndex(9999)).toBe(2500);
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([]);
    expect(error.mock.calls.map((call) => String(call[0]))).toEqual([]);
  });
});