// text エディタ(1 行の入力欄 / `multiline: true` の複数行の入力欄)。React 版の editors/TextCellEditor.tsx と同じ DOM と class。
//   キーの割り当ては core logic/editorKeys、複数行の入力欄の大きさと改行は core utils/multilineEditor(どちらも React 版と共用)。
//   - 編集のセッションごとに作り直されます(呼ぶ側の CellEditorLayer)。初期値は作ったときに 1 回だけ読みます。
//   - Solid 2.0 では signal への書き込みが次のマイクロタスクまで読めない(setDraft の直後の draft() は前の値)ので、確定する
//     ときは signal ではなく入力欄の今の値(DOM)を読みます。下書きの signal は複数行の入力欄の高さを合わせ直す合図と、
//     1 行 ⇄ 複数行の入れ替え(列の editor の差し替え)で打ちかけを引き継ぐのに使います。
//   - 入力欄の value は作ったときに 1 回だけ入れます(JSX の value は素の変数で渡す)。式で渡すと、同じ要素の別の属性
//     (aria-invalid・class など)が変わるたびに Solid が value を書き直し、打ちかけが消える(type="number" の「-」だけなど、
//     入力欄の value が '' のままの打ちかけも消える)。React 版は値が違うときだけ書く。
//   - エディタが外れるとき(取り消し・ペインの移動・グリッドの破棄)にブラウザが出す blur では確定しません(React 版は DOM を
//     書き換える間のイベントを止めるので届かない)。
//   - 入力の検査の NG(commit が rejected)ではエラーの吹き出しを出して編集を続けます。フォーカスが外れたときの rejected は
//     取り消しにします(フォーカスが去ったのに開き続ける事故の防止)。
import { Show, createRenderEffect, createSignal, onCleanup, onSettled, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type {
  EditorCommitDirection,
  EditorCommitResult,
  EditorEnterMove,
  GridTextEditorEnterKey,
} from '@ishibashi0112/spreadsheet-grid-core';
import { handleEditorKeyDown } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorKeys';
import {
  fitMultilineEditor,
  insertNewlineByCommand,
  insertNewlineText,
  resolveMultilinePadding,
} from '@ishibashi0112/spreadsheet-grid-core/internal/utils/multilineEditor';
import { createTopAlignedInput } from '../primitives/topAlignedInput';
import { CellEditorError } from './CellEditorErrorBubble';

export type EditorCommit = (value: unknown, direction?: EditorCommitDirection) => EditorCommitResult | void;

type TextCellEditorProps = {
  ariaLabel?: string | undefined;
  initialValue: string;
  onCommit: EditorCommit;
  onCancel: () => void;
  align?: 'left' | 'center' | 'right' | undefined;
  enterMove?: EditorEnterMove | undefined;
  // 複数行の入力欄で開くか / その Enter の動き(既定 'commit')/ セルの高さ(入力欄の高さの下限)。
  multiline?: boolean | undefined;
  enterKey?: GridTextEditorEnterKey | undefined;
  cellHeight?: number | undefined;
  // 列の wordBreak / lineBreak(複数行の入力欄でもセルと同じ位置で折り返す)。
  wordBreak?: string | undefined;
  lineBreak?: string | undefined;
  // 編集中のセルが上にそろえて描かれているか(背の高い行の auto-height の列など)。
  alignTop?: boolean | undefined;
};

export function TextCellEditor(props: TextCellEditorProps) {
  const [input, setInput] = createSignal<HTMLInputElement>();
  const [textarea, setTextarea] = createSignal<HTMLTextAreaElement>();
  const [error, setError] = createSignal<string | null>(null);
  const initialValue = untrack(() => props.initialValue);
  const [draft, setDraft] = createSignal(initialValue);
  const cellHeight = () => props.cellHeight ?? 0;
  const alignTop = () => props.alignTop ?? false;
  createTopAlignedInput(input, alignTop, cellHeight);

  // 複数行の入力欄は中身が変わるたびに高さを合わせます。上下の余白はセルの高さと揃え方ごとに開いたときに 1 回だけ決めます
  //   (打っている間に変えると、改行を入れたときに文字が上下へ動くため)。
  let padding: { key: string; value: number } | null = null;
  let pendingCaret: number | null = null;
  // effect の後半(DOM を触る側)では signal を読まず、前半で読んだ値を使います(Solid の開発ビルドの STRICT_READ_UNTRACKED)。
  const fit = ([element, height, top]: readonly [HTMLTextAreaElement | undefined, number, boolean, string]) => {
    if (!element) {
      return;
    }
    const key = `${height}:${top}`;
    if (padding?.key !== key) {
      padding = { key, value: resolveMultilinePadding(element, height, top) };
    }
    fitMultilineEditor(element, height, padding.value);
    if (pendingCaret !== null) {
      const caret = pendingCaret;
      pendingCaret = null;
      element.setSelectionRange(caret, caret);
    }
  };
  createRenderEffect(() => [textarea(), cellHeight(), alignTop(), draft()] as const, fit);

  // 描き終わった後(= 編集のセッションの始まり)にフォーカスし、末尾へキャレットを置きます。
  onSettled(() => {
    const element = untrack(() => input() ?? textarea());
    if (!element) {
      return;
    }
    element.focus();
    const end = element.value.length;
    element.setSelectionRange(end, end);
  });

  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  const commitOnBlur = (value: string) => {
    if (disposed) {
      return;
    }
    const result = props.onCommit(value);
    if (result && result.status === 'rejected') {
      props.onCancel();
    }
  };
  const handleInput = (value: string) => {
    setDraft(value);
    // 再入力でエラーの表示を外します。
    setError(null);
  };

  // 修飾キー付きの Enter で改行を入れます。execCommand なら入力欄の「元に戻す」(Ctrl+Z)に載り、input イベントで下書きも
  //   変わります。使えない環境では値を組み立てて入れ、キャレットを改行の後ろへ置きます。
  const insertNewline = (element: HTMLTextAreaElement) => {
    if (insertNewlineByCommand()) {
      return;
    }
    const next = insertNewlineText(element);
    element.value = next.value;
    pendingCaret = next.caret;
    handleInput(next.value);
  };

  // 入力欄はその時点の下書きで作ります(value は素の変数 = 作ったときに 1 回だけ入れる)。
  const renderInput = () => {
    const startValue = untrack(draft);
    return (
      <>
        <input
          ref={setInput}
          type="text"
          value={startValue}
          onInput={(event) => handleInput(event.currentTarget.value)}
          onKeyDown={(event) =>
            handleEditorKeyDown(event, {
              value: event.currentTarget.value,
              onCommit: props.onCommit,
              onCancel: props.onCancel,
              onRejected: setError,
              enterMove: props.enterMove,
            })
          }
          onBlur={(event) => commitOnBlur(event.currentTarget.value)}
          aria-label={props.ariaLabel}
          aria-invalid={error() !== null ? 'true' : undefined}
          class={['ssg-cell-editor-input', { 'ssg-cell-editor-input--invalid': error() !== null }]}
          style={props.align ? { 'text-align': props.align } : undefined}
        />
        <CellEditorError message={error()} />
      </>
    );
  };
  const renderTextarea = () => {
    const startValue = untrack(draft);
    return (
      <div class="ssg-cell-editor-multiline">
        <textarea
          ref={setTextarea}
          value={startValue}
          rows={1}
          onInput={(event) => handleInput(event.currentTarget.value)}
          onKeyDown={(event) =>
            handleEditorKeyDown(event, {
              value: event.currentTarget.value,
              onCommit: props.onCommit,
              onCancel: props.onCancel,
              onRejected: setError,
              enterMove: props.enterMove,
              multilineEnter: props.enterKey ?? 'commit',
              onInsertNewline: insertNewline,
            })
          }
          onBlur={(event) => commitOnBlur(event.currentTarget.value)}
          aria-label={props.ariaLabel}
          aria-invalid={error() !== null ? 'true' : undefined}
          class={[
            'ssg-cell-editor-input',
            'ssg-cell-editor-input--multiline',
            { 'ssg-cell-editor-input--invalid': error() !== null },
          ]}
          // 'auto-phrase' など型に無い値も通すため、緩い型で入れます(セルの折り返しの style と同じ)。
          style={
            {
              ...(props.align ? { 'text-align': props.align } : null),
              ...(props.wordBreak !== undefined ? { 'word-break': props.wordBreak } : null),
              ...(props.lineBreak !== undefined ? { 'line-break': props.lineBreak } : null),
            } as JSX.CSSProperties
          }
        />
        <CellEditorError message={error()} />
      </div>
    );
  };

  return (
    <Show when={props.multiline ?? false} fallback={renderInput()}>
      {renderTextarea()}
    </Show>
  );
}