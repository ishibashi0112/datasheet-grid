// 追加(段 3-4 / S5-22・S12-03): 速さの見直しの回帰テスト。
//   - バーの文脈の filteredRows(表示順の行の配列)は、読まれたときだけ作る(誰も読まないのに、アクティブセルが動くたびに
//     全部の行を並べ直していた。100 万行の Ctrl+End で 1 回 30ms ほど)。
//   - 飾りの無い列のセルは書式・メモ・検査の印・データバー・auto-height の器の部品を作らない。列の指定が変わって飾りが付いたら
//     セルを作り直して、その飾りが出る(逆も)。
import { beforeAll, describe, expect, it } from 'vitest';
import { createSignal, flush } from 'solid-js';
import { render } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from './index';

type Row = { id: number; name: string; qty: number };

const makeRows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}`, qty: i }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

const cellOf = (container: HTMLElement, row: number, key: string) =>
  container.querySelector<HTMLElement>(`.ssg-body-row[data-row-index="${row}"] [data-ssg-col-key="${key}"]`);

describe('バーの filteredRows は読まれたときだけ作る', () => {
  it('バーが filteredRows を読まなければ、アクティブセルを動かしても行を並べ直さない', () => {
    const count = 5_000;
    let indexReads = 0;
    // 行の配列の数の添字の読み取りを数える(表示順の配列を作ると全部の行を読む)。
    const rows = new Proxy(makeRows(count), {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) {
          indexReads += 1;
        }
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    let handle: SpreadsheetGridHandle<Row> | undefined;
    let filteredRowsLength = -1;
    const { container } = render(() => (
      <SpreadsheetGrid<Row>
        ref={(h) => {
          handle = h;
        }}
        rows={rows}
        columns={[
          { key: 'name', title: '品名', width: 160 },
          { key: 'qty', title: '数量', width: 80 },
        ]}
        rowKeyGetter={(row) => row.id}
        height={300}
        renderTopBar={(ctx) => <div class="my-bar">{ctx.derivedSummary.activeCellLabel}</div>}
        renderBottomBar={(ctx) => (
          <button type="button" class="count" onClick={() => (filteredRowsLength = ctx.filteredRows.length)}>
            数える
          </button>
        )}
      />
    ));
    flush();
    indexReads = 0;
    for (let index = 0; index < 5; index += 1) {
      handle?.selectCell(index * 10, 1);
      flush();
    }
    // 見えている行の分だけ(数十行 × 何回か)。表示順の配列を作ると 1 回で 5,000 になる。
    expect(indexReads).toBeLessThan(count);
    expect(container.querySelector('.my-bar')?.textContent).not.toBe('');
    // 読めば今の表示順の行が返る。
    container.querySelector<HTMLButtonElement>('.count')?.click();
    expect(filteredRowsLength).toBe(count);
  });
});

describe('飾りの無い列のセル', () => {
  it('列に飾りを足すとその飾りが出て、外すと消える(セルの形が変わる)', () => {
    const plainColumns: GridColumn<Row>[] = [
      { key: 'name', title: '品名', width: 160, editable: true },
      { key: 'qty', title: '数量', width: 80, editable: true },
    ];
    const [columns, setColumns] = createSignal<GridColumn<Row>[]>(plainColumns);
    const { container } = render(() => (
      <SpreadsheetGrid<Row>
        rows={makeRows(10)}
        columns={columns()}
        rowKeyGetter={(row) => row.id}
        height={300}
        showValidationMarks
      />
    ));
    flush();
    const before = cellOf(container, 1, 'qty');
    expect(before?.getAttribute('aria-invalid')).toBeNull();
    expect(before?.querySelector('.ssg-cf-bar')).toBeNull();

    // 検査・データバー・メモ・セルの書式を足す。
    setColumns([
      { ...plainColumns[0]!, cellClassName: ({ rowIndex }) => (rowIndex === 1 ? 'is-second' : undefined), cellNote: () => 'メモ' },
      {
        ...plainColumns[1]!,
        validate: ({ value }) => (typeof value === 'number' && value >= 1 ? true : '1 以上'),
        conditionalFormat: { dataBar: { min: 0, max: 9 } },
      },
    ]);
    flush();
    expect(cellOf(container, 0, 'qty')?.getAttribute('aria-invalid')).toBe('true');
    expect(cellOf(container, 1, 'qty')?.getAttribute('aria-invalid')).toBeNull();
    expect(cellOf(container, 5, 'qty')?.querySelector('.ssg-cf-bar')).not.toBeNull();
    expect(cellOf(container, 1, 'name')?.classList.contains('is-second')).toBe(true);
    expect(cellOf(container, 1, 'name')?.classList.contains('ssg-body-cell--has-note')).toBe(true);
    expect(cellOf(container, 1, 'name')?.getAttribute('data-ssg-tooltip')).toBe('メモ');

    // 外すと元の形に戻る。
    setColumns(plainColumns);
    flush();
    expect(cellOf(container, 0, 'qty')?.getAttribute('aria-invalid')).toBeNull();
    expect(cellOf(container, 5, 'qty')?.querySelector('.ssg-cf-bar')).toBeNull();
    expect(cellOf(container, 1, 'name')?.classList.contains('is-second')).toBe(false);
    expect(cellOf(container, 1, 'name')?.classList.contains('ssg-body-cell--has-note')).toBe(false);
    expect(cellOf(container, 1, 'qty')?.textContent).toBe('1');
  });

  it('auto-height の列を足すと中身を器に入れ、外すと戻す', () => {
    const [columns, setColumns] = createSignal<GridColumn<Row>[]>([
      { key: 'name', title: '品名', width: 160 },
      { key: 'qty', title: '数量', width: 80 },
    ]);
    const { container } = render(() => (
      <SpreadsheetGrid<Row> rows={makeRows(10)} columns={columns()} rowKeyGetter={(row) => row.id} height={300} autoHeight />
    ));
    flush();
    expect(cellOf(container, 0, 'name')?.querySelector('[data-autoheight-content]')).toBeNull();
    setColumns([
      { key: 'name', title: '品名', width: 160, autoHeight: true },
      { key: 'qty', title: '数量', width: 80 },
    ]);
    flush();
    const cell = cellOf(container, 0, 'name');
    expect(cell?.hasAttribute('data-autoheight-cell')).toBe(true);
    expect(cell?.querySelector('[data-autoheight-content]')?.textContent).toBe('品目 1');
    setColumns([
      { key: 'name', title: '品名', width: 160 },
      { key: 'qty', title: '数量', width: 80 },
    ]);
    flush();
    expect(cellOf(container, 0, 'name')?.querySelector('[data-autoheight-content]')).toBeNull();
    expect(cellOf(container, 0, 'name')?.textContent).toBe('品目 1');
  });
});