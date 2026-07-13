// SpreadsheetGrid を実際に render し、undo/redo(編集履歴)の「配線」を実行検証する結合テストです。
//   純ロジック(logic/history.test.ts)では到達できない以下を、実コンポーネントを通して確認します:
//   - ペースト(grid 起点の編集)が履歴に積まれ、Ctrl/Cmd+Z / Shift+Z / Y で往復する。
//   - ハンドル(undo / redo / canUndo / canRedo / clearUndoHistory)が動く。
//   - undo が「変更前 rows 配列の参照そのもの」を onRowsChange へ返す(スナップショット契約)。
//   - 新しい編集で redo 系譜が破棄される。
//   - 外部からの rows 差し替え(grid 起点でない変更)で履歴が自動破棄される。
//   - readOnly / enableUndoRedo=false で無効化される。undoHistoryLimit で最古から破棄される。
//   編集経路はペースト(onPaste)で代表させます(セル編集 commit と同じ handleRowsChange 集約点を
//   通るため。仮想化行の DOM は jsdom では描画されず、ダブルクリック編集はここでは扱えません)。
// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import type { Ref, RefObject } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import type {
  GridColumn,
  SpreadsheetGridHandle,
  UndoRedoState,
} from './model/gridTypes';

// jsdom には ResizeObserver / Element.scrollTo が無いため、最小スタブを入れます
//   (SpreadsheetGrid.integration.test.tsx と同じ流儀)。
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

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 160 },
  { key: 'qty', title: 'Qty', width: 100 },
];

const initialRows: Row[] = [
  { id: 1, name: 'alpha', qty: 10 },
  { id: 2, name: 'beta', qty: 20 },
  { id: 3, name: 'gamma', qty: 30 },
];

// ハーネスの外から「親の現在 rows」を読む/差し替えるための口です(effect で同期。
//   render 中の module 変数書き込みはしません)。
let currentRows: Row[] = initialRows;
let externalSetRows: (next: Row[]) => void = () => {};

beforeEach(() => {
  currentRows = initialRows;
  externalSetRows = () => {};
});

