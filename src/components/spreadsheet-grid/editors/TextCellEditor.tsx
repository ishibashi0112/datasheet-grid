// 追加(editor 基盤): 既定の text エディタです(CellEditorLayer から移設)。
//   ドラフト値はローカル state で持ち、タイピングで親(3 ペイン全体)を再レンダーしません
//   (11-B6)。新しい編集セッションは CellEditorLayer が key 再マウントで開始するため、
//   初期値は useState の初期化だけで安全に反映されます。
import { useEffect, useRef, useState } from 'react';
import type { EditorCommitDirection } from '../model/gridTypes';
import { createEditorKeyDownHandler } from './editorKeyBindings';

type TextCellEditorProps = {
  initialValue: string;
  onCommit: (value: unknown, direction?: EditorCommitDirection) => void;
  onCancel: () => void;
  align?: 'left' | 'center' | 'right';
};

export function TextCellEditor({
  initialValue,
  onCommit,
  onCancel,
  align,
}: TextCellEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftValue, setDraftValue] = useState(initialValue);

  // マウント時(= 編集セッション開始時)に自動フォーカスし、末尾へキャレット移動します。
  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={draftValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onKeyDown={createEditorKeyDownHandler({
        value: draftValue,
        onCommit,
        onCancel,
      })}
      onBlur={() => onCommit(draftValue)}
      className="ssg-cell-editor-input"
      style={align ? { textAlign: align } : undefined}
    />
  );
}

export default TextCellEditor;