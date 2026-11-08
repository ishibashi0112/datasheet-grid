// 追加(editor 基盤): 既定の text エディタです(CellEditorLayer から移設)。
//   ドラフト値はローカル state で持ち、タイピングで親(3 ペイン全体)を再レンダーしません
//   (11-B6)。新しい編集セッションは CellEditorLayer が key 再マウントで開始するため、
//   初期値は useState の初期化だけで安全に反映されます。
// 変更(validation): reject 列の検証 NG(commit が rejected)ではエラーバブルを表示して
//   編集を継続します。blur の rejected は cancel へフォールバックします(フォーカスが
//   去ったのに開き続ける事故の防止)。
// 追加(段階 2 DU-14): multiline のときは複数行の入力欄(textarea)で開きます。中身に合わせて下へ伸び(下限はセルの高さ、
//   上限は表の見える範囲の下端まで。超える分は入力欄の中でスクロール)、Enter の動きは enterKey で決めます。
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  EditorCommitDirection,
  EditorCommitResult,
  EditorEnterMove,
  GridTextEditorEnterKey,
} from '../model/gridTypes';
import { useIsomorphicLayoutEffect } from '../hooks/useController';
import { createEditorKeyDownHandler } from './editorKeyBindings';
import { CellEditorErrorBubble } from './CellEditorErrorBubble';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';

type TextCellEditorProps = {
  initialValue: string;
  onCommit: (
    value: unknown,
    direction?: EditorCommitDirection,
  ) => EditorCommitResult | void;
  onCancel: () => void;
  align?: 'left' | 'center' | 'right';
  // 追加(enter-move ②): Enter 確定後の移動先です(未指定 = 'down')。
  enterMove?: EditorEnterMove;
  // 追加(段階 2 DU-14): 複数行の入力欄で開くか / その Enter の動き(既定 'commit')/ セルの高さ(入力欄の高さの下限)。
  multiline?: boolean;
  enterKey?: GridTextEditorEnterKey;
  cellHeight?: number;
  // 追加(段階 2 の確かめ直し N2-2): 列の wordBreak / lineBreak(複数行の入力欄でもセルと同じ位置で折り返す)。
  wordBreak?: string;
  lineBreak?: string;
  // 追加(段階 2 の確かめ直し N3-2): 編集中のセルが上にそろえて描かれているか(背の高い行の auto-height の列など)。
  alignTop?: boolean;
};

// 追加(段階 2 DU-14): 複数行の入力欄の 1 行の高さが読めないとき(line-height: normal など)の値です。
// 変更(段階 2 の確かめ直し N2-2): 行の間隔はセルと同じくページから受け継ぐ(styles.css の line-height: inherit)ので、
//   余白の計算には実際の値を読みます(これまでは 20px 固定で、行の間隔 24px のページでは開くと行が詰まって見えた)。
const FALLBACK_LINE_HEIGHT = 20;

// 追加(段階 2 の確かめ直し N3-2): 複数行の入力欄の上下の余白です。1 行目をセルの文字にそろえる量で、上にそろえたセルは 0、
//   真ん中にそろえたセルは開いたときの中身の高さをセルの真ん中に置く量(4 は上下の枠線 2px × 2)。これまでは 1 行の値を
//   基準の行の高さの真ん中に置く量(最大 6px)で、背の高い行では文字がセルより下へずれ、入力欄もその分セルより高くなっていました。
const resolveMultilinePadding = (textarea: HTMLTextAreaElement, cellHeight: number, alignTop: boolean): number => {
  if (alignTop) {
    return 0;
  }
  textarea.style.paddingTop = '0px';
  textarea.style.paddingBottom = '0px';
  textarea.style.height = '0px';
  const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || FALLBACK_LINE_HEIGHT;
  const textHeight = Math.max(textarea.scrollHeight, lineHeight);
  return Math.max(0, Math.floor((cellHeight - 4 - textHeight) / 2));
};

// 追加(段階 2 DU-14): 複数行の入力欄の高さを中身に合わせます。下限はセルの高さ、上限は表の見える範囲の下端まで
//   (超える分は入力欄の中でスクロール)。上下の余白は resolveMultilinePadding で決めた量(打っている間は変えない)。
const fitMultilineEditor = (textarea: HTMLTextAreaElement, cellHeight: number, padding: number) => {
  textarea.style.paddingTop = `${padding}px`;
  textarea.style.paddingBottom = `${padding}px`;
  textarea.style.height = `${cellHeight}px`;
  const border = textarea.offsetHeight - textarea.clientHeight;
  const needed = textarea.scrollHeight + border;
  let limit = Number.POSITIVE_INFINITY;
  const scroller = textarea.closest('.ssg-scroll-container');
  if (scroller instanceof HTMLElement) {
    const scrollerRect = scroller.getBoundingClientRect();
    limit = scrollerRect.top + scroller.clientTop + scroller.clientHeight - textarea.getBoundingClientRect().top;
  }
  textarea.style.height = `${Math.max(cellHeight, Math.min(needed, limit))}px`;
};

export function TextCellEditor({
  initialValue,
  onCommit,
  onCancel,
  align,
  enterMove,
  multiline = false,
  enterKey = 'commit',
  cellHeight = 0,
  wordBreak,
  lineBreak,
  alignTop = false,
}: TextCellEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // 追加(段階 2 DU-14): 改行を入れた後に置くキャレットの位置(execCommand が使えないときの代わりの入れ方で使う)。
  const pendingCaretRef = useRef<number | null>(null);
  // 追加(段階 2 の確かめ直し N3-2): 複数行の入力欄の上下の余白(セルの高さと揃え方ごとに開いたときに 1 回だけ決める。
  //   打っている間に変えると、改行を入れたときに文字が上下へ動くため)。
  const multilinePaddingRef = useRef<{ key: string; padding: number } | null>(null);
  const [draftValue, setDraftValue] = useState(initialValue);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 追加(段階 2 DU-14): 複数行の入力欄は中身が変わるたびに高さを合わせます(描く前に合わせて、伸びる途中を見せない)。
  useIsomorphicLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!multiline || !textarea) {
      return;
    }
    const paddingKey = `${cellHeight}:${alignTop}`;
    if (multilinePaddingRef.current?.key !== paddingKey) {
      multilinePaddingRef.current = { key: paddingKey, padding: resolveMultilinePadding(textarea, cellHeight, alignTop) };
    }
    fitMultilineEditor(textarea, cellHeight, multilinePaddingRef.current.padding);
    const caret = pendingCaretRef.current;
    if (caret !== null) {
      pendingCaretRef.current = null;
      textarea.setSelectionRange(caret, caret);
    }
  }, [multiline, cellHeight, alignTop, draftValue]);

  // マウント時(= 編集セッション開始時)に自動フォーカスし、末尾へキャレット移動します。
  useEffect(() => {
    const input = inputRef.current ?? textareaRef.current;
    if (!input) {
      return;
    }
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, []);

  const handleCommitOnBlur = () => {
    const result = onCommit(draftValue);
    if (result && result.status === 'rejected') {
      onCancel();
    }
  };

  if (multiline) {
    // 修飾キー付きの Enter で改行を入れます。execCommand なら入力欄の「元に戻す」(Ctrl+Z)に載り、input イベントで
    //   ドラフトも更新されます。使えない環境では値を組み立てて入れ、キャレットを改行の後ろへ置きます。
    const insertNewline = (textarea: HTMLTextAreaElement) => {
      if (typeof document.execCommand === 'function' && document.execCommand('insertText', false, '\n')) {
        return;
      }
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      pendingCaretRef.current = start + 1;
      setDraftValue(`${textarea.value.slice(0, start)}\n${textarea.value.slice(end)}`);
      setErrorMessage(null);
    };
    // 'auto-phrase' など csstype に無い値も通すため、緩い型で入れます(セルの wrapStyle と同じ)。
    const textareaStyle: Record<string, string> = {};
    if (align) {
      textareaStyle.textAlign = align;
    }
    if (wordBreak !== undefined) {
      textareaStyle.wordBreak = wordBreak;
    }
    if (lineBreak !== undefined) {
      textareaStyle.lineBreak = lineBreak;
    }
    return (
      <div className="ssg-cell-editor-multiline">
        <textarea
          ref={textareaRef}
          value={draftValue}
          rows={1}
          onChange={(event) => {
            setDraftValue(event.target.value);
            setErrorMessage(null);
          }}
          // insertNewline は ref(改行の後のキャレット)を書くので、描くときではなくキーを押したときにハンドラを作ります。
          onKeyDown={(event) =>
            createEditorKeyDownHandler({
              value: draftValue,
              onCommit,
              onCancel,
              onRejected: setErrorMessage,
              enterMove,
              multilineEnter: enterKey,
              onInsertNewline: insertNewline,
            })(event)
          }
          onBlur={handleCommitOnBlur}
          className={cx(
            'ssg-cell-editor-input',
            'ssg-cell-editor-input--multiline',
            errorMessage !== null && 'ssg-cell-editor-input--invalid',
          )}
          style={textareaStyle as CSSProperties}
        />
        {errorMessage !== null ? <CellEditorErrorBubble message={errorMessage} /> : null}
      </div>
    );
  }

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
          enterMove,
        })}
        onBlur={handleCommitOnBlur}
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