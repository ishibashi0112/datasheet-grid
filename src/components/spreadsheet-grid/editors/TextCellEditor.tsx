// 追加(editor 基盤): 既定の text エディタです(CellEditorLayer から移設)。
//   ドラフト値はローカル state で持ち、タイピングで親(3 ペイン全体)を再レンダーしません
//   (11-B6)。新しい編集セッションは CellEditorLayer が key 再マウントで開始するため、
//   初期値は useState の初期化だけで安全に反映されます。
// 変更(validation): reject 列の検証 NG(commit が rejected)ではエラーバブルを表示して
//   編集を継続します。blur の rejected は cancel へフォールバックします(フォーカスが
//   去ったのに開き続ける事故の防止)。
import { useEffect, useRef, useState } from 'react';
import type {
  EditorCommitDirection,
  EditorCommitResult,
} from '../model/gridTypes';
import { createEditorKeyDownHandler } from './editorKeyBindings';
import { CellEditorErrorBubble } from './CellEditorErrorBubble';
import { cx } from '../logic/cx';

type TextCellEditorProps = {
  initialValue: string;
  onCommit: (
    value: unknown,
    direction?: EditorCommitDirection,
  ) => EditorCommitResult | void;
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    <>
      <input
        ref={inputRef}
        type="text"
        value={draftValue}
        onChange={(event) => {
          setDraftValue(event.target.value);
          // 再入力でエラー表示を解除します。
          setErrorMessage(null);
        }}
        onKeyDown={createEditorKeyDownHandler({
          value: draftValue,
          onCommit,
          onCancel,
          onRejected: setErrorMessage,
        })}
        onBlur={() => {
          const result = onCommit(draftValue);
          if (result && result.status === 'rejected') {
            onCancel();
          }
        }}
        className={cx(
          'ssg-cell-editor-input',
          errorMessage !== null && 'ssg-cell-editor-input--invalid',
        )}
        style={align ? { textAlign: align } : undefined}
      />
      {errorMessage !== null ? (
        <CellEditorErrorBubble message={errorMessage} />
      ) : null}
    </>
  );
}

export default TextCellEditor;