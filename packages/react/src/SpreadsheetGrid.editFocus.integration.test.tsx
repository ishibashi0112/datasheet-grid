// 追加(編集確定後のフォーカス奪取)の回帰テスト: 実グリッドを StrictMode で render し、セル編集中に
//   ①グリッド外の入力欄(グリッドの上の登録フォーム / 上部バーのグローバルフィルター)をクリックすると、
//     エディタの blur で値は確定し、フォーカスはクリックした入力欄に残る(グリッドへ奪い返さない)
//   ②Enter / Tab / Escape(キー操作)での確定・取消は従来どおりグリッドへ戻る
//   ③グリッド内の別のセルをクリックして確定したときはグリッドに残り、クリックしたセルがアクティブになる
//     (追加: 確定後のアクティブセル上書き。行ヘッダーの行選択も編集していたセルへ戻さない)
//   を imeDirectInput の有無それぞれで検証します(有効時は「グリッドへ戻る」= 入力受けへ回る)。
//   実ブラウザでの追試は audit/harness の t-verify。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { StrictMode, createRef, useEffect, useState } from 'react';
import type { RefObject } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string; memo: string };

const initialRows: Row[] = [
  { id: 1, name: 'alpha', memo: 'a' },
  { id: 2, name: 'beta', memo: 'b' },
  { id: 3, name: 'gamma', memo: 'c' },
];

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160 },
  { key: 'memo', title: 'メモ', width: 160 },
];

let restore: () => void;
beforeAll(() => {
  restore = installJsdomLayoutStubs();
});
afterAll(() => {
  restore();
});
afterEach(() => {
  cleanup();
});

let currentRows: Row[] = initialRows;

// グリッドの上に登録フォーム(グリッド外の入力欄)がある画面。
function Harness({
  gridRef,
  imeDirectInput,
}: {
  gridRef: RefObject<SpreadsheetGridHandle<Row> | null>;
  imeDirectInput: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    currentRows = rows;
  }, [rows]);
  return (
    <>
      <input data-testid="outside-form" />
      <SpreadsheetGrid<Row>
        ref={gridRef}
        rows={rows}
        onRowsChange={setRows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        imeDirectInput={imeDirectInput}
      />
    </>
  );
}

const renderGrid = (imeDirectInput: boolean) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const utils = render(
    <StrictMode>
      <Harness gridRef={ref} imeDirectInput={imeDirectInput} />
    </StrictMode>,
  );
  return { ref, ...utils };
};

const getCell = (container: HTMLElement, rowIndex: number, colIndex: number): HTMLElement => {
  const rowEl = container.querySelectorAll('.ssg-body-row')[rowIndex];
  const cell = rowEl?.querySelectorAll<HTMLElement>('.ssg-body-cell')[colIndex];
  if (!cell) {
    throw new Error(`セル (${rowIndex}, ${colIndex}) が見つかりません`);
  }
  return cell;
};

const clickCell = (cell: HTMLElement) => {
  fireEvent.pointerDown(cell, { button: 0, pointerType: 'mouse', pointerId: 1 });
  fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
};

// 確定後の後処理(rAF)まで進めます。
const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

// セルをクリック → F2 で編集を始め、値を書き換えたエディタを返します。
const startEditing = (container: HTMLElement, rowIndex: number, colIndex: number, value: string) => {
  clickCell(getCell(container, rowIndex, colIndex));
  fireEvent.keyDown(document.activeElement!, { key: 'F2' });
  const editor = container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
  if (!editor) {
    throw new Error('エディタが開いていません');
  }
  expect(document.activeElement).toBe(editor);
  fireEvent.change(editor, { target: { value } });
  return editor;
};

describe.each([
  { imeDirectInput: false, label: 'imeDirectInput なし' },
  { imeDirectInput: true, label: 'imeDirectInput あり' },
])('編集確定後のフォーカス復帰($label)', ({ imeDirectInput }) => {
  // 「グリッドへ戻る」ときのフォーカス先(有効時はルートへの focus が入力受けへ回る)。
  const gridFocusTarget = (container: HTMLElement) =>
    imeDirectInput
      ? container.querySelector('[data-ssg-ime-input]')
      : container.querySelector('.ssg-shell');

  it('グリッド外の入力欄をクリックすると値は確定し、フォーカスはその入力欄に残る', async () => {
    const { container, getByTestId } = renderGrid(imeDirectInput);
    const outside = getByTestId('outside-form') as HTMLInputElement;
    startEditing(container, 0, 0, 'abc');

    await act(async () => {
      outside.focus(); // クリックでフォーカスが移る(エディタの blur で確定)
      await nextFrame();
    });

    expect(currentRows[0]?.name).toBe('abc');
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it('上部バーのグローバルフィルター入力をクリックしたときも、フォーカスはその入力欄に残る', async () => {
    const { container } = renderGrid(imeDirectInput);
    const barInput = container.querySelector<HTMLInputElement>('.ssg-bar-input');
    expect(barInput).not.toBeNull();
    startEditing(container, 1, 0, 'xyz');

    await act(async () => {
      barInput!.focus();
      await nextFrame();
    });

    expect(currentRows[1]?.name).toBe('xyz');
    expect(document.activeElement).toBe(barInput);
  });

  it('Enter で確定するとグリッドへ戻り、下へ移動する', async () => {
    const { container, ref } = renderGrid(imeDirectInput);
    const editor = startEditing(container, 0, 0, 'enter');

    await act(async () => {
      fireEvent.keyDown(editor, { key: 'Enter' });
      await nextFrame();
    });

    expect(currentRows[0]?.name).toBe('enter');
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 0 });
    expect(document.activeElement).toBe(gridFocusTarget(container));
  });

  it('Tab で確定するとグリッドへ戻り、右へ移動する', async () => {
    const { container, ref } = renderGrid(imeDirectInput);
    const editor = startEditing(container, 0, 0, 'tab');

    await act(async () => {
      fireEvent.keyDown(editor, { key: 'Tab' });
      await nextFrame();
    });

    expect(currentRows[0]?.name).toBe('tab');
    expect(ref.current?.getActiveCell()).toEqual({ row: 0, col: 1 });
    expect(document.activeElement).toBe(gridFocusTarget(container));
  });

  it('Escape で取り消すとグリッドへ戻る(値は不変)', async () => {
    const { container } = renderGrid(imeDirectInput);
    const editor = startEditing(container, 2, 0, 'cancelled');

    await act(async () => {
      fireEvent.keyDown(editor, { key: 'Escape' });
      await nextFrame();
    });

    expect(currentRows[2]?.name).toBe('gamma');
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
    expect(document.activeElement).toBe(gridFocusTarget(container));
  });

  it('グリッド内の別のセルをクリックして確定したときはグリッドに残り、クリックしたセルがアクティブになる', async () => {
    const { container, ref } = renderGrid(imeDirectInput);
    startEditing(container, 0, 0, 'moved');

    await act(async () => {
      clickCell(getCell(container, 2, 1)); // pointerdown でルートへフォーカス → エディタの blur で確定
      await nextFrame();
    });

    expect(currentRows[0]?.name).toBe('moved');
    expect(document.activeElement).toBe(gridFocusTarget(container));
    // 確定後の後処理で編集していたセル (0, 0) へ戻さない。
    expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: 1 });
    expect(ref.current?.getSelection()).toEqual({
      type: 'cell',
      range: { start: { row: 2, col: 1 }, end: { row: 2, col: 1 } },
    });
  });

  it('行ヘッダーを押して確定したときは、その行の選択を編集していたセルへ戻さない', async () => {
    const { container, ref } = renderGrid(imeDirectInput);
    startEditing(container, 0, 0, 'row');
    const rowHeader = container.querySelector<HTMLElement>(
      '.ssg-body-row[data-row-index="1"] .ssg-row-header-cell',
    );
    expect(rowHeader).not.toBeNull();

    await act(async () => {
      fireEvent.pointerDown(rowHeader!, { button: 0, pointerType: 'mouse', pointerId: 1 });
      fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
      await nextFrame();
    });

    expect(currentRows[0]?.name).toBe('row');
    expect(ref.current?.getSelection()).toEqual({ type: 'row', startRow: 1, endRow: 1 });
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 0 });
    expect(document.activeElement).toBe(gridFocusTarget(container));
  });
});