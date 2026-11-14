// DateCellEditor(date エディタ)の単体テストです。CellEditorLayer の種別ディスパッチ経由で
//   描画し、初期値の正規化・確定 / キャンセルの配線を検証します。
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { CellEditorLayer } from '../CellEditorLayer';

afterEach(() => {
  cleanup();
});

type Row = { orderedAt: unknown };

const rect = { left: 0, top: 0, width: 140, height: 32 };

const renderDateEditor = (value: unknown = '2026-07-14', initialValue?: string) => {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const { container } = render(
    <CellEditorLayer<Row>
      rect={rect}
      headerHeight={40}
      leadingWidth={56}
      // F2 などで開くときの初期値はセル値の文字列(グリッドと同じ)。
      initialValue={initialValue ?? String(value ?? '')}
      editor={{ type: 'date' }}
      editorSession={{
        row: { orderedAt: value },
        rowIndex: 0,
        sourceRowIndex: 0,
        rowKey: 0,
        colIndex: 0,
        column: { key: 'orderedAt', width: 140 },
        value,
      }}
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
  return { onCommit, onCancel, input };
};

describe('DateCellEditor', () => {
  it('type=date で描画され、セル生値(Date インスタンス)が YYYY-MM-DD へ正規化される', () => {
    const { input } = renderDateEditor(new Date(2026, 6, 14));
    expect(input.type).toBe('date');
    expect(input.value).toBe('2026-07-14');
  });

  it('解釈できない現在値は空(未入力)から開始する', () => {
    const { input } = renderDateEditor('日付でない');
    expect(input.value).toBe('');
  });

  // 追加(dogfood DF-13): 日付の入力欄では PageUp / PageDown / Home / End の既定の動作(グリッドのスクロール)を止める。
  it('PageUp / PageDown / Home / End の既定の動作を止め、確定もしない', () => {
    const { onCommit, onCancel, input } = renderDateEditor();
    for (const key of ['PageUp', 'PageDown', 'Home', 'End']) {
      // fireEvent は既定の動作が止められると false を返します。
      expect(fireEvent.keyDown(input, { key })).toBe(false);
    }
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Enter でドラフト(YYYY-MM-DD)を down 方向 commit する', () => {
    const { onCommit, input } = renderDateEditor();
    fireEvent.change(input, { target: { value: '2026-12-31' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('2026-12-31', 'down');
  });

  it('空のまま Enter で空文字を commit する(null 化は書き込み側のパーサ責務)', () => {
    const { onCommit, input } = renderDateEditor(null);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('', 'down');
  });

  it('Escape で cancel し、Tab で右方向 commit する', () => {
    const { onCommit, onCancel, input } = renderDateEditor();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: 'Tab' });
    expect(onCommit).toHaveBeenCalledWith('2026-07-14', 'right');
  });

  // 追加(1.0.2 / 2026-11-09 実アプリの総点検 J-12): 文字から打ち始めたときは文字の欄で開き、確定で日付として読む。
  it('文字から打ち始めたときは type=text でその文字から開き、確定で YYYY-MM-DD へ読む', () => {
    const { onCommit, input } = renderDateEditor('2026-07-14', '2');
    expect(input.type).toBe('text');
    expect(input.value).toBe('2');
    fireEvent.change(input, { target: { value: '2025/3/15' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('2025-03-15', 'down');
  });

  it('文字の欄で日付として読めなければ確定せずメッセージを出し、フォーカスが外れたら取り消す', () => {
    const { onCommit, onCancel, input } = renderDateEditor('2026-07-14', 'a');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(document.querySelector('.ssg-cell-editor-error')?.textContent).toBe('日付で入力してください(例: 2026/3/15)');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('文字の欄を空にして確定すると空文字を commit する', () => {
    const { onCommit, input } = renderDateEditor('2026-07-14', 'x');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(onCommit).toHaveBeenCalledWith('', 'right');
  });

  it('F2 などで開いた(初期値がセル値の文字列)ときは type=date のまま(読めない値・Date の値も)', () => {
    expect(renderDateEditor('2026-07-14').input.type).toBe('date');
    cleanup();
    expect(renderDateEditor('未定').input.type).toBe('date');
    cleanup();
    expect(renderDateEditor(new Date(2026, 6, 14)).input.type).toBe('date');
  });
});