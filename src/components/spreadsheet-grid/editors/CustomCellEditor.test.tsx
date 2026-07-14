// CustomCellEditor(custom エディタ)の単体テストです。CellEditorLayer の種別ディスパッチ経由で
//   描画し、render(ctx) へ渡るコンテキストと commit / cancel の配線を検証します。
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { CellEditorLayer } from '../CellEditorLayer';
import type { CellEditorContext } from '../model/gridTypes';

afterEach(() => {
  cleanup();
});

type Row = { id: number; qty: number };

const rect = { left: 0, top: 0, width: 120, height: 32 };
const column = { key: 'qty', width: 100 };

const renderCustomEditor = () => {
  const onCommit = vi.fn(() => ({ status: 'committed' }) as const);
  const onCancel = vi.fn();
  const contexts: CellEditorContext<Row>[] = [];
  const { container } = render(
    <CellEditorLayer<Row>
      rect={rect}
      headerHeight={40}
      leadingWidth={56}
      initialValue="5"
      editor={{
        type: 'custom',
        render: (ctx) => {
          contexts.push(ctx);
          return (
            <div className="my-custom-editor">
              <button
                type="button"
                className="my-commit"
                onClick={() => ctx.commit(123, 'down')}
              >
                確定
              </button>
              <button
                type="button"
                className="my-cancel"
                onClick={() => ctx.cancel()}
              >
                取消
              </button>
            </div>
          );
        },
      }}
      editorSession={{
        row: { id: 1, qty: 10 },
        rowIndex: 3,
        colIndex: 2,
        column,
        value: 10,
      }}
      align="right"
      onCommit={onCommit}
      onCancel={onCancel}
    />,
  );
  return { onCommit, onCancel, contexts, container };
};

describe('CustomCellEditor', () => {
  it('render(ctx) がセッション情報(行 / 生値 / initialText / 列 / align)付きで呼ばれる', () => {
    const { contexts, container } = renderCustomEditor();
    expect(container.querySelector('.my-custom-editor')).not.toBeNull();
    const ctx = contexts[0];
    expect(ctx.row).toEqual({ id: 1, qty: 10 });
    expect(ctx.rowIndex).toBe(3);
    expect(ctx.colIndex).toBe(2);
    expect(ctx.column).toBe(column);
    expect(ctx.value).toBe(10);
    expect(ctx.initialText).toBe('5');
    expect(ctx.align).toBe('right');
  });

  it('ctx.commit(123) は非 string のドメイン値をそのまま onCommit へ渡す(パースのバイパス)', () => {
    const { onCommit, container } = renderCustomEditor();
    fireEvent.click(container.querySelector('.my-commit')!);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(123, 'down');
  });

  it('ctx.commit は commit 結果を返し、ctx.cancel は onCancel を呼ぶ', () => {
    const { onCancel, contexts, container } = renderCustomEditor();
    const result = contexts[0].commit('text');
    expect(result).toEqual({ status: 'committed' });

    fireEvent.click(container.querySelector('.my-cancel')!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});