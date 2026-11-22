// 試作の結合テスト(jsdom)。React 版の結合テストと同じく、core の installJsdomLayoutStubs でレイアウトを装います
//   (React 非依存なので Solid でもそのまま使えた)。Solid 2.0 は書き込みをマイクロタスクでまとめて反映するので、
//   イベントの後に DOM を見るときは flush() を挟みます。
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createEffect, createSignal, createStore, flush, onSettled } from 'solid-js';
import { fireEvent, render } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from './index';

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 120 },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' } },
];

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}`, qty: i * 10 }));

const cellOf = (container: HTMLElement, row: number, key: string) =>
  container.querySelector<HTMLElement>(`.ssg-body-row[data-row-index="${row}"] [data-ssg-col-key="${key}"]`);

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

function setup(initialRows = makeRows(200)) {
  const onRowsChange = vi.fn();
  const onActiveCellChange = vi.fn();
  let handle: SpreadsheetGridHandle<Row> | undefined;
  const result = render(() => {
    const [rows, setRows] = createSignal(initialRows);
    return (
      <SpreadsheetGrid<Row>
        ref={(h) => {
          handle = h;
        }}
        rows={rows()}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        onRowsChange={(next) => {
          onRowsChange(next);
          setRows(next);
        }}
        onActiveCellChange={onActiveCellChange}
        height={400}
      />
    );
  });
  flush();
  const shell = result.container.querySelector<HTMLElement>('.ssg-shell');
  if (!shell) {
    throw new Error('shell がありません');
  }
  return { ...result, shell, onRowsChange, onActiveCellChange, getHandle: () => handle };
}

describe('Solid 版の試作', () => {
  it('React 版と同じ DOM(行・セル・固定列のペイン)で描く', () => {
    const { container } = setup();
    expect(container.querySelector('.ssg-root .ssg-shell .ssg-scroll-container[role="grid"]')).not.toBeNull();
    const rows = container.querySelectorAll('.ssg-center-pane .ssg-body-row');
    // 縦の仮想化: 200 行のうち見えている分 + overscan だけ。
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.length).toBeLessThan(200);
    expect(cellOf(container, 0, 'name')?.textContent).toBe('品目 1');
    expect(container.querySelector('.ssg-body-row[data-pane="left"] [data-ssg-col-key="id"]')?.textContent).toBe('1');
    expect(container.querySelector('.ssg-scroll-container')?.getAttribute('aria-rowcount')).toBe('201');
  });

  it('クリックでアクティブセル、矢印キーで動き、onActiveCellChange が呼ばれる', async () => {
    const { container, shell, onActiveCellChange } = setup();
    const target = cellOf(container, 1, 'name');
    if (!target) throw new Error('セルがありません');
    fireEvent.pointerDown(target, { button: 0, pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(target, { button: 0, pointerId: 1, isPrimary: true });
    flush();
    expect(container.querySelector('.ssg-active-cell-overlay')).not.toBeNull();
    fireEvent.keyDown(shell, { key: 'ArrowDown' });
    flush();
    // onActiveCellChange は描いた後の通知なので、flush の後のマイクロタスク(段階 4 の測り直し S4-21)。
    await Promise.resolve();
    const last = onActiveCellChange.mock.calls.at(-1)?.[0];
    expect(last?.columnKey).toBe('name');
    expect(last?.rowKey).toBe(3);
  });

  it('打ち始めでエディタが開き、Enter で確定すると onRowsChange に新しい行が届き、Ctrl+Z で戻る', () => {
    const { container, shell, onRowsChange } = setup();
    const target = cellOf(container, 0, 'name');
    if (!target) throw new Error('セルがありません');
    fireEvent.pointerDown(target, { button: 0, pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(target, { button: 0, pointerId: 1, isPrimary: true });
    flush();
    fireEvent.keyDown(shell, { key: 'x' });
    flush();
    const input = container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('x');
    if (!input) return;
    input.value = '新しい品名';
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    flush();
    expect(onRowsChange).toHaveBeenCalledTimes(1);
    expect(onRowsChange.mock.calls[0]?.[0]?.[0]?.name).toBe('新しい品名');
    expect(cellOf(container, 0, 'name')?.textContent).toBe('新しい品名');
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    flush();
    expect(cellOf(container, 0, 'name')?.textContent).toBe('品目 1');
  });

  it('貼り付けで複数セルへ書く(core の貼り付けの規則のまま)', () => {
    const { container, shell, onRowsChange } = setup();
    const target = cellOf(container, 2, 'name');
    if (!target) throw new Error('セルがありません');
    fireEvent.pointerDown(target, { button: 0, pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(target, { button: 0, pointerId: 1, isPrimary: true });
    flush();
    fireEvent.paste(shell, { clipboardData: { getData: () => 'A\t1\nB\t2' } });
    flush();
    expect(onRowsChange).toHaveBeenCalledTimes(1);
    expect(cellOf(container, 2, 'name')?.textContent).toBe('A');
    expect(cellOf(container, 3, 'qty')?.textContent).toBe('2');
  });

  it('命令的 API(ハンドル)は React 版と同じもの', () => {
    const { container, getHandle } = setup();
    const handle = getHandle();
    expect(handle).toBeDefined();
    handle?.selectCell(4, 2);
    flush();
    expect(handle?.getState().columnWidths).toBeDefined();
    expect(container.querySelector('.ssg-active-cell-overlay')).not.toBeNull();
  });

  it('ref は Solid の DOM の ref と同じく、変数と関数の配列でも受ける(段階 3-3 のレビュー)', () => {
    // 変数の ref はコンパイラが代入の関数に書き換える(let で宣言した変数だけ)。
    // eslint-disable-next-line no-unassigned-vars -- Solid のコンパイラが ref={byVariable} を代入に書き換える
    let byVariable!: SpreadsheetGridHandle<Row>;
    const byArray: SpreadsheetGridHandle<Row>[] = [];
    const view = render(() => (
      <>
        <SpreadsheetGrid<Row> ref={byVariable} rows={makeRows(5)} columns={columns} height={200} />
        <SpreadsheetGrid<Row>
          ref={[(h) => byArray.push(h), [(h) => byArray.push(h)]]}
          rows={makeRows(5)}
          columns={columns}
          height={200}
        />
      </>
    ));
    flush();
    expect(typeof byVariable?.getState).toBe('function');
    expect(byArray).toHaveLength(2);
    expect(byArray[0]).toBe(byArray[1]);
    expect(byArray[0]).not.toBe(byVariable);
    view.unmount();
  });

  it('ハンドルは利用者の最初の createEffect と onSettled で使える(0.1.0 の前の実アプリ点検 S5-01)', () => {
    // README どおりの変数の ref。これまでは子(グリッド)の onSettled で渡していたので、利用者の最初の effect と onSettled では
    //   undefined で、呼ぶと Solid の反応全体が止まっていた。React 版は利用者の useEffect から呼べる。
    // eslint-disable-next-line no-unassigned-vars -- Solid のコンパイラが ref={grid} を代入に書き換える
    let grid!: SpreadsheetGridHandle<Row>;
    const log: string[] = [];
    const [rows, setRows] = createSignal(makeRows(200));
    const view = render(() => {
      createEffect(
        () => rows().length,
        (count) => {
          log.push(`effect ${count} ${typeof grid}`);
          grid.selectCell(3, 1);
          log.push(`active ${JSON.stringify(grid.getActiveCell())}`);
        },
      );
      onSettled(() => {
        log.push(`settled ${typeof grid}`);
        // jsdom の scrollTo は何もしないので、スクロールは実ブラウザ(audit/dogfood/2026-11-22-solid/S3/repro-ref.cjs)で見る。
        grid.selectRange({ start: { row: 5, col: 1 }, end: { row: 6, col: 2 } });
        log.push(`selection ${grid.getSelection()?.type}`);
      });
      return <SpreadsheetGrid<Row> ref={grid} rows={rows()} columns={columns} rowKeyGetter={(row) => row.id} height={200} />;
    });
    flush();
    expect(log).toEqual([
      'effect 200 object',
      'active {"row":3,"col":1}',
      'settled object',
      'selection cell',
    ]);
    expect(view.container.querySelector('.ssg-active-cell-overlay')).not.toBeNull();
    // 反応が止まっていない(行を足すと effect がまた走り、表に映る)。
    setRows(makeRows(201));
    flush();
    expect(log.at(-2)).toBe('effect 201 object');
    expect(grid.getVisibleRowRange()).not.toBeNull();
    view.unmount();
  });

  it('通知の中で signal を読んでも Solid の STRICT_READ_UNTRACKED を出さない(0.1.0 の前の実アプリ点検 S2-01)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [count] = createSignal(1);
    const seen: number[] = [];
    let grid: SpreadsheetGridHandle<Row> | undefined;
    const view = render(() => (
      <SpreadsheetGrid<Row>
        ref={(h) => {
          grid = h;
        }}
        rows={makeRows(20)}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        onSortChange={() => seen.push(count())}
        onStateChange={() => seen.push(count())}
        onActiveCellChange={() => seen.push(count())}
        height={200}
      />
    ));
    flush();
    grid?.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] });
    grid?.selectCell(2, 1);
    flush();
    await Promise.resolve();
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(warn.mock.calls.filter((call) => String(call[0]).includes('STRICT_READ_UNTRACKED'))).toHaveLength(0);
    view.unmount();
    warn.mockRestore();
  });

  it('本体のセルと checkbox のセルは React 版と同じく空の onclick を持つ(タッチの位置合わせ。0.1.0 の前の実アプリ点検 S6-01)', () => {
    type CheckRow = { id: number; done: boolean };
    const view = render(() => (
      <SpreadsheetGrid<CheckRow>
        rows={[{ id: 1, done: false }]}
        columns={[{ key: 'done', title: '済', width: 80, editor: { type: 'checkbox' } }]}
        rowKeyGetter={(row) => row.id}
        height={200}
      />
    ));
    flush();
    const cell = view.container.querySelector<HTMLElement>('.ssg-body-row [data-ssg-col-key="done"]');
    expect(typeof cell?.onclick).toBe('function');
    expect(typeof cell?.querySelector<HTMLElement>('.ssg-cell-checkbox')?.onclick).toBe('function');
    view.unmount();
  });

  it('rows に store を渡すと、開発時に signal で持つように 1 回だけ案内する(0.1.0 の前の実アプリ点検 S1-01)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storeWarnings = () => warn.mock.calls.filter((call) => String(call[0]).includes('createStore'));
    const [state] = createStore({ rows: makeRows(5) });
    const fromStore = render(() => <SpreadsheetGrid<Row> rows={state.rows} columns={columns} height={200} />);
    flush();
    expect(storeWarnings()).toHaveLength(1);
    expect(String(storeWarnings()[0]?.[0])).toContain('createSignal');
    fromStore.unmount();
    warn.mockClear();
    const fromArray = render(() => <SpreadsheetGrid<Row> rows={makeRows(5)} columns={columns} height={200} />);
    flush();
    expect(storeWarnings()).toHaveLength(0);
    fromArray.unmount();
    warn.mockRestore();
  });
});