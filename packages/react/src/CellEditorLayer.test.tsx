// CellEditorLayer(編集エディタ)のキーボード確定/キャンセルの単体テストです。
//   特に IME 変換中(isComposing)の Enter / Escape / Tab が commit / cancel を
//   巻き込まないこと(日本語入力の変換確定 Enter 対策)を検証します。
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { CellEditorLayer } from './CellEditorLayer';

afterEach(() => {
  cleanup();
});

const rect = { left: 0, top: 0, width: 120, height: 32 };

const renderEditor = () => {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const { container } = render(
    <CellEditorLayer
      rect={rect}
      headerHeight={40}
      leadingWidth={56}
      initialValue="初期値"
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

describe('CellEditorLayer キーボード操作', () => {
  it('Enter でドラフト値を down 方向 commit する', () => {
    const { onCommit, input } = renderEditor();
    fireEvent.change(input, { target: { value: '新しい値' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('新しい値', 'down');
  });

  it('Escape で cancel する', () => {
    const { onCommit, onCancel, input } = renderEditor();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Tab / Shift+Tab で右 / 左方向 commit する', () => {
    const { onCommit, input } = renderEditor();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(onCommit).toHaveBeenLastCalledWith('初期値', 'right');
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(onCommit).toHaveBeenLastCalledWith('初期値', 'left');
  });

  it('IME 変換中(isComposing)の Enter / Escape / Tab は commit / cancel しない', () => {
    const { onCommit, onCancel, input } = renderEditor();
    fireEvent.change(input, { target: { value: 'へんかんちゅう' } });

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    fireEvent.keyDown(input, { key: 'Tab', isComposing: true });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    // 変換確定後(isComposing=false)の Enter は従来どおり commit します。
    fireEvent.change(input, { target: { value: '変換中' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('変換中', 'down');
  });
});

// 追加(audit RD-7): 編集を閉じずに別のセルの編集が始まったら、前のセルのドラフトを持ち越さない。
//   編集中の rows 差し替え(同じ座標でキーだけ変わる → 同じキーで座標だけ変わる)ではドラフトを保つ。
describe('CellEditorLayer の編集セッション', () => {
  type Row = { id: number; name: string };
  const column = { key: 'name', title: '名前', width: 120 };
  const session = (rowIndex: number, rowKey: number, value: string) => ({
    row: { id: rowKey, name: value },
    rowIndex,
    sourceRowIndex: rowIndex,
    rowKey,
    colIndex: 0,
    column,
    value,
  });
  const layer = (rowIndex: number, rowKey: number, value: string) => (
    <CellEditorLayer<Row>
      rect={rect}
      headerHeight={40}
      leadingWidth={56}
      initialValue={value}
      editorSession={session(rowIndex, rowKey, value)}
      onCommit={vi.fn()}
      onCancel={vi.fn()}
    />
  );
  const inputOf = (container: HTMLElement) => container.querySelector<HTMLInputElement>('.ssg-cell-editor-input')!;

  it('閉じずに別のセルへ移ったら、そのセルの値で始め直す', () => {
    const { container, rerender } = render(layer(0, 1, 'a'));
    fireEvent.change(inputOf(container), { target: { value: 'draft-of-A' } });
    rerender(layer(2, 3, 'b'));
    expect(inputOf(container).value).toBe('b');
  });

  it('編集中の行の並び替え(キーだけ変わる → 座標だけ変わる)ではドラフトを保つ', () => {
    const { container, rerender } = render(layer(0, 1, 'a'));
    fireEvent.change(inputOf(container), { target: { value: 'draft-of-A' } });
    // 再ターゲット前の 1 レンダー: 同じ座標に別の行。
    rerender(layer(0, 9, 'z'));
    expect(inputOf(container).value).toBe('draft-of-A');
    // 再ターゲット後: 同じ行(キー 1)が別の座標へ。
    rerender(layer(3, 1, 'a'));
    expect(inputOf(container).value).toBe('draft-of-A');
  });
});