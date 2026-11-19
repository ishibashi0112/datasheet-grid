// date エディタ(ネイティブの <input type="date">。自作のカレンダーは無い)。React 版の editors/DateCellEditor.tsx と同じ DOM と
//   class。Tab はグリッドの流れ(確定 + 移動)を優先します(日付の欄の中の移動は左右の矢印)。
//   セルを選んで文字から打ち始めたときは type="text" で開いて打った文字を残し、確定するときに日付として読みます(読めなければ
//   「日付で入力してください」を出して編集を続ける。フォーカスが外れたときは取り消し。core logic/editorStart)。日付の入力欄は
//   中身の幅より狭くせず、右のペインの下や表の外へはみ出すときは左へずらします(core utils/editorVisibleBounds)。
import { createSignal, onCleanup, onSettled, untrack } from 'solid-js';
import type { EditorCommitDirection, EditorCommitResult, EditorEnterMove } from '@ishibashi0112/spreadsheet-grid-core';
import { handleEditorKeyDown } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorKeys';
import { readTypedDateCommitValue } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorStart';
import { resolveShiftIntoView } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/editorVisibleBounds';
import { useGridLocaleText } from '../context/localeText';
import { createTopAlignedInput } from '../primitives/topAlignedInput';
import { px } from '../primitives/style';
import { CellEditorError } from './CellEditorErrorBubble';
import type { EditorCommit } from './TextCellEditor';

type DateCellEditorProps = {
  ariaLabel?: string | undefined;
  // 'YYYY-MM-DD' | ''(読み直した値)。
  initialValue: string;
  // 文字から打ち始めたときの文字列(このときは type="text" で開く)。
  initialText?: string | undefined;
  onCommit: EditorCommit;
  onCancel: () => void;
  align?: 'left' | 'center' | 'right' | undefined;
  enterMove?: EditorEnterMove | undefined;
  cellHeight?: number | undefined;
  alignTop?: boolean | undefined;
};

export function DateCellEditor(props: DateCellEditorProps) {
  const texts = useGridLocaleText();
  const [input, setInput] = createSignal<HTMLInputElement>();
  const [error, setError] = createSignal<string | null>(null);
  const [shift, setShift] = createSignal(0);
  createTopAlignedInput(input, () => props.alignTop ?? false, () => props.cellHeight ?? 0);
  // 文字から打ち始めたセッションは type="text"(セッションの途中で type は変えない)。
  const initialText = untrack(() => props.initialText);
  const textMode = initialText !== undefined && initialText !== '';
  // value は素の変数で渡して作ったときに 1 回だけ入れます(式で渡すと描き直しのたびに Solid が書き直し、欄が欠けた日付の
  //   打ちかけ = value が '' が消える。text エディタの説明を参照)。
  const startValue = textMode ? (initialText ?? '') : untrack(() => props.initialValue);
  // エディタが外れるときのブラウザの blur では確定しません(text エディタと同じ)。
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });

  // 描き終わった後にフォーカスし(type="date" は setSelectionRange に対応しないので、text のときだけ打った文字の後ろへ)、
  //   見えている範囲の外へはみ出す分だけ左へずらします。
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
    setShift(resolveShiftIntoView(element));
  });

  // 文字のセッションは日付として読んでから確定します(空は空 = 値を消す)。読めなければ rejected。
  const commitDraft = (value: unknown, direction?: EditorCommitDirection): EditorCommitResult | void => {
    if (!textMode) {
      return props.onCommit(value, direction);
    }
    const normalized = readTypedDateCommitValue(value);
    return normalized === null ? { status: 'rejected', message: texts().enterDate } : props.onCommit(normalized, direction);
  };

  return (
    <>
      <input
        ref={setInput}
        type={textMode ? 'text' : 'date'}
        value={startValue}
        // 再入力でエラーの表示を外します。
        onInput={() => setError(null)}
        onKeyDown={(event) =>
          handleEditorKeyDown(event, {
            value: event.currentTarget.value,
            onCommit: commitDraft,
            onCancel: props.onCancel,
            onRejected: setError,
            enterMove: props.enterMove,
            // 日付の入力欄では Home / End でもグリッドがスクロールしていたので止めます(文字の欄ではカーソルの移動なので止めない)。
            blockHomeEnd: !textMode,
          })
        }
        onBlur={(event) => {
          if (disposed) {
            return;
          }
          const result = commitDraft(event.currentTarget.value);
          if (result && result.status === 'rejected') {
            props.onCancel();
          }
        }}
        aria-label={props.ariaLabel}
        aria-invalid={error() !== null ? 'true' : undefined}
        class={['ssg-cell-editor-input', { 'ssg-cell-editor-input--invalid': error() !== null }]}
        style={
          props.align || shift() > 0
            ? {
                ...(props.align ? { 'text-align': props.align } : null),
                ...(shift() > 0 ? { position: 'relative', left: px(-shift()) } : null),
              }
            : undefined
        }
      />
      <CellEditorError message={error()} />
    </>
  );
}