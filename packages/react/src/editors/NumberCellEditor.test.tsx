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
  initialValue = '10',
) => {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const { container } = render(
    <CellEditorLayer
      rect={rect}
      headerHeight={40}
      leadingWidth={56}
      initialValue={initialValue}
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

  // 追加(数値の打ち始め): 「-」「+」「.」で始めた編集は type="text" で開く(type="number" は "-" を空にしてマイナスが落ちる)。
  it('数値の書き始め("-")で開くと type=text + inputMode=decimal で、打った文字が残る', () => {
    const { input } = renderNumberEditor(undefined, '-');
    expect(input.type).toBe('text');
    expect(input.inputMode).toBe('decimal');
    expect(input.value).toBe('-');
    expect(input.getAttribute('min')).toBeNull();
    expect(input.getAttribute('step')).toBeNull();
    expect(input.selectionStart).toBe(1);
  });

  it('text で開いたときは打った文字列のまま commit し(列のパーサが数値に直す)、書き始めのままなら空文字', () => {
    const { onCommit, input } = renderNumberEditor(undefined, '-');
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenLastCalledWith('-5', 'down');

    fireEvent.change(input, { target: { value: '－１，２３４．５' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(onCommit).toHaveBeenLastCalledWith('－１，２３４．５', 'right');

    // 読めない文字列は黙って消さず、そのまま渡す(検査があれば印 / reject、無ければ貼り付けと同じく文字列のまま)。
    fireEvent.change(input, { target: { value: '-abc' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenLastCalledWith('-abc');

    for (const prefix of ['-', ' - ', 'ー', '+.']) {
      fireEvent.change(input, { target: { value: prefix } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onCommit).toHaveBeenLastCalledWith('', 'down');
    }
  });

  it('"." で開いて ".5" と打つと ".5" で commit する', () => {
    const { onCommit, input } = renderNumberEditor(undefined, '.');
    expect(input.type).toBe('text');
    fireEvent.change(input, { target: { value: '.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenLastCalledWith('.5', 'down');
  });

  it('数字で始めたときは従来どおり type=number(ドラフト文字列をそのまま commit)', () => {
    const { onCommit, input } = renderNumberEditor(undefined, '5');
    expect(input.type).toBe('number');
    fireEvent.change(input, { target: { value: '56' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenLastCalledWith('56', 'down');
  });
});