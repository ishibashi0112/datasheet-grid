// エディタの reject 継続(validation)の単体テストです。onCommit が rejected を返したとき、
//   エディタがエラーバブルを表示して編集を継続すること・blur では cancel へフォールバック
//   することを、CellEditorLayer 経由で検証します(text / number / select 共通規則)。
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { CellEditorLayer } from '../CellEditorLayer';
import type { EditorCommitResult } from '../model/gridTypes';

afterEach(() => {
  cleanup();
});

const rect = { left: 0, top: 0, width: 120, height: 32 };

const rejected: EditorCommitResult = {
  status: 'rejected',
  message: '数値を入力してください',
};
const committed: EditorCommitResult = { status: 'committed' };

const renderTextEditor = (results: EditorCommitResult[]) => {
  let callCount = 0;
  const onCommit = vi.fn(() => results[Math.min(callCount++, results.length - 1)]);
  const onCancel = vi.fn();
  const { container } = render(
    <CellEditorLayer
      rect={rect}
      headerHeight={40}
      leadingWidth={56}
      initialValue="abc"
      onCommit={onCommit}
      onCancel={onCancel}
    />,
  );
  const input = container.querySelector<HTMLInputElement>(
    '.ssg-cell-editor-input',
  );
  if (!input) {
    throw new Error('ssg-cell-editor-input が見つかりません');
  }
  return { onCommit, onCancel, input, container };
};

describe('エディタの reject 継続(validation)', () => {
  it('Enter の rejected でエラーバブルを表示し、input は残る(編集継続)', () => {
    const { onCommit, onCancel, input, container } = renderTextEditor([rejected]);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('abc', 'down');
    expect(onCancel).not.toHaveBeenCalled();

    // エディタは閉じず、エラーバブルとinvalid 枠が表示される。
    expect(container.querySelector('.ssg-cell-editor-input')).not.toBeNull();
    const bubble = container.querySelector('.ssg-cell-editor-error');
    expect(bubble?.textContent).toBe('数値を入力してください');
    expect(
      input.classList.contains('ssg-cell-editor-input--invalid'),
    ).toBe(true);
  });

  it('再入力でエラー表示が消え、有効値の commit で通る', () => {
    const { onCommit, input, container } = renderTextEditor([
      rejected,
      committed,
    ]);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(container.querySelector('.ssg-cell-editor-error')).not.toBeNull();

    fireEvent.change(input, { target: { value: '42' } });
    expect(container.querySelector('.ssg-cell-editor-error')).toBeNull();
    expect(
      input.classList.contains('ssg-cell-editor-input--invalid'),
    ).toBe(false);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenLastCalledWith('42', 'down');
  });

  it('blur の rejected は cancel へフォールバックする(開きっぱなし事故の防止)', () => {
    const { onCancel, input } = renderTextEditor([rejected]);
    fireEvent.blur(input);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('number エディタでも同じ規則で動く', () => {
    const onCommit = vi.fn(() => rejected);
    const onCancel = vi.fn();
    const { container } = render(
      <CellEditorLayer
        rect={rect}
        headerHeight={40}
        leadingWidth={56}
        initialValue="999"
        editor={{ type: 'number' }}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    const input = container.querySelector<HTMLInputElement>(
      '.ssg-cell-editor-input',
    )!;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(container.querySelector('.ssg-cell-editor-error')).not.toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('select エディタは rejected でバブル表示し、ハイライト移動で解除する', () => {
    const onCommit = vi.fn(() => rejected);
    const onCancel = vi.fn();
    const { container } = render(
      <CellEditorLayer<{ id: number }>
        rect={rect}
        headerHeight={40}
        leadingWidth={56}
        initialValue="a"
        editor={{
          type: 'select',
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        }}
        editorSession={{
          row: { id: 1 },
          rowIndex: 0,
          sourceRowIndex: 0,
          rowKey: 0,
          colIndex: 0,
          column: { key: 'id', width: 80 },
          value: 'a',
        }}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    const input = container.querySelector<HTMLInputElement>(
      '.ssg-cell-editor-input',
    )!;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(container.querySelector('.ssg-cell-editor-error')).not.toBeNull();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(container.querySelector('.ssg-cell-editor-error')).toBeNull();
  });
});