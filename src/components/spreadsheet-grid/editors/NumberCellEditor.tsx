// 追加(editor: number): 数値エディタです(<input type="number">)。
//   min / max / step はネイティブ属性へ反映し、ArrowUp/Down のステップ・不正文字の抑止を
//   ブラウザに任せます。commit 値はドラフト文字列のまま渡し、書き込み側の共通規則
//   (logic/editorValues.ts の number 既定パーサ)で数値 / null へ変換します。
// 変更(validation): reject 列の検証 NG ではエラーバブル表示 + 編集継続、blur の rejected は
//   cancel へフォールバックします(TextCellEditor と同じ規則)。
import { useEffect, useRef, useState } from 'react';
import type {
  EditorCommitDirection,
  EditorCommitResult,
  EditorEnterMove,
} from '../model/gridTypes';
import { createEditorKeyDownHandler } from './editorKeyBindings';
import { CellEditorErrorBubble } from './CellEditorErrorBubble';
import { cx } from '../logic/cx';

type NumberCellEditorProps = {
  initialValue: string;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (
    value: unknown,
    direction?: EditorCommitDirection,
  ) => EditorCommitResult | void;
  onCancel: () => void;
  align?: 'left' | 'center' | 'right';
  // 追加(enter-move ②): Enter 確定後の移動先です(未指定 = 'down')。
  enterMove?: EditorEnterMove;
};

export function NumberCellEditor({
  initialValue,
  min,
  max,
  step,
  onCommit,
  onCancel,
  align,
  enterMove,
}: NumberCellEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftValue, setDraftValue] = useState(initialValue);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // マウント時(= 編集セッション開始時)に自動フォーカスします。
  //   ※ type="number" は setSelectionRange 非対応(例外を投げるブラウザあり)のため focus のみ。
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <>
      <input
        ref={inputRef}
        type="number"
        value={draftValue}
        min={min}
        max={max}
        step={step}
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
          enterMove,
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

export default NumberCellEditor;