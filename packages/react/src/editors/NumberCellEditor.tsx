// 追加(editor: number): 数値エディタです(<input type="number">)。
//   min / max / step はネイティブ属性へ反映し、ArrowUp/Down のステップ・不正文字の抑止を
//   ブラウザに任せます。commit 値はドラフト文字列のまま渡し、書き込み側の共通規則
//   (logic/editorValues.ts の number 既定パーサ)で数値 / null へ変換します。
// 変更(validation): reject 列の検証 NG ではエラーバブル表示 + 編集継続、blur の rejected は
//   cancel へフォールバックします(TextCellEditor と同じ規則)。
// 変更(数値の打ち始め): 「-」「+」「.」のキーで始めた編集だけは type="text" で開きます(下の textMode)。
// 変更(FC-17): 数値に直せない初期値(英字から打ち始めた等)も type="text" で開きます。
import { useEffect, useRef, useState } from 'react';
import { useIsomorphicLayoutEffect } from '../hooks/useController';
import type {
  EditorCommitDirection,
  EditorCommitResult,
  EditorEnterMove,
} from '../model/gridTypes';
import { createEditorKeyDownHandler } from './editorKeyBindings';
import { CellEditorErrorBubble } from './CellEditorErrorBubble';
import { useTopAlignedInput } from './useTopAlignedInput';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
import {
  resolveNumberEditorCommitValue,
  resolveNumberEditorStart,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorStart';

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
  // 追加(1.3.0 / S7-03 / S8-04): 打ちかけを確定する関数を預ける先(CellEditorLayer から。core editController の registerDraftFlush)。
  onRegisterFlush?: ((flush: (() => void) | null) => void) | undefined;
  align?: 'left' | 'center' | 'right';
  // 追加(enter-move ②): Enter 確定後の移動先です(未指定 = 'down')。
  enterMove?: EditorEnterMove;
  // 追加(1.2.0): セルの高さと、上にそろえて描かれているか(背の高い行の 1 行のエディタの文字をセルの 1 行目にそろえる)。
  cellHeight?: number;
  alignTop?: boolean;
};

export function NumberCellEditor({
  ariaLabel,
  initialValue,
  min,
  max,
  step,
  onCommit,
  onCancel,
  onRegisterFlush,
  align,
  enterMove,
  cellHeight = 0,
  alignTop = false,
}: NumberCellEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useTopAlignedInput(inputRef, alignTop, cellHeight);
  // 変更(1.0 前の最終チェック FC-17): 初期値は type="number" が表示できる半角の数値表記に直します('1,234' / '１２' の
  //   文字列の値 → '1234' / '12')。数値に直せない初期値(英字や空白から打ち始めた / 数値でない文字列の値)は text で開き、
  //   その文字をそのまま見せます(type="number" は value に入れると空に見えるのに、確定ではその文字が書かれていた。
  //   Chrome は console に「cannot be parsed」の警告も出していた)。
  //   変更(Solid 版 段階 1-2): 決め方は core logic/editorStart の resolveNumberEditorStart(Solid 版と共用)。
  const [start] = useState(() => resolveNumberEditorStart(initialValue));
  const [draftValue, setDraftValue] = useState(start.text);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // 追加(数値の打ち始め): 初期値が数値の書き始め("-" / "+" / "." など)のセッションは type="text" で開きます。
  //   type="number" の input は value に途中の数値を入れると空にしてしまい、セルを選んで「-5」と打つと「5」になる
  //   (マイナスが落ちる)ため。text でもスマホは数字のキーボード(inputMode="decimal")です。確定する値は打った文字列の
  //   まま(列のパーサが全角や 3 桁区切りも数値に直す。読めない文字列は貼り付けと同じくそのまま = 検査があれば印 /
  //   reject)で、書き始めのまま(「-」だけ等)なら空文字にします。このセッションでは ArrowUp / ArrowDown のステップは
  //   ありません。セッションの途中で type は切り替えません(キャレットが飛ぶため)。
  const textMode = start.textMode;
  const commitValue = resolveNumberEditorCommitValue(draftValue, textMode);
  // 追加(1.3.0 / S7-03 / S8-04): 今の打ちかけを確定する関数をグリッドへ預けます(描くたびに預け直す。text エディタと同じ)。
  useIsomorphicLayoutEffect(() => {
    onRegisterFlush?.(() => {
      onCommit(commitValue);
    });
  });

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