// controlled-rows ハーネスです。rows は useState で保持し、onRowsChange → setRows の
//   標準パターン(受け取った配列参照をそのまま rows へ戻す)で繋ぎます。
function UndoRedoHarness({
  gridRef,
  readOnly = false,
  enableUndoRedo = true,
  undoHistoryLimit,
  onUndoRedoStateChange,
}: {
  gridRef: Ref<SpreadsheetGridHandle<Row>>;
  readOnly?: boolean;
  enableUndoRedo?: boolean;
  undoHistoryLimit?: number;
  onUndoRedoStateChange?: (state: UndoRedoState) => void;
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  useEffect(() => {
    currentRows = rows;
  }, [rows]);
  useEffect(() => {
    externalSetRows = setRows;
  }, []);
  return (
    <SpreadsheetGrid
      ref={gridRef}
      columns={columns}
      rows={rows}
      onRowsChange={setRows}
      readOnly={readOnly}
      enableUndoRedo={enableUndoRedo}
      undoHistoryLimit={undoHistoryLimit}
      onUndoRedoStateChange={onUndoRedoStateChange}
    />
  );
}

// grid root(keyboard / paste ハンドラの配線先)を引きます。
const getShell = (container: HTMLElement): HTMLElement => {
  const shell = container.querySelector<HTMLElement>('.ssg-shell');
  if (!shell) {
    throw new Error('ssg-shell が見つかりません');
  }
  return shell;
};

// activeCell を設定してから TSV テキストをペーストします(セル編集 commit と同じ
//   handleRowsChange 集約点を通る、テスト駆動しやすい編集経路)。
const pasteIntoCell = (
  container: HTMLElement,
  gridRef: RefObject<SpreadsheetGridHandle<Row> | null>,
  cell: { row: number; col: number },
  text: string,
) => {
  act(() => {
    gridRef.current?.setActiveCell(cell);
  });
  fireEvent.paste(getShell(container), {
    clipboardData: { getData: () => text },
  });
};

describe('SpreadsheetGrid undo/redo(結合)', () => {
  it('ペースト → Ctrl+Z で変更前 rows(参照そのもの)へ戻り、Ctrl+Shift+Z / Ctrl+Y でやり直せる', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<UndoRedoHarness gridRef={ref} />);
    const shell = getShell(container);

    expect(ref.current?.canUndo()).toBe(false);
    expect(ref.current?.canRedo()).toBe(false);

    pasteIntoCell(container, ref, { row: 0, col: 1 }, 'EDITED');
    expect(currentRows[0].name).toBe('EDITED');
    expect(ref.current?.canUndo()).toBe(true);
    expect(ref.current?.canRedo()).toBe(false);

    // undo: 変更前スナップショット(初期 rows の参照そのもの)へ戻ります。
    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    expect(currentRows).toBe(initialRows);
    expect(ref.current?.canUndo()).toBe(false);
    expect(ref.current?.canRedo()).toBe(true);

    // redo(Ctrl+Shift+Z): 編集後の rows へ戻ります。
    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(currentRows[0].name).toBe('EDITED');
    expect(ref.current?.canRedo()).toBe(false);

    // Ctrl+Y でも redo できます(undo してから)。
    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    expect(currentRows).toBe(initialRows);
    fireEvent.keyDown(shell, { key: 'y', ctrlKey: true });
    expect(currentRows[0].name).toBe('EDITED');
  });

  it('ハンドルの undo() / redo() / clearUndoHistory() でも操作できる', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<UndoRedoHarness gridRef={ref} />);

    pasteIntoCell(container, ref, { row: 1, col: 1 }, 'HANDLE');
    expect(currentRows[1].name).toBe('HANDLE');

    act(() => {
      ref.current?.undo();
    });
    expect(currentRows).toBe(initialRows);
    expect(ref.current?.canRedo()).toBe(true);

    act(() => {
      ref.current?.redo();
    });
    expect(currentRows[1].name).toBe('HANDLE');

    // clearUndoHistory は rows を変えずに履歴だけ破棄します。
    act(() => {
      ref.current?.clearUndoHistory();
    });
    expect(currentRows[1].name).toBe('HANDLE');
    expect(ref.current?.canUndo()).toBe(false);
    expect(ref.current?.canRedo()).toBe(false);
  });

  it('undo 後に新しい編集が入ると redo 系譜が破棄される', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<UndoRedoHarness gridRef={ref} />);
    const shell = getShell(container);

    pasteIntoCell(container, ref, { row: 0, col: 1 }, 'FIRST');
    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    expect(ref.current?.canRedo()).toBe(true);

    pasteIntoCell(container, ref, { row: 2, col: 1 }, 'SECOND');
    expect(ref.current?.canRedo()).toBe(false);
    expect(ref.current?.canUndo()).toBe(true);
    expect(currentRows[2].name).toBe('SECOND');
  });

  it('外部からの rows 差し替え(grid 起点でない変更)で履歴が自動破棄される', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<UndoRedoHarness gridRef={ref} />);
    const shell = getShell(container);

    pasteIntoCell(container, ref, { row: 0, col: 1 }, 'EDITED');
    expect(ref.current?.canUndo()).toBe(true);

    // 親が直接 rows を差し替えます(行の追加など grid を経由しない変更)。
    const externalRows: Row[] = [
      ...currentRows,
      { id: 4, name: 'delta', qty: 40 },
    ];
    act(() => {
      externalSetRows(externalRows);
    });
    expect(ref.current?.canUndo()).toBe(false);
    expect(ref.current?.canRedo()).toBe(false);

    // 破棄後の Ctrl+Z は no-op で、外部変更後の rows を保ちます。
    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    expect(currentRows).toBe(externalRows);
  });

  it('readOnly のときは履歴を積まず、Ctrl+Z も no-op', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<UndoRedoHarness gridRef={ref} readOnly />);
    const shell = getShell(container);

    // readOnly ではペースト自体が no-op で、onRowsChange も呼ばれません(参照ごと不変)。
    pasteIntoCell(container, ref, { row: 0, col: 1 }, 'BLOCKED');
    expect(currentRows).toBe(initialRows);
    expect(ref.current?.canUndo()).toBe(false);

    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    expect(currentRows[0].name).toBe('alpha');
  });

  it('enableUndoRedo=false のときは履歴を積まず、Ctrl+Z しても編集後の値を保つ', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <UndoRedoHarness gridRef={ref} enableUndoRedo={false} />,
    );
    const shell = getShell(container);

    pasteIntoCell(container, ref, { row: 0, col: 1 }, 'EDITED');
    expect(currentRows[0].name).toBe('EDITED');
    expect(ref.current?.canUndo()).toBe(false);

    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    expect(currentRows[0].name).toBe('EDITED');
  });

  it('Delete で選択範囲、Backspace でアクティブセルの値をクリアでき、undo で戻る', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<UndoRedoHarness gridRef={ref} />);
    const shell = getShell(container);

    // 範囲選択(name / qty 列 × 先頭 2 行)を Delete でクリアします(1 undo ステップ)。
    act(() => {
      ref.current?.selectRange({
        start: { row: 0, col: 1 },
        end: { row: 1, col: 2 },
      });
    });
    fireEvent.keyDown(shell, { key: 'Delete' });
    expect(currentRows[0]).toEqual({ id: 1, name: '', qty: '' });
    expect(currentRows[1]).toEqual({ id: 2, name: '', qty: '' });
    expect(currentRows[2]).toBe(initialRows[2]);

    // クリア値のままの再 Delete は no-op(履歴に積まれない)。
    const afterClear = currentRows;
    fireEvent.keyDown(shell, { key: 'Delete' });
    expect(currentRows).toBe(afterClear);

    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    expect(currentRows).toBe(initialRows);
    expect(ref.current?.canUndo()).toBe(false);

    // 選択なし + アクティブセルのみの Backspace は単一セルをクリアします。
    act(() => {
      ref.current?.clearSelection();
      ref.current?.setActiveCell({ row: 2, col: 1 });
    });
    fireEvent.keyDown(shell, { key: 'Backspace' });
    expect(currentRows[2]).toEqual({ id: 3, name: '', qty: 30 });
    expect(currentRows[0]).toBe(initialRows[0]);
  });

  it('readOnly では Delete によるクリアも no-op', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<UndoRedoHarness gridRef={ref} readOnly />);
    const shell = getShell(container);

    act(() => {
      ref.current?.selectRange({
        start: { row: 0, col: 0 },
        end: { row: 2, col: 2 },
      });
    });
    fireEvent.keyDown(shell, { key: 'Delete' });
    expect(currentRows).toBe(initialRows);
  });

  it('onUndoRedoStateChange は可否が変化したときだけ発火する', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const spy = vi.fn();
    const { container } = render(
      <UndoRedoHarness gridRef={ref} onUndoRedoStateChange={spy} />,
    );
    const shell = getShell(container);

    // 初回マウントでは発火しません。
    expect(spy).not.toHaveBeenCalled();

    pasteIntoCell(container, ref, { row: 0, col: 1 }, 'A');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith({ canUndo: true, canRedo: false });

    // 2 回目の編集では可否が変わらないため再発火しません。
    pasteIntoCell(container, ref, { row: 1, col: 1 }, 'B');
    expect(spy).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    expect(spy).toHaveBeenLastCalledWith({ canUndo: true, canRedo: true });
    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    expect(spy).toHaveBeenLastCalledWith({ canUndo: false, canRedo: true });
    fireEvent.keyDown(shell, { key: 'y', ctrlKey: true });
    expect(spy).toHaveBeenLastCalledWith({ canUndo: true, canRedo: true });

    // 履歴破棄(外部差し替え)で両方 false へ。
    act(() => {
      externalSetRows([{ id: 9, name: 'ext', qty: 0 }]);
    });
    expect(spy).toHaveBeenLastCalledWith({ canUndo: false, canRedo: false });
  });

  it('undo / redo で編集時のアクティブセルとセレクションが復元される', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<UndoRedoHarness gridRef={ref} />);
    const shell = getShell(container);

    // (1,1) で編集(ペースト)→ 別セル (2,2) へ移動 → undo で (1,1) に戻る。
    pasteIntoCell(container, ref, { row: 1, col: 1 }, 'EDITED');
    act(() => {
      ref.current?.selectCell(2, 2);
    });
    expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: 2 });

    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    expect(currentRows).toBe(initialRows);
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 1 });

    // redo は undo 時点の位置(= (2,2))へ戻します。
    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(currentRows[1].name).toBe('EDITED');
    expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: 2 });

    // 範囲選択でのクリア → undo で範囲選択ごと復元されることも確認します。
    act(() => {
      ref.current?.selectRange({
        start: { row: 0, col: 1 },
        end: { row: 1, col: 2 },
      });
    });
    fireEvent.keyDown(shell, { key: 'Delete' });
    act(() => {
      ref.current?.selectCell(0, 0);
    });
    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    expect(ref.current?.getSelection()).toEqual({
      type: 'cell',
      range: { start: { row: 0, col: 1 }, end: { row: 1, col: 2 } },
    });
    expect(ref.current?.getActiveCell()).toEqual({ row: 0, col: 1 });
  });

  it('undo / redo 後に復元先セルへのスクロール(scrollToCell 相当)が rAF 後に走る', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<UndoRedoHarness gridRef={ref} />);
    const shell = getShell(container);

    pasteIntoCell(container, ref, { row: 1, col: 1 }, 'EDITED');
    act(() => {
      ref.current?.selectCell(2, 2);
    });

    // スクロールコンテナの scrollTo を監視します(グローバルスタブとは別にインスタンスへ直付け)。
    const scroller = container.querySelector<HTMLElement>(
      '.ssg-scroll-container',
    );
    if (!scroller) {
      throw new Error('ssg-scroll-container が見つかりません');
    }
    const scrollSpy = vi.fn();
    scroller.scrollTo = scrollSpy as unknown as HTMLElement['scrollTo'];

    // 復元スクロールは rAF で 1 フレーム遅延して実行されます。加えて既存の
    //   「activeCell 可視化 effect」(useGridViewportSync)も activeCell の復元に反応して
    //   同期発火し得るため、回数は固定せず「undo / redo それぞれで発火が増えること」を
    //   検証します(タイミング・重複非依存)。
    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    await act(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null)),
      );
    });
    expect(scrollSpy).toHaveBeenCalled();
    const callsAfterUndo = scrollSpy.mock.calls.length;

    // redo でも同様に追従します。
    fireEvent.keyDown(shell, { key: 'y', ctrlKey: true });
    await act(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null)),
      );
    });
    expect(scrollSpy.mock.calls.length).toBeGreaterThan(callsAfterUndo);
  });

  it('undoHistoryLimit を超えた履歴は最古から破棄される', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <UndoRedoHarness gridRef={ref} undoHistoryLimit={2} />,
    );
    const shell = getShell(container);

    pasteIntoCell(container, ref, { row: 0, col: 1 }, 'A');
    pasteIntoCell(container, ref, { row: 0, col: 1 }, 'B');
    pasteIntoCell(container, ref, { row: 0, col: 1 }, 'C');
    expect(currentRows[0].name).toBe('C');

    // limit=2 のため、遡れるのは 2 ステップ(C → B → A)まで。初期値 alpha には戻れません。
    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    expect(currentRows[0].name).toBe('B');
    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    expect(currentRows[0].name).toBe('A');
    expect(ref.current?.canUndo()).toBe(false);
    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true });
    expect(currentRows[0].name).toBe('A');
  });
});