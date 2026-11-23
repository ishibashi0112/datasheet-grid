// 追加(1.5.0): serverSideRefetch="keep"(取り直しの間は前の行を薄く見せる)の配線の結合テストです。行モデルの差し替えの
//   規則(見えている範囲がそろったら / 失敗したら)は core の serverSideRowModel.keep.test.ts が正本で、ここではシェルの
//   ルートの修飾子・見出しの下の線・aria-busy・編集を止めること・既定('skeleton')では何も付かないことを確かめます。
//   React 版と Solid 版の DOM の比べは packages/solid の parity(serverSide)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type {
  GridColumn,
  ServerSideDataSource,
  ServerSideGetRowsParams,
  SpreadsheetGridHandle,
} from './model/gridTypes';

type Row = { id: number; name: string };

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

afterEach(() => {
  cleanup();
});

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: '品名', width: 160, editor: { type: 'text' } },
];

// getRows を溜めておき、respond で返す擬似サーバー(返す行の名前に何回目の取得かを入れる)。
const createServer = () => {
  const pending: { params: ServerSideGetRowsParams; resolve: (value: { rows: Row[]; totalRowCount: number }) => void }[] = [];
  let round = 0;
  const dataSource: ServerSideDataSource<Row> = {
    blockSize: 50,
    getRows: (params) =>
      new Promise((resolve) => {
        pending.push({ params, resolve });
      }),
    updateRows: () => Promise.resolve(),
  };
  const respond = async () => {
    round += 1;
    const list = pending.splice(0, pending.length);
    await act(async () => {
      for (const { params, resolve } of list) {
        const rows: Row[] = [];
        for (let i = params.startIndex; i < Math.min(params.endIndex, 120); i += 1) {
          rows.push({ id: i + 1, name: `第 ${round} 回 ${i + 1}` });
        }
        resolve({ rows, totalRowCount: 120 });
      }
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  return { dataSource, respond, pending };
};

const wait = async (ms: number) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const renderGrid = async (refetch: 'skeleton' | 'keep' | undefined) => {
  const server = createServer();
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const view = render(
    <SpreadsheetGrid
      ref={ref}
      dataSource={server.dataSource}
      columns={columns}
      rowKeyGetter={(row) => row.id}
      rowHeight={30}
      height={360}
      motion="off"
      serverSideRefetch={refetch}
    />,
  );
  await wait(200);
  await server.respond();
  return { ...view, server, ref };
};

const root = (container: HTMLElement) => container.querySelector('.ssg-root') as HTMLElement;
const grid = (container: HTMLElement) => container.querySelector('[role="grid"]') as HTMLElement;
const nameOfRow = (container: HTMLElement, index: number) =>
  container.querySelector(`.ssg-body-row[data-pane="center"][data-row-index="${index}"] [data-ssg-col-key="name"]`)
    ?.textContent;

describe('serverSideRefetch', () => {
  it('"keep": 取り直しの間は前の行を見せ、ルートの修飾子・見出しの下の線・aria-busy を付け、届いたら外す', async () => {
    const { container, server, ref } = await renderGrid('keep');
    expect(nameOfRow(container, 2)).toBe('第 1 回 3');
    expect(root(container).classList.contains('ssg-root--refetching')).toBe(false);
    act(() => {
      ref.current?.refreshServerSide();
    });
    expect(root(container).classList.contains('ssg-root--refetching')).toBe(true);
    expect(grid(container).getAttribute('aria-busy')).toBe('true');
    const bar = container.querySelector<HTMLElement>('.ssg-refetch-bar');
    expect(bar?.getAttribute('aria-hidden')).toBe('true');
    expect(bar?.style.top).toBe('40px');
    // 薄くするのは行ではなく、本体の見えている所に重ねる面(行の opacity を変えると固定列のペインの下が透けるため)。
    const veil = container.querySelector<HTMLElement>('.ssg-refetch-veil');
    expect(veil?.getAttribute('aria-hidden')).toBe('true');
    expect(veil?.style.top).toBe('40px');
    // 前の行のまま(読み込み中の行にしない)。
    expect(nameOfRow(container, 2)).toBe('第 1 回 3');
    expect(container.querySelector('[data-skeleton-row]')).toBeNull();
    // 前の行を見せている間は編集を始めない(表示の読み取り専用の印は付けない)。
    act(() => {
      ref.current?.setActiveCell({ row: 2, col: 1 });
    });
    const shell = container.querySelector('.ssg-shell') as HTMLElement;
    fireEvent.keyDown(shell, { key: 'Enter' });
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
    expect(container.querySelector('.ssg-body-cell--readonly')).toBeNull();
    expect(grid(container).hasAttribute('aria-readonly')).toBe(false);
    await wait(50);
    await server.respond();
    expect(root(container).classList.contains('ssg-root--refetching')).toBe(false);
    expect(grid(container).hasAttribute('aria-busy')).toBe(false);
    expect(container.querySelector('.ssg-refetch-bar')).toBeNull();
    expect(container.querySelector('.ssg-refetch-veil')).toBeNull();
    expect(nameOfRow(container, 2)).toBe('第 2 回 3');
    // 届いた後は編集できる。
    fireEvent.keyDown(shell, { key: 'Enter' });
    expect(container.querySelector('.ssg-cell-editor-input')).not.toBeNull();
  });

  it('既定(skeleton)では取り直しの間は読み込み中の行で、修飾子も線も付けない', async () => {
    const { container, server, ref } = await renderGrid(undefined);
    act(() => {
      ref.current?.refreshServerSide();
    });
    expect(root(container).classList.contains('ssg-root--refetching')).toBe(false);
    expect(grid(container).hasAttribute('aria-busy')).toBe(false);
    expect(container.querySelector('.ssg-refetch-bar')).toBeNull();
    expect(container.querySelector('.ssg-refetch-veil')).toBeNull();
    expect(container.querySelector('[data-skeleton-row]')).not.toBeNull();
    await wait(50);
    await server.respond();
    expect(nameOfRow(container, 2)).toBe('第 2 回 3');
  });
});