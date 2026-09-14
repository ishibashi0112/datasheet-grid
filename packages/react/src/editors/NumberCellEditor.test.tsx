// NumberCellEditor(number エディタ)の単体テストです。CellEditorLayer の種別ディスパッチ経由で
//   描画し、属性反映と確定 / キャンセルの配線を検証します(流儀は CellEditorLayer.test.tsx と同一)。
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { CellEditorLayer } from '../CellEditorLayer';
import type { GridColumnEditor } from '../model/gridTypes';

afterEach(() => {
  cleanup();
});

const rect = { left: 0, top: 0, width: 120, height: 32 };

const renderNumberEditor = (
  editor: GridColumnEditor<object> = { type: 'number', min: 0, max: 100, step: 5 },
) => {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const { container } = render(
    <CellEditorLayer
      rect={rect}
      headerHeight={40}
      leadingWidth={56}
      initialValue="10"
      editor={editor}
      onCommit={onCommit}
      onCancel={onCancel}
      align="right"
    />,
  );
  const input = container.querySelector<HTMLInputElement>(
    '.ssg-cell-editor-input',
  );
  if (!input) {
    throw new Error('ssg-cell-editor-input が見つかりません');
  }
  return { onCommit, onCancel, input };
};

describe('NumberCellEditor', () => {
  it('type=number で描画され min / max / step / align が反映される', () => {
    const { input } = renderNumberEditor();
    expect(input.type).toBe('number');
    expect(input.getAttribute('min')).toBe('0');
    expect(input.getAttribute('max')).toBe('100');
    expect(input.getAttribute('step')).toBe('5');
    expect(input.style.textAlign).toBe('right');
    expect(input.value).toBe('10');
  });

  it('Enter でドラフト文字列を down 方向 commit する(パースは書き込み側の責務)', () => {
    const { onCommit, input } = renderNumberEditor();
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('42', 'down');
  });

  it('Escape で cancel し、blur で方向なし commit する', () => {
    const { onCommit, onCancel, input } = renderNumberEditor();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('7');
  });

  it('IME 変換中(isComposing)の Enter は commit しない', () => {
    const { onCommit, input } = renderNumberEditor();
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onCommit).not.toHaveBeenCalled();
  });
});