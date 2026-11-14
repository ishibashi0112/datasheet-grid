// 追加(editor: date): 日付エディタです(ネイティブ <input type="date">、自作カレンダーなし)。
//   ドラフトは 'YYYY-MM-DD' | ''。初期値は CellEditorLayer が toDateInputValue で正規化して
//   渡します(印字キー開始の initialText は無視し、常に現セル値から開始)。
//   Tab はグリッド流(commit + 移動)を優先します(ピッカー内セグメント移動は Left/Right 矢印。
//   API_REFERENCE に注記)。showPicker() はユーザージェスチャ制約があるため呼びません。
// 変更(validation): reject 列の検証 NG ではエラーバブル表示 + 編集継続、blur の rejected は
//   cancel へフォールバックします(TextCellEditor と同じ規則)。
// 変更(1.0.2 / 2026-11-09 実アプリの総点検 J-12): セルを選んで文字から打ち始めたときは type="text" で開き、打った文字を
//   残します(これまでは最初の 1 文字が捨てられ、残りがブラウザの日付の欄の区切りへ入って「0315-02-05」のような日付で
//   確定していた)。確定するときに日付として読み(貼り付けと同じ読み方。「2026/3/15」「2026-03-15」など)、読めなければ
//   「日付で入力してください」(localeText の enterDate)を出して編集を続けます(フォーカスが外れたときは取り消し)。
// 変更(1.0.2 / A-09): 日付の入力欄は中身の幅より狭くしません(細い列で年が切れていた)。右のペインの下や表の外へ
//   はみ出すときは左へずらします。
import { useCallback, useState } from 'react';
import type {
  EditorCommitDirection,
  EditorCommitResult,
  EditorEnterMove,
} from '../model/gridTypes';
import { createEditorKeyDownHandler } from './editorKeyBindings';
import { CellEditorErrorBubble } from './CellEditorErrorBubble';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
import { toDateInputValue } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorValues';
import { useGridLocaleText } from '../hooks/useGridLocaleText';
import { resolveShiftIntoView } from './editorVisibleBounds';

type DateCellEditorProps = {
  // 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-34): 入力欄の読み上げの名前(「(列名) を編集」。枠の group と同じ)。
  ariaLabel?: string;
  // 'YYYY-MM-DD' | ''(正規化済み)。
  initialValue: string;
  // 追加(1.0.2 / J-12): 文字から打ち始めたときの文字列(このときは type="text" で開く)。
  initialText?: string;
  onCommit: (
    value: unknown,
    direction?: EditorCommitDirection,
  ) => EditorCommitResult | void;
  onCancel: () => void;
  align?: 'left' | 'center' | 'right';
  // 追加(enter-move ②): Enter 確定後の移動先です(未指定 = 'down')。
  enterMove?: EditorEnterMove;
};

export function DateCellEditor({
  ariaLabel,
  initialValue,
  initialText,
  onCommit,
  onCancel,
  align,
  enterMove,
}: DateCellEditorProps) {
  const texts = useGridLocaleText();
  // 文字から打ち始めたセッションは type="text"(セッションの途中で type は切り替えない)。
  const [textMode] = useState(() => initialText !== undefined && initialText !== '');
  const [draftValue, setDraftValue] = useState(textMode ? (initialText ?? '') : initialValue);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shift, setShift] = useState(0);

  // マウント時(= 編集セッション開始時)に自動フォーカスします(callback ref は commit 後 = レイアウト確定後に呼ばれます)。
  //   ※ type="date" は setSelectionRange 非対応(例外を投げるブラウザあり)のため focus のみ。text のときは打った文字の
  //   後ろへキャレットを置きます。見えている範囲の外へはみ出す分だけ左へずらします(A-09)。
  const inputRefCallback = useCallback((input: HTMLInputElement | null) => {
    if (!input) {
      return;
    }
    input.focus();
    if (input.type === 'text') {
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }
    setShift(resolveShiftIntoView(input));
  }, []);

  // 文字のセッションは日付として読んでから確定します(空は空 = 値を消す)。読めなければ rejected。
  const commitDraft = (
    value: unknown,
    direction?: EditorCommitDirection,
  ): EditorCommitResult | void => {
    if (!textMode) {
      return onCommit(value, direction);
    }
    const text = String(value).trim();
    if (text === '') {
      return onCommit('', direction);
    }
    const normalized = toDateInputValue(text);
    return normalized === ''
      ? { status: 'rejected', message: texts.enterDate }
      : onCommit(normalized, direction);
  };

  return (
    <>
      <input
        ref={inputRefCallback}
        type={textMode ? 'text' : 'date'}
        value={draftValue}
        onChange={(event) => {
          setDraftValue(event.target.value);
          // 再入力でエラー表示を解除します。
          setErrorMessage(null);
        }}
        onKeyDown={createEditorKeyDownHandler({
          value: draftValue,
          onCommit: commitDraft,
          onCancel,
          onRejected: setErrorMessage,
          enterMove,
          // 追加(dogfood DF-13): 日付の入力欄では Home / End でもグリッドがスクロールしていたため止めます
          //   (文字の欄ではカーソルの移動なので止めない)。
          blockHomeEnd: !textMode,
        })}
        onBlur={() => {
          const result = commitDraft(draftValue);
          if (result && result.status === 'rejected') {
            onCancel();
          }
        }}
        aria-label={ariaLabel}
        aria-invalid={errorMessage !== null || undefined}
        className={cx(
          'ssg-cell-editor-input',
          errorMessage !== null && 'ssg-cell-editor-input--invalid',
        )}
        style={
          align || shift > 0
            ? { ...(align ? { textAlign: align } : null), ...(shift > 0 ? { position: 'relative', left: -shift } : null) }
            : undefined
        }
      />
      {errorMessage !== null ? (
        <CellEditorErrorBubble message={errorMessage} />
      ) : null}
    </>
  );
}

export default DateCellEditor;