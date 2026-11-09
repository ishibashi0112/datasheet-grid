// 追加(editor: number): 数値エディタです(<input type="number">)。
//   min / max / step はネイティブ属性へ反映し、ArrowUp/Down のステップ・不正文字の抑止を
//   ブラウザに任せます。commit 値はドラフト文字列のまま渡し、書き込み側の共通規則
//   (logic/editorValues.ts の number 既定パーサ)で数値 / null へ変換します。
// 変更(validation): reject 列の検証 NG ではエラーバブル表示 + 編集継続、blur の rejected は
//   cancel へフォールバックします(TextCellEditor と同じ規則)。
// 変更(数値の打ち始め): 「-」「+」「.」のキーで始めた編集だけは type="text" で開きます(下の textMode)。
// 変更(FC-17): 数値に直せない初期値(英字から打ち始めた等)も type="text" で開きます。
import { useEffect, useRef, useState } from 'react';
import type {
  EditorCommitDirection,
  EditorCommitResult,
  EditorEnterMove,
} from '../model/gridTypes';
import { createEditorKeyDownHandler } from './editorKeyBindings';
import { useCommitIfRemovedWhileFocused } from './useCommitIfRemovedWhileFocused';
import { CellEditorErrorBubble } from './CellEditorErrorBubble';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
import {
  isNumberInputPrefix,
  normalizeNumberText,
  toNumberInputText,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorValues';

type NumberCellEditorProps = {
  // 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-34): 入力欄の読み上げの名前(「(列名) を編集」。枠の group と同じ)。
  ariaLabel?: string;
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
  // 追加(1.0.1 / AP-12): フォーカスを持ったまま外れたとき(グリッドごとアンマウント)に、打っていた値で呼びます。
  onRemovedWhileFocused?: (value: unknown) => void;
};

export function NumberCellEditor({
  ariaLabel,
  initialValue,
  min,
  max,
  step,
  onCommit,
  onCancel,
  align,
  enterMove,
  onRemovedWhileFocused,
}: NumberCellEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // 変更(1.0 前の最終チェック FC-17): 初期値は type="number" が表示できる半角の数値表記に直します('1,234' / '１２' の
  //   文字列の値 → '1234' / '12')。数値に直せない初期値(英字や空白から打ち始めた / 数値でない文字列の値)は text で開き、
  //   その文字をそのまま見せます(type="number" は value に入れると空に見えるのに、確定ではその文字が書かれていた。
  //   Chrome は console に「cannot be parsed」の警告も出していた)。
  const [start] = useState(() => {
    if (initialValue === '' || isNumberInputPrefix(initialValue)) {
      return { text: initialValue, textMode: initialValue !== '' };
    }
    const numberText = toNumberInputText(initialValue);
    return numberText !== null ? { text: numberText, textMode: false } : { text: initialValue, textMode: true };
  });
  const [draftValue, setDraftValue] = useState(start.text);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // 追加(数値の打ち始め): 初期値が数値の書き始め("-" / "+" / "." など)のセッションは type="text" で開きます。
  //   type="number" の input は value に途中の数値を入れると空にしてしまい、セルを選んで「-5」と打つと「5」になる
  //   (マイナスが落ちる)ため。text でもスマホは数字のキーボード(inputMode="decimal")です。確定する値は打った文字列の
  //   まま(列のパーサが全角や 3 桁区切りも数値に直す。読めない文字列は貼り付けと同じくそのまま = 検査があれば印 /
  //   reject)で、書き始めのまま(「-」だけ等)なら空文字にします。このセッションでは ArrowUp / ArrowDown のステップは
  //   ありません。セッションの途中で type は切り替えません(キャレットが飛ぶため)。
  const textMode = start.textMode;
  const commitValue = textMode && isNumberInputPrefix(normalizeNumberText(draftValue)) ? '' : draftValue;

  // 追加(1.0.1 / AP-12): フォーカスを持ったまま外れたら(グリッドごとアンマウント)打っていた値を確定します。
  useCommitIfRemovedWhileFocused([inputRef], commitValue, onRemovedWhileFocused);

  // マウント時(= 編集セッション開始時)に自動フォーカスします。
  //   ※ type="number" は setSelectionRange 非対応(例外を投げるブラウザあり)のため focus のみ。text のときは
  //   打った文字の後ろへキャレットを置きます。
  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    if (input.type === 'text') {
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }
  }, []);

  return (
    <>
      <input
        ref={inputRef}
        type={textMode ? 'text' : 'number'}
        inputMode={textMode ? 'decimal' : undefined}
        value={draftValue}
        min={textMode ? undefined : min}
        max={textMode ? undefined : max}
        step={textMode ? undefined : step}
        onChange={(event) => {
          setDraftValue(event.target.value);
          // 再入力でエラー表示を解除します。
          setErrorMessage(null);
        }}
        onKeyDown={createEditorKeyDownHandler({
          value: commitValue,
          onCommit,
          onCancel,
          onRejected: setErrorMessage,
          enterMove,
        })}
        onBlur={() => {
          const result = onCommit(commitValue);
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
        style={align ? { textAlign: align } : undefined}
      />
      {errorMessage !== null ? (
        <CellEditorErrorBubble message={errorMessage} />
      ) : null}
    </>
  );
}

export default NumberCellEditor;