// 追加(Solid 版 段階 0 の見直し): シェルの判断を core へ寄せたとき(controllers/liveUiState・engine/cellCommands)に、
//   別視点のレビューで見つかった 2 つの経路を固定します。
//   - custom エディタ(div など、入力部品でない要素)が keydown の中で ctx.commit / ctx.cancel を呼ぶと、store はその場で
//     編集を終えますが、同じ keydown はまだ描き直す前のシェルまで上がってきます。グリッドがそのキーを扱うと、Enter で
//     同じセルの編集が開き直り、Escape で選択まで消えていました(store の今の値だけで「編集中か」を見たため)。
//   - renderCell の ctx.setValue を後で(並びが変わった後に)呼んでも、描いた時点の行へ書きます。
// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createRef, useState } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string; flag: string };

let restore: () => void = () => {};
beforeAll(() => {
  restore = installJsdomLayoutStubs();
});
afterAll(() => restore());
afterEach(() => cleanup());

const flushFrames = async () => {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
};

it('div の custom エディタで Enter の確定は 1 回だけ(編集が開き直らない)、Escape は選択を残す', async () => {
  const gridRef = createRef<SpreadsheetGridHandle<Row>>();
  let latestRows: Row[] = [];
  function Harness() {
    const [rows, setRows] = useState<Row[]>([
      { id: 1, name: 'a', flag: '' },
      { id: 2, name: 'b', flag: '' },
      { id: 3, name: 'c', flag: '' },
    ]);
    latestRows = rows;
    return (
      <SpreadsheetGrid<Row>
        ref={gridRef}
        rows={rows}
        onRowsChange={setRows}
        rowKeyGetter={(row) => row.id}
        columns={[
          {
            key: 'name',
            title: 'Name',
            width: 160,
            editor: {
              type: 'custom',
              render: (ctx) => (
                <div
                  data-testid="custom-editor"
                  tabIndex={0}
                  ref={(element) => {
                    element?.focus();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      ctx.commit('X', 'down');
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      ctx.cancel();
                    }
                  }}
                >
                  edit
                </div>
              ),
            },
          },
        ]}
      />
    );
  }
  const { queryByTestId } = render(<Harness />);
  await act(async () => {
    gridRef.current?.startEditing(0, 0);
  });
  await flushFrames();
  const editor = queryByTestId('custom-editor');
  expect(editor).not.toBeNull();
  fireEvent.keyDown(editor as HTMLElement, { key: 'Enter' });
  await flushFrames();
  expect(latestRows.map((row) => row.name)).toEqual(['X', 'b', 'c']);
  expect(queryByTestId('custom-editor')).toBeNull();
  expect(gridRef.current?.getActiveCell()).toEqual({ row: 1, col: 0 });

  await act(async () => {
    gridRef.current?.startEditing(1, 0);
  });
  await flushFrames();
  const second = queryByTestId('custom-editor');
  expect(second).not.toBeNull();
  fireEvent.keyDown(second as HTMLElement, { key: 'Escape' });
  await flushFrames();
  expect(queryByTestId('custom-editor')).toBeNull();
  expect(gridRef.current?.getSelection()).not.toBeNull();
  expect(gridRef.current?.getActiveCell()).toEqual({ row: 1, col: 0 });
});

it('renderCell の ctx.setValue は、並びが変わった後に呼んでも描いた時点の行へ書く', async () => {
  const gridRef = createRef<SpreadsheetGridHandle<Row>>();
  const setters = new Map<number, (value: unknown) => void>();
  let latestRows: Row[] = [];
  function Harness() {
    const [rows, setRows] = useState<Row[]>([
      { id: 1, name: 'c', flag: '' },
      { id: 2, name: 'a', flag: '' },
      { id: 3, name: 'b', flag: '' },
    ]);
    latestRows = rows;
    return (
      <SpreadsheetGrid<Row>
        ref={gridRef}
        rows={rows}
        onRowsChange={setRows}
        rowKeyGetter={(row) => row.id}
        columns={[
          { key: 'name', title: 'Name', width: 120 },
          {
            key: 'flag',
            title: 'Flag',
            width: 120,
            renderCell: (ctx) => {
              // 最初の描画の setValue だけを控える(非同期の処理が古い ctx を持っている形)。
              if (!setters.has(ctx.row.id)) {
                setters.set(ctx.row.id, ctx.setValue);
              }
              return String(ctx.value);
            },
          },
        ]}
      />
    );
  }
  render(<Harness />);
  await flushFrames();
  // name の昇順: a(id 2)/ b(id 3)/ c(id 1)。
  await act(async () => {
    gridRef.current?.applyState({ sort: [{ columnKey: 'name', direction: 'asc' }] });
  });
  await flushFrames();
  await act(async () => {
    setters.get(1)?.('X');
  });
  expect(latestRows.map((row) => [row.id, row.flag])).toEqual([
    [1, 'X'],
    [2, ''],
    [3, ''],
  ]);
});