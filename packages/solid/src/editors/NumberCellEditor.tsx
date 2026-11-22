// number エディタ(<input type="number">)。React 版の editors/NumberCellEditor.tsx と同じ DOM と class。
//   min / max / step はネイティブの属性へ(ArrowUp / ArrowDown のステップ・不正な文字の抑止はブラウザ)。確定する値は打った
//   文字列のまま(列のパーサが数値 / null へ。core logic/editorValues)。「-」「+」「.」で打ち始めたときと、数値に直せない
//   初期値のときは type="text"(inputmode="decimal")で開きます(core logic/editorStart。セッションの途中で type は変えない)。
//   入力の検査の NG とフォーカスが外れたときの扱いは text エディタと同じです。
import { createSignal, onCleanup, onSettled, untrack } from 'solid-js';
import type { EditorEnterMove } from '@ishibashi0112/spreadsheet-grid-core';
import { handleEditorKeyDown } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorKeys';
import {
  resolveNumberEditorCommitValue,
  resolveNumberEditorStart,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorStart';
import { createTopAlignedInput } from '../primitives/topAlignedInput';
import { CellEditorError } from './CellEditorErrorBubble';
import type { EditorCommit } from './TextCellEditor';
import { toEditorKeyEvent } from '../primitives/eventKey';

type NumberCellEditorProps = {
  ariaLabel?: string | undefined;
  initialValue: string;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  onCommit: EditorCommit;
  onCancel: () => void;
  // 打ちかけを確定する関数を預ける先(core editController の registerDraftFlush。1.3.0 / S7-03 / S8-04)。
  onRegisterFlush?: ((flush: (() => void) | null) => void) | undefined;
  align?: 'left' | 'center' | 'right' | undefined;
  enterMove?: EditorEnterMove | undefined;
  cellHeight?: number | undefined;
  alignTop?: boolean | undefined;
};

export function NumberCellEditor(props: NumberCellEditorProps) {
  const [input, setInput] = createSignal<HTMLInputElement>();
  const [error, setError] = createSignal<string | null>(null);
  createTopAlignedInput(input, () => props.alignTop ?? false, () => props.cellHeight ?? 0);
  const start = resolveNumberEditorStart(untrack(() => props.initialValue));
  const textMode = start.textMode;
  // value は素の変数で渡して作ったときに 1 回だけ入れます(式で渡すと、エラーの印などの描き直しで Solid が書き直し、打ちかけが
  //   消える。type="number" の「-」「1e」だけの打ちかけは入力欄の value が '' のまま。text エディタの説明を参照)。
  const startText = start.text;
  // エディタが外れるときのブラウザの blur では確定しません(text エディタと同じ)。
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  // 今の打ちかけを確定する関数をグリッドへ預けます(text エディタと同じ)。
  props.onRegisterFlush?.(() => {
    untrack(() => {
      const element = input();
      if (element) {
        props.onCommit(resolveNumberEditorCommitValue(element.value, textMode));
      }
    });
  });

  // 描き終わった後にフォーカスします(type="number" は setSelectionRange に対応しないので、text のときだけ打った文字の後ろへ)。
  onSettled(() => {
    const element = untrack(input);
    if (!element) {
      return;
    }
    element.focus();
    if (element.type === 'text') {
      const end = element.value.length;
      element.setSelectionRange(end, end);
    }
  });

  return (
    <>
      <input
        ref={setInput}
        type={textMode ? 'text' : 'number'}
        inputmode={textMode ? 'decimal' : undefined}
        value={startText}
        min={textMode ? undefined : props.min}
        max={textMode ? undefined : props.max}
        step={textMode ? undefined : props.step}
        // 再入力でエラーの表示を外します。
        onInput={() => setError(null)}
        onKeyDown={(event) =>
          handleEditorKeyDown(toEditorKeyEvent(event), {
            value: resolveNumberEditorCommitValue(event.currentTarget.value, textMode),
            onCommit: props.onCommit,
            onCancel: props.onCancel,
            onRejected: setError,
            enterMove: props.enterMove,
          })
        }
        onBlur={(event) => {
          if (disposed) {
            return;
          }
          const result = props.onCommit(resolveNumberEditorCommitValue(event.currentTarget.value, textMode));
          if (result && result.status === 'rejected') {
            props.onCancel();
          }
        }}
        aria-label={props.ariaLabel}
        aria-invalid={error() !== null ? 'true' : undefined}
        class={['ssg-cell-editor-input', { 'ssg-cell-editor-input--invalid': error() !== null }]}
        style={props.align ? { 'text-align': props.align } : undefined}
      />
      <CellEditorError message={error()} />
    </>
  );
}