// SpreadsheetGrid を実際に render し、エディタ commit 後のアクティブセル移動を実行検証する
//   結合テストです(enter-move ①: rAF 時点の最新境界で clamp)。
//   消費側が onRowsChange で末尾空行を追加するパターン(Excel 的入力グリッドの定石)で、
//   最終行の Enter 確定が「増えた行」へ移動できることを担保します(SS2603 現場報告の回帰)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import type { Ref, RefObject } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      ResizeObserverStub;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
});

afterEach(() => {
  cleanup();
});

type Row = { id: string; code: string };

let rowSeq = 0;
const createRow = (): Row => ({ id: `r${rowSeq++}`, code: '' });

const columns: GridColumn<Row>[] = [
  { key: 'code', title: '品番', width: 140, editable: true },
];

// 消費側の「末尾に空行を必ず 1 つ保つ」ロジック(SS2603 の ensureTrailingEmptyRow 相当)。
const ensureTrailingEmptyRow = (rows: Row[]): Row[] =>
  rows.length > 0 && rows[rows.length - 1].code === ''
    ? rows
    : [...rows, createRow()];

let currentRows: Row[] = [];

function Harness({
  gridRef,
  keepTrailingEmptyRow,
  initialRowCount = 1,
}: {
  gridRef: Ref<SpreadsheetGridHandle<Row>>;
  // true: onRowsChange で末尾空行を追加する(動的に行が増えるパターン)。
  keepTrailingEmptyRow: boolean;
  initialRowCount?: number;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: initialRowCount }, createRow),
  );
  useEffect(() => {
    currentRows = rows;
  }, [rows]);
  return (
    <SpreadsheetGrid
      ref={gridRef}
      rows={rows}
      onRowsChange={(next) =>
        setRows(keepTrailingEmptyRow ? ensureTrailingEmptyRow(next) : next)
      }
      rowKeyGetter={(row) => row.id}
      columns={columns}
    />
  );
}

const getShell = (container: HTMLElement): HTMLElement => {
  const shell = container.querySelector<HTMLElement>('.ssg-shell');
  if (!shell) {
    throw new Error('ssg-shell が見つかりません');
  }
  return shell;
};

// アクティブセルへ印字キーで編集開始 → 値変更 → Enter 確定、まで(rAF は呼び出し側で待つ)。
const typeAndEnter = (
  ref: RefObject<SpreadsheetGridHandle<Row> | null>,
  container: HTMLElement,
  row: number,
  value: string,
) => {
  act(() => {
    ref.current?.setActiveCell({ row, col: 0 });
  });
  fireEvent.keyDown(getShell(container), { key: value[0] ?? 'x' });
  const input = container.querySelector<HTMLInputElement>(
    '.ssg-cell-editor-input',
  );
  expect(input).not.toBeNull();
  fireEvent.change(input!, { target: { value } });
  act(() => {
    fireEvent.keyDown(input!, { key: 'Enter' });
  });
};

// commit 後のフォーカス復帰 + アクティブセル反映(rAF)を消化します。
const flushCommitRaf = async () => {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
};

describe('SpreadsheetGrid エディタ commit 後の移動(結合)', () => {
  it('末尾空行維持パターン: 最終行の Enter 確定で「増えた行」へ移動する', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <Harness gridRef={ref} keepTrailingEmptyRow />,
    );

    // 1 件目: 唯一の行(= 最終行)に入力して Enter → 末尾空行が増え、そこへ移動する。
    typeAndEnter(ref, container, 0, 'FJW4300600');
    expect(currentRows.map((r) => r.code)).toEqual(['FJW4300600', '']);
    await flushCommitRaf();
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 0 });

    // 2 件目: 連続入力でも同様に下へ進む(現場の「直接入力 → Enter で下へ」フロー)。
    typeAndEnter(ref, container, 1, 'FJW4300700');
    expect(currentRows.map((r) => r.code)).toEqual([
      'FJW4300600',
      'FJW4300700',
      '',
    ]);
    await flushCommitRaf();
    expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: 0 });
  });

  it('行が増えない場合: 最終行の Enter 確定はその場に留まる(clamp 維持)', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <Harness gridRef={ref} keepTrailingEmptyRow={false} initialRowCount={2} />,
    );

    typeAndEnter(ref, container, 1, 'LAST');
    expect(currentRows.map((r) => r.code)).toEqual(['', 'LAST']);
    await flushCommitRaf();
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 0 });
  });

  it('最終行以外の Enter 確定は従来どおり 1 行下へ移動する', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <Harness gridRef={ref} keepTrailingEmptyRow={false} initialRowCount={3} />,
    );

    typeAndEnter(ref, container, 0, 'MID');
    await flushCommitRaf();
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 0 });
  });
});
