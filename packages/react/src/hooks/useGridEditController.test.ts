// 追加(非依存化 ③-6): useGridEditController の特性テストです(抽出前に現状の挙動を固定)。
//   rAF は同期実行に差し替え、開始 / 確定(clientSide・serverSide・reject)/ 取消 / ガードを検証します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useGridEditController } from './useGridEditController';
import { createInitialGridUiState } from '@ishibashi0112/spreadsheet-grid-core/model/gridReducer';
import type { GridUiAction } from '@ishibashi0112/spreadsheet-grid-core/model/gridActions';
import type { GridColumn, GridUiState, RowModel } from '../model/gridTypes';

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 100 },
  {
    key: 'qty',
    title: '数量',
    width: 80,
    editor: { type: 'number' },
    validate: ({ value }) => (typeof value === 'number' && value < 0 ? '負の数は不可' : true),
    validationMode: 'reject',
  },
];

const rows: Row[] = [
  { id: 1, name: 'a', qty: 1 },
  { id: 2, name: 'b', qty: 2 },
];

const rowModel: RowModel<Row> = {
  getRow: (i) => rows[i],
  getRowCount: () => rows.length,
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id ?? i,
};

let rafCallbacks: FrameRequestCallback[] = [];
beforeEach(() => {
  rafCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});
const flushRaf = () => {
  const pending = rafCallbacks;
  rafCallbacks = [];
  for (const cb of pending) cb(0);
};

const setup = (editingCell: { row: number; col: number } | null, serverSide = false) => {
  const uiState: GridUiState = { ...createInitialGridUiState(columns), editingCell };
  const dispatch = vi.fn<(a: GridUiAction) => void>();
  const onRowsChange = vi.fn();
  const applyServerSideCellEdits = vi.fn(() => 1);
  const setEditorInitialValue = vi.fn();
  const root = document.createElement('div');
  root.tabIndex = 0;
  document.body.appendChild(root);
  const gridRootRef = { current: root };
  const editorActionGuardRef = { current: false };
  const view = renderHook(() =>
    useGridEditController<Row>({
      uiState,
      rows,
      visibleColumns: columns,
      rowModel,
      setEditorInitialValue,
      onRowsChange,
      applyServerSideCellEdits: serverSide ? applyServerSideCellEdits : undefined,
      dispatch,
      gridRootRef,
      editorActionGuardRef,
    }),
  );
  return { ...view, dispatch, onRowsChange, applyServerSideCellEdits, setEditorInitialValue, root, editorActionGuardRef };
};

const types = (dispatch: ReturnType<typeof vi.fn<(a: GridUiAction) => void>>) =>
  dispatch.mock.calls.map(([a]) => a.type);

describe('useGridEditController(特性テスト)', () => {
  it('startEditWithValue は初期値を渡して startEdit、activateSingleCell は 3 アクション', () => {
    const t = setup(null);
    act(() => {
      t.result.current.startEditWithValue({ row: 0, col: 1 }, '5');
      t.result.current.activateSingleCell({ row: 1, col: 0 });
    });
    expect(t.setEditorInitialValue).toHaveBeenCalledWith('5');
    expect(types(t.dispatch)).toEqual(['edit/start', 'selection/start', 'selection/end', 'cell/activate']);
  });

  it('clientSide の commit: 書き込み → stopEdit → rAF でフォーカス復帰と方向移動(clamp)', () => {
    const t = setup({ row: 1, col: 1 });
    let result: unknown;
    act(() => {
      result = t.result.current.commitEdit('7', 'down');
    });
    expect(result).toEqual({ status: 'committed' });
    expect(t.onRowsChange).toHaveBeenCalledTimes(1);
    expect(t.onRowsChange.mock.calls[0][0][1]).toEqual({ id: 2, name: 'b', qty: 7 });
    expect(types(t.dispatch)).toEqual(['edit/stop']);
    expect(t.editorActionGuardRef.current).toBe(true);
    act(() => {
      flushRaf();
    });
    expect(document.activeElement).toBe(t.root);
    // 最終行から down → 最終行に clamp。
    expect(types(t.dispatch)).toEqual(['edit/stop', 'selection/start', 'selection/end', 'cell/activate']);
    expect(t.dispatch.mock.calls[3][0]).toMatchObject({ cell: { row: 1, col: 1 } });
    expect(t.editorActionGuardRef.current).toBe(false);
  });

  it('reject 列の検証 NG は rejected を返し何も書かない、serverSide は applyServerSideCellEdits へ', () => {
    const t = setup({ row: 0, col: 1 });
    let result: unknown;
    act(() => {
      result = t.result.current.commitEdit('-3');
    });
    expect(result).toEqual({ status: 'rejected', message: '負の数は不可' });
    expect(t.onRowsChange).not.toHaveBeenCalled();
    expect(t.dispatch).not.toHaveBeenCalled();

    const s = setup({ row: 0, col: 1 }, true);
    act(() => {
      result = s.result.current.commitEdit('9');
    });
    expect(result).toEqual({ status: 'committed' });
    expect(s.applyServerSideCellEdits).toHaveBeenCalledWith([
      expect.objectContaining({ viewIndex: 0, value: 9 }),
    ]);
    expect(s.onRowsChange).not.toHaveBeenCalled();
  });

  it('編集中でない / ガード中は noop、cancelEdit は stopEdit + rAF フォーカス復帰', () => {
    const idle = setup(null);
    expect(idle.result.current.commitEdit('x')).toEqual({ status: 'noop' });

    const t = setup({ row: 0, col: 0 });
    t.editorActionGuardRef.current = true;
    expect(t.result.current.commitEdit('x')).toEqual({ status: 'noop' });
    act(() => {
      t.result.current.cancelEdit();
    });
    expect(t.dispatch).not.toHaveBeenCalled();
    t.editorActionGuardRef.current = false;
    act(() => {
      t.result.current.cancelEdit();
    });
    expect(types(t.dispatch)).toEqual(['edit/stop']);
    expect(t.editorActionGuardRef.current).toBe(true);
    act(() => {
      flushRaf();
    });
    expect(document.activeElement).toBe(t.root);
    expect(t.editorActionGuardRef.current).toBe(false);
  });
});