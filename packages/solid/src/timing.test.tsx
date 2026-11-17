// 試作の計測: 同じタスクの中で続けて起きたイベント(JS から dispatch したもの)に、コントローラが追いつくか。
import { beforeAll, expect, it, vi } from 'vitest';
import { flush } from 'solid-js';
import { fireEvent, render } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from './index';

type Row = { id: number; name: string };
const columns: GridColumn<Row>[] = [{ key: 'name', title: '品名', width: 120 }];
const rows: Row[] = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}` }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

it.each([
  ['flush なし', false],
  ['flush あり', true],
])('ArrowDown を 3 回(%s)', (_label, withFlush) => {
  const onActiveCellChange = vi.fn();
  const { container } = render(() => (
    <SpreadsheetGrid<Row> rows={rows} columns={columns} rowKeyGetter={(row) => row.id} onActiveCellChange={onActiveCellChange} height={400} />
  ));
  flush();
  const shell = container.querySelector<HTMLElement>('.ssg-shell');
  const cell = container.querySelector<HTMLElement>('.ssg-body-row[data-row-index="0"] [data-ssg-col-key="name"]');
  if (!shell || !cell) throw new Error('no grid');
  fireEvent.pointerDown(cell, { button: 0, pointerId: 1, isPrimary: true });
  fireEvent.pointerUp(cell, { button: 0, pointerId: 1, isPrimary: true });
  flush();
  for (let i = 0; i < 3; i += 1) {
    fireEvent.keyDown(shell, { key: 'ArrowDown' });
    if (withFlush) flush();
  }
  flush();
  const last = onActiveCellChange.mock.calls.at(-1)?.[0];
  // 試作の最初の形では flush なしだと 1 行しか動かなかった(キー操作のコントローラが update で受けた uiState = signal の値を
  //   読み、Solid が書き込みを反映する(マイクロタスク)前の 2 回目・3 回目は古い位置から動いた)。段階 0-1 でコントローラが
  //   イベントの時点の store を読む(getUiState)ようにしたので、どちらも 3 行動く。
  expect(last?.rowKey).toBe(4);
});

it('同じタスクの中でハンドルの selectCell → startEditing', () => {
  let handle: SpreadsheetGridHandle<Row> | undefined;
  const { container } = render(() => (
    <SpreadsheetGrid<Row>
      ref={(h) => {
        handle = h;
      }}
      rows={rows}
      columns={columns}
      rowKeyGetter={(row) => row.id}
      onRowsChange={() => {}}
      height={400}
    />
  ));
  flush();
  handle?.selectCell(5, 0);
  const started = handle?.startEditing();
  flush();
  const editor = container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
  // 実測の記録(どのセルで開いたか)。
  console.log(`selectCell → startEditing: started=${String(started)} editor=${editor?.value ?? 'なし'}`);
  expect(started).toBe(true);
});