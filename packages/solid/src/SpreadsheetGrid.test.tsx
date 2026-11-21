// 試作の結合テスト(jsdom)。React 版の結合テストと同じく、core の installJsdomLayoutStubs でレイアウトを装います
//   (React 非依存なので Solid でもそのまま使えた)。Solid 2.0 は書き込みをマイクロタスクでまとめて反映するので、
//   イベントの後に DOM を見るときは flush() を挟みます。
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createSignal, flush } from 'solid-js';
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

  it('クリックでアクティブセル、矢印キーで動き、onActiveCellChange が呼ばれる', () => {
    const { container, shell, onActiveCellChange } = setup();
    const target = cellOf(container, 1, 'name');
    if (!target) throw new Error('セルがありません');
    fireEvent.pointerDown(target, { button: 0, pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(target, { button: 0, pointerId: 1, isPrimary: true });
    flush();
    expect(container.querySelector('.ssg-active-cell-overlay')).not.toBeNull();
    fireEvent.keyDown(shell, { key: 'ArrowDown' });
    flush();
    // onActiveCellChange は passive(createEffect)なので flush の後。
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
});