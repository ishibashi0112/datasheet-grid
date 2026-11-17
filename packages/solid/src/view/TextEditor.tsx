// 1 行の text エディタ(試作)。React 版の editors/TextCellEditor.tsx(1 行の分)と editors/editorKeyBindings.ts の
//   Enter / Tab / Escape / PageUp・PageDown の扱いを Solid で書き直したもの。
//   Solid 2.0 では signal への書き込みが次のマイクロタスクまで読めない(setDraft の直後の draft() は前の値)ので、
//   確定するときは signal ではなく入力欄の今の値(DOM)を読みます。
import { Show, createSignal, onSettled, untrack } from 'solid-js';
import type {
  EditorCommitDirection,
  EditorCommitResult,
  EditorEnterMove,
} from '@ishibashi0112/spreadsheet-grid-core';
import { isImeComposingKeyEvent } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/domGuards';

type TextEditorProps = {
  initialValue: string;
  ariaLabel?: string | undefined;
  align?: 'left' | 'center' | 'right' | undefined;
  enterMove?: EditorEnterMove | undefined;
  onCommit: (value: unknown, direction?: EditorCommitDirection) => EditorCommitResult | void;
  onCancel: () => void;
};

const resolveEnterDirection = (enterMove: EditorEnterMove | undefined): EditorCommitDirection | undefined => {
  const move = enterMove ?? 'down';
  return move === 'none' ? undefined : move;
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

  const commitWith = (value: string, direction?: EditorCommitDirection) => {
    const result = props.onCommit(value, direction);
    if (result && result.status === 'rejected') {
      setError(result.message);
    }
  };

  const handleKeyDown = (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
    if (isImeComposingKeyEvent(event)) {
      return;
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commitWith(event.currentTarget.value, resolveEnterDirection(props.enterMove));
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onCancel();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      commitWith(event.currentTarget.value, event.shiftKey ? 'left' : 'right');
    }
  };

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