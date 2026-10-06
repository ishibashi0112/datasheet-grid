// 追加(G-2)の回帰テスト: IME オンのままの直接入力(imeDirectInput)です。実グリッドを StrictMode で render し、
//   ①既定(未指定)では入力受けを描画しない(従来どおりルートがフォーカスを持つ)
//   ②有効時はセルのクリックで入力受けにフォーカスが来て、変換 → 確定で確定文字列を初期値に編集が始まり、
//     もう一度 Enter でセルを確定して移動する
//   ③text 以外のエディタの列では変換を捨てる
//   ④入力受けにフォーカスがあっても矢印 / F2 は従来どおりで、変換中のキーはグリッドが扱わない
//   を検証します(CDP での実ブラウザ確認は audit/harness の t-features)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { StrictMode, createRef, useEffect, useState } from 'react';
import type { RefObject } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string; qty: number };

const initialRows: Row[] = [
  { id: 1, name: 'alpha', qty: 5 },
  { id: 2, name: 'beta', qty: 12 },
  { id: 3, name: 'gamma', qty: 30 },
];

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160 },
  { key: 'qty', title: '数量', width: 100, editor: { type: 'number' } },
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

function Harness({
  gridRef,
  imeDirectInput,
}: {
  gridRef: RefObject<SpreadsheetGridHandle<Row> | null>;
  imeDirectInput?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    currentRows = rows;
  }, [rows]);
  return (
    <SpreadsheetGrid<Row>
      ref={gridRef}
      rows={rows}
      onRowsChange={setRows}
      columns={columns}
      rowKeyGetter={(row) => row.id}
      imeDirectInput={imeDirectInput}
    />
  );
}

const renderGrid = (imeDirectInput?: boolean) => {
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

const getImeInput = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('[data-ssg-ime-input]');

// セルのクリック(pointerdown でアクティブセル + ルートへフォーカス → 入力受けへ回る)。
const clickCell = (cell: HTMLElement) => {
  fireEvent.pointerDown(cell, { button: 0, pointerType: 'mouse', pointerId: 1 });
  fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
};

// 変換中 → 確定(compositionend の後の受け渡しはマイクロタスク)。
const composeAndCommit = async (input: HTMLInputElement, text: string) => {
  fireEvent.compositionStart(input, { data: '' });
  input.value = text;
  fireEvent.input(input);
  await act(async () => {
    fireEvent.compositionEnd(input, { data: text });
    await Promise.resolve();
  });
};

describe('IME オンのままの直接入力(imeDirectInput・G-2)', () => {
  it('既定(未指定)では入力受けを描画せず、ルートがフォーカスを持つ', () => {
    const { container } = renderGrid();
    expect(getImeInput(container)).toBeNull();
    clickCell(getCell(container, 0, 0));
    expect(document.activeElement?.classList.contains('ssg-shell')).toBe(true);
  });

  it('変換 → 確定で確定文字列を初期値に編集が始まり、もう一度 Enter でセルを確定して下へ移動する', async () => {
    const { container, ref } = renderGrid(true);
    const ime = getImeInput(container);
    expect(ime).not.toBeNull();
    clickCell(getCell(container, 1, 0));
    expect(document.activeElement).toBe(ime);

    await composeAndCommit(ime!, '漢字');
    const editor = container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
    expect(editor).not.toBeNull();
    expect(editor!.value).toBe('漢字');
    expect(ime!.classList.contains('ssg-ime-input--composing')).toBe(false);
    expect(ime!.value).toBe('');

    await act(async () => {
      fireEvent.keyDown(editor!, { key: 'Enter' });
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(currentRows[1]?.name).toBe('漢字');
    expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: 0 });
    expect(document.activeElement).toBe(ime);
  });

  it('text 以外のエディタの列では変換を捨てる(編集を始めない)', async () => {
    const { container } = renderGrid(true);
    const ime = getImeInput(container)!;
    clickCell(getCell(container, 0, 1));
    fireEvent.compositionStart(ime, { data: '' });
    expect(ime.classList.contains('ssg-ime-input--composing')).toBe(false);
    ime.value = '１２';
    await act(async () => {
      fireEvent.compositionEnd(ime, { data: '１２' });
      await Promise.resolve();
    });
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
    expect(ime.value).toBe('');
    expect(currentRows[0]?.qty).toBe(5);
  });

  it('入力受けにフォーカスがあっても矢印 / F2 は従来どおりで、変換中のキーはグリッドが扱わない', () => {
    const { container, ref } = renderGrid(true);
    const ime = getImeInput(container)!;
    clickCell(getCell(container, 0, 0));

    fireEvent.keyDown(ime, { key: 'ArrowDown' });
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 0 });
    // 変換中(isComposing)の ArrowDown は IME の候補選択なので動かない。
    fireEvent.keyDown(ime, { key: 'ArrowDown', isComposing: true });
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 0 });

    fireEvent.keyDown(ime, { key: 'F2' });
    expect(container.querySelector<HTMLInputElement>('.ssg-cell-editor-input')?.value).toBe('beta');
  });
});