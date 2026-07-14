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

const renderDateEditor = (value: unknown = '2026-07-14') => {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const { container } = render(
    <CellEditorLayer<Row>
      rect={rect}
      headerHeight={40}
      leadingWidth={56}
      initialValue={String(value ?? '')}
      editor={{ type: 'date' }}
      editorSession={{ row: { orderedAt: value }, rowIndex: 0, colIndex: 0, value }}
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
});