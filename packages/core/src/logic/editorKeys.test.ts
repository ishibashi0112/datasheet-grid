// 追加(Solid 版 段階 0-4): 組み込みエディタのキーの割り当て(logic/editorKeys)のテストです。React 版のエディタのテスト
//   (text / number / date / select)が実際の入力で広く見ているので、こちらは分かれ目を構造的なイベントで固定します。
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { handleEditorKeyDown, resolveEnterDirection, type EditorKeyEventLike } from './editorKeys';

const key = (name: string, extra: Partial<EditorKeyEventLike> = {}): EditorKeyEventLike => ({
  key: name,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  isComposing: false,
  keyCode: 0,
  currentTarget: null,
  preventDefault: vi.fn(),
  ...extra,
});

const setup = () => ({ onCommit: vi.fn(), onCancel: vi.fn(), onRejected: vi.fn() });

describe('editorKeys', () => {
  it("Enter は editorEnterMove の向きで確定('none' は向きなし)、Tab / Shift+Tab は左右、Escape はやめる", () => {
    const t = setup();
    handleEditorKeyDown(key('Enter'), { value: 'a', ...t });
    expect(t.onCommit).toHaveBeenLastCalledWith('a', 'down');
    handleEditorKeyDown(key('Enter'), { value: 'a', ...t, enterMove: 'right' });
    expect(t.onCommit).toHaveBeenLastCalledWith('a', 'right');
    handleEditorKeyDown(key('Enter'), { value: 'a', ...t, enterMove: 'none' });
    expect(t.onCommit).toHaveBeenLastCalledWith('a', undefined);
    handleEditorKeyDown(key('Tab'), { value: 'b', ...t });
    expect(t.onCommit).toHaveBeenLastCalledWith('b', 'right');
    handleEditorKeyDown(key('Tab', { shiftKey: true }), { value: 'b', ...t });
    expect(t.onCommit).toHaveBeenLastCalledWith('b', 'left');
    const escape = key('Escape');
    handleEditorKeyDown(escape, { value: 'b', ...t });
    expect(t.onCancel).toHaveBeenCalledTimes(1);
    expect(escape.preventDefault).toHaveBeenCalled();
    expect(resolveEnterDirection(undefined)).toBe('down');
  });

  it('IME の変換中(isComposing / Safari の keyCode 229)は何もしない', () => {
    const t = setup();
    handleEditorKeyDown(key('Enter', { isComposing: true }), { value: 'a', ...t });
    handleEditorKeyDown(key('Enter', { keyCode: 229 }), { value: 'a', ...t });
    handleEditorKeyDown(key('Escape', { isComposing: true }), { value: 'a', ...t });
    expect(t.onCommit).not.toHaveBeenCalled();
    expect(t.onCancel).not.toHaveBeenCalled();
  });

  it('PageUp / PageDown はいつも、Home / End は blockHomeEnd のときだけスクロールを止める(編集は続く)', () => {
    const t = setup();
    const pageDown = key('PageDown');
    handleEditorKeyDown(pageDown, { value: 'a', ...t });
    expect(pageDown.preventDefault).toHaveBeenCalled();
    const home = key('Home');
    handleEditorKeyDown(home, { value: 'a', ...t });
    expect(home.preventDefault).not.toHaveBeenCalled();
    const end = key('End');
    handleEditorKeyDown(end, { value: 'a', ...t, blockHomeEnd: true });
    expect(end.preventDefault).toHaveBeenCalled();
    expect(t.onCommit).not.toHaveBeenCalled();
  });

  it('確定が rejected なら onRejected にメッセージ', () => {
    const t = setup();
    t.onCommit.mockReturnValue({ status: 'rejected', message: '数値を入れてください' });
    handleEditorKeyDown(key('Enter'), { value: 'x', ...t });
    expect(t.onRejected).toHaveBeenCalledWith('数値を入れてください');
  });

  it('複数行: commit は Alt+Enter で改行を入れ、newline は素の Enter を textarea に任せ Ctrl+Enter で確定', () => {
    const t = setup();
    const textarea = document.createElement('textarea');
    const onInsertNewline = vi.fn();
    const altEnter = key('Enter', { altKey: true, currentTarget: textarea });
    handleEditorKeyDown(altEnter, { value: 'a', ...t, multilineEnter: 'commit', onInsertNewline });
    expect(altEnter.preventDefault).toHaveBeenCalled();
    expect(onInsertNewline).toHaveBeenCalledWith(textarea);
    handleEditorKeyDown(key('Enter', { currentTarget: textarea }), { value: 'a', ...t, multilineEnter: 'commit' });
    expect(t.onCommit).toHaveBeenLastCalledWith('a', 'down');

    const plain = key('Enter', { currentTarget: textarea });
    handleEditorKeyDown(plain, { value: 'b', ...t, multilineEnter: 'newline', onInsertNewline });
    expect(plain.preventDefault).not.toHaveBeenCalled();
    expect(t.onCommit).toHaveBeenCalledTimes(1);
    handleEditorKeyDown(key('Enter', { ctrlKey: true, currentTarget: textarea }), {
      value: 'b',
      ...t,
      multilineEnter: 'newline',
    });
    expect(t.onCommit).toHaveBeenLastCalledWith('b', 'down');
  });
});