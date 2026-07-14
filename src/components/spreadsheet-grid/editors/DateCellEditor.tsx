// 追加(editor: date): 日付エディタです(ネイティブ <input type="date">、自作カレンダーなし)。
//   ドラフトは 'YYYY-MM-DD' | ''。初期値は CellEditorLayer が toDateInputValue で正規化して
//   渡します(印字キー開始の initialText は無視し、常に現セル値から開始)。
//   Tab はグリッド流(commit + 移動)を優先します(ピッカー内セグメント移動は Left/Right 矢印。
//   API_REFERENCE に注記)。showPicker() はユーザージェスチャ制約があるため呼びません。
import { useEffect, useRef, useState } from 'react';
import type { EditorCommitDirection } from '../model/gridTypes';
import { createEditorKeyDownHandler } from './editorKeyBindings';

type DateCellEditorProps = {
  // 'YYYY-MM-DD' | ''(正規化済み)。
  initialValue: string;
  onCommit: (value: unknown, direction?: EditorCommitDirection) => void;
  onCancel: () => void;
  align?: 'left' | 'center' | 'right';
};

export function DateCellEditor({
  initialValue,
  onCommit,
  onCancel,
  align,
}: DateCellEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftValue, setDraftValue] = useState(initialValue);

  // マウント時(= 編集セッション開始時)に自動フォーカスします。
  //   ※ type="date" は setSelectionRange 非対応(例外を投げるブラウザあり)のため focus のみ。
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      ref={inputRef}
      type="date"
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

export default DateCellEditor;