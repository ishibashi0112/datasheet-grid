// 1 行の text エディタ(試作)。React 版の editors/TextCellEditor.tsx(1 行の分)を Solid で書き直したもの。キーの割り当ては
//   core logic/editorKeys(React 版の editors/editorKeyBindings.ts と共用)。
//   Solid 2.0 では signal への書き込みが次のマイクロタスクまで読めない(setDraft の直後の draft() は前の値)ので、
//   確定するときは signal ではなく入力欄の今の値(DOM)を読みます。
import { Show, createSignal, onSettled, untrack } from 'solid-js';
import type {
  EditorCommitDirection,
  EditorCommitResult,
  EditorEnterMove,
} from '@ishibashi0112/spreadsheet-grid-core';
import { handleEditorKeyDown } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorKeys';

type TextEditorProps = {
  initialValue: string;
  ariaLabel?: string | undefined;
  align?: 'left' | 'center' | 'right' | undefined;
  enterMove?: EditorEnterMove | undefined;
  onCommit: (value: unknown, direction?: EditorCommitDirection) => EditorCommitResult | void;
  onCancel: () => void;
};

export function TextEditor(props: TextEditorProps) {
  let input: HTMLInputElement | undefined;
  const [error, setError] = createSignal<string | null>(null);
  const initialValue = untrack(() => props.initialValue);

  onSettled(() => {
    if (!input) {
      return;
    }
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  });

  // キーの割り当て(IME の変換中 / スクロールのキー / Enter・Tab・Escape)は core logic/editorKeys(React 版と共用)。
  //   確定する値は入力欄の今の値(signal は書き込みの直後に前の値を返すため)。
  const handleKeyDown = (event: KeyboardEvent & { currentTarget: HTMLInputElement }) =>
    handleEditorKeyDown(event, {
      value: event.currentTarget.value,
      onCommit: props.onCommit,
      onCancel: props.onCancel,
      onRejected: setError,
      enterMove: props.enterMove,
    });

  return (
    <>
      <input
        ref={(element) => {
          input = element;
        }}
        type="text"
        value={initialValue}
        onInput={() => setError(null)}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          const result = props.onCommit(event.currentTarget.value);
          if (result && result.status === 'rejected') {
            props.onCancel();
          }
        }}
        aria-label={props.ariaLabel}
        aria-invalid={error() !== null ? 'true' : undefined}
        class={['ssg-cell-editor-input', { 'ssg-cell-editor-input--invalid': error() !== null }]}
        style={props.align ? { 'text-align': props.align } : undefined}
      />
      <Show when={error()}>
        {(message) => (
          <div class="ssg-cell-editor-error" role="alert">
            {message()}
          </div>
        )}
      </Show>
    </>
  );
}