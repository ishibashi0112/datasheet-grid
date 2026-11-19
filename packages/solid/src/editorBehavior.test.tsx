// エディタの振る舞いのうち、React 版と並べて比べるテストでは見えにくいもの。段階 1-2 の別視点のレビューの指摘の回帰テスト。
import { beforeAll, describe, expect, it } from 'vitest';
import { flush } from 'solid-js';
import { fireEvent, render } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import type { CellEditorContext } from '@ishibashi0112/spreadsheet-grid-core';
import { SpreadsheetGrid, type GridColumn, type SolidGridTypes } from './index';

type Row = { id: number; name: string; code: string };

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}`, code: `C${i + 1}` }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

const cellOf = (container: HTMLElement, row: number, key: string) => {
  const cell = container.querySelector<HTMLElement>(`.ssg-body-row[data-row-index="${row}"] [data-ssg-col-key="${key}"]`);
  if (!cell) {
    throw new Error(`セルがありません: ${row} ${key}`);
  }
  return cell;
};

const openByDoubleClick = (container: HTMLElement, row: number, key: string) => {
  const cell = cellOf(container, row, key);
  fireEvent.pointerDown(cell, { button: 0, pointerId: 1 });
  flush();
  fireEvent.pointerUp(window, { button: 0, pointerId: 1 });
  flush();
  fireEvent.doubleClick(cell);
  flush();
};

describe('エディタの振る舞い', () => {
  it('custom: セッションが終わった後の ctx は、そのセッションの行・位置・値のまま(別のセルの編集が始まっても)', () => {
    const contexts: CellEditorContext<Row, SolidGridTypes>[] = [];
    const columns: GridColumn<Row>[] = [
      { key: 'name', title: '品名', width: 120 },
      {
        key: 'code',
        title: 'コード',
        width: 120,
        editor: {
          type: 'custom',
          render: (ctx) => {
            contexts.push(ctx);
            return <input class="my-editor" value={ctx.initialText} />;
          },
        },
      },
    ];
    const { container } = render(() => (
      <SpreadsheetGrid<Row> rows={makeRows(6)} columns={columns} rowKeyGetter={(row) => row.id} />
    ));
    flush();
    openByDoubleClick(container, 1, 'code');
    const first = contexts[0];
    expect(first?.rowKey).toBe(2);
    openByDoubleClick(container, 3, 'code');
    expect(contexts).toHaveLength(2);
    expect(contexts[1]?.rowKey).toBe(4);
    // 古い ctx は前のセッションのまま(今の編集のセル = 行 4 を指さない)。
    expect(first?.rowKey).toBe(2);
    expect(first?.rowIndex).toBe(1);
    expect(first?.row).toEqual({ id: 2, name: '品目 2', code: 'C2' });
    expect(first?.value).toBe('C2');
    // 編集をやめた後も同じ。古い ctx の commit は何もしない。
    fireEvent.keyDown(container.querySelector('.ssg-shell') as HTMLElement, { key: 'Escape' });
    flush();
    expect(first?.rowKey).toBe(2);
    expect(first?.commit('X')).toEqual({ status: 'noop' });
  });
});