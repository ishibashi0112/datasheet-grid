// 追加(editor: number): 数値エディタです(<input type="number">)。
//   min / max / step はネイティブ属性へ反映し、ArrowUp/Down のステップ・不正文字の抑止を
//   ブラウザに任せます。commit 値はドラフト文字列のまま渡し、書き込み側の共通規則
//   (logic/editorValues.ts の number 既定パーサ)で数値 / null へ変換します。
import { useEffect, useRef, useState } from 'react';
import type { EditorCommitDirection } from '../model/gridTypes';
import { createEditorKeyDownHandler } from './editorKeyBindings';

type NumberCellEditorProps = {
  initialValue: string;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: unknown, direction?: EditorCommitDirection) => void;
  onCancel: () => void;
  align?: 'left' | 'center' | 'right';
};

export function NumberCellEditor({
  initialValue,
  min,
  max,
  step,
  onCommit,
  onCancel,
  align,
}: NumberCellEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftValue, setDraftValue] = useState(initialValue);

  // マウント時(= 編集セッション開始時)に自動フォーカスします。
  //   ※ type="number" は setSelectionRange 非対応(例外を投げるブラウザあり)のため focus のみ。
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      ref={inputRef}
      type="number"
      value={draftValue}
      min={min}
      max={max}
      step={step}
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

export default NumberCellEditor;