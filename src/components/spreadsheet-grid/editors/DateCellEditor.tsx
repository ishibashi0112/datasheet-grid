// 追加(editor: date): 日付エディタです(ネイティブ <input type="date">、自作カレンダーなし)。
//   ドラフトは 'YYYY-MM-DD' | ''。初期値は CellEditorLayer が toDateInputValue で正規化して
//   渡します(印字キー開始の initialText は無視し、常に現セル値から開始)。
//   Tab はグリッド流(commit + 移動)を優先します(ピッカー内セグメント移動は Left/Right 矢印。
//   API_REFERENCE に注記)。showPicker() はユーザージェスチャ制約があるため呼びません。
// 変更(validation): reject 列の検証 NG ではエラーバブル表示 + 編集継続、blur の rejected は
//   cancel へフォールバックします(TextCellEditor と同じ規則)。
import { useEffect, useRef, useState } from 'react';
import type {
  EditorCommitDirection,
  EditorCommitResult,
} from '../model/gridTypes';
import { createEditorKeyDownHandler } from './editorKeyBindings';
import { CellEditorErrorBubble } from './CellEditorErrorBubble';
import { cx } from '../logic/cx';

type DateCellEditorProps = {
  // 'YYYY-MM-DD' | ''(正規化済み)。
  initialValue: string;
  onCommit: (
    value: unknown,
    direction?: EditorCommitDirection,
  ) => EditorCommitResult | void;
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // マウント時(= 編集セッション開始時)に自動フォーカスします。
  //   ※ type="date" は setSelectionRange 非対応(例外を投げるブラウザあり)のため focus のみ。
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <>
      <input
        ref={inputRef}
        type="date"
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

export default DateCellEditor;