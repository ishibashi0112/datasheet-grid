// 追加(editor 基盤): 組み込みエディタ共有のキーバインド生成です。
//   Enter = down commit(enter-move ②: editorEnterMove で 'up'/'right'/'left'/'none' へ変更可)/
//   Tab = 左右 commit / Escape = cancel。
//   IME 変換中(isComposing)の Enter / Escape / Tab は IME の確定・取り消し・候補操作なので
//   セル編集の commit / cancel には使いません(日本語入力で変換確定の Enter がセル確定まで
//   巻き込む誤動作の防止)。変換確定後のキーは isComposing=false で届くため通常どおり動きます。
//   変更(FC-13): Safari は変換を確定する Enter を isComposing=false / keyCode 229 で送るため、229 も変換中とみなします。
import type { KeyboardEvent } from 'react';
import type {
  EditorCommitDirection,
  EditorCommitResult,
  EditorEnterMove,
  GridTextEditorEnterKey,
} from '../model/gridTypes';
import { isImeComposingKeyEvent } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/domGuards';

// 追加(enter-move ②): editorEnterMove('none' 含む)を commit へ渡す方向へ解決します。
//   'none' は「移動しない」= direction 省略(undefined)です。select エディタも共用します。
export const resolveEnterDirection = (
  enterMove: EditorEnterMove | undefined,
): EditorCommitDirection | undefined => {
  const move = enterMove ?? 'down';
  return move === 'none' ? undefined : move;
};

type CreateEditorKeyDownHandlerArgs = {
  // 確定時に commit へ渡すドラフト値です(レンダーごとに現在値の閉包で作り直します)。
  value: unknown;
  // 変更(validation): commit の結果を返せます(reject 列の検証 NG = rejected)。
  //   テスト用モック等の void 戻りも許容します。
  onCommit: (
    value: unknown,
    direction?: EditorCommitDirection,
  ) => EditorCommitResult | void;
  onCancel: () => void;
  // 追加(validation): rejected 時に呼びます(エディタ側のエラー表示用。編集は継続)。
  onRejected?: (message: string) => void;
  // 追加(enter-move ②): Enter 確定後の移動先です(未指定 = 'down' で従来どおり)。
  enterMove?: EditorEnterMove;
  // 追加(dogfood DF-13): Home / End もブラウザの既定の動作(グリッドのスクロール)を止めます。文字の入力欄(text / number)では
  //   Home / End はカーソルの移動なので止めず、日付の入力欄(type="date")だけで true にします。
  blockHomeEnd?: boolean;
  // 追加(段階 2 DU-14): 複数行のエディタ(textarea)の Enter。'commit' は Enter で確定 / Alt・Ctrl・⌘+Enter で改行、
  //   'newline' は Enter(Shift / Alt 付きも)で改行 / Ctrl・⌘+Enter で確定。未指定は 1 行の入力欄(Enter で確定)。
  multilineEnter?: GridTextEditorEnterKey;
  // 追加(段階 2 DU-14): 修飾キー付きの Enter で改行を入れる処理(textarea の既定では入らないため。エディタが渡す)。
  onInsertNewline?: (element: HTMLTextAreaElement) => void;
};

// 追加(段階 2 DU-14): 複数行のエディタで、この Enter が改行か(false なら確定)。
export const isMultilineNewlineEnter = (
  event: { altKey: boolean; ctrlKey: boolean; metaKey: boolean },
  enterKey: GridTextEditorEnterKey,
): boolean => {
  const commandKey = event.ctrlKey || event.metaKey;
  return enterKey === 'newline' ? !commandKey : event.altKey || commandKey;
};

// 追加(dogfood DF-13): 1 行の入力欄では PageUp / PageDown(と日付の Home / End)は入力欄の操作にならず、ブラウザが
//   グリッドをスクロールしてエディタが画面の外へ出ていました。編集中はこれらのキーでスクロールしません(編集は続く)。
export const isEditorScrollKey = (key: string, blockHomeEnd: boolean): boolean =>
  key === 'PageUp' || key === 'PageDown' || (blockHomeEnd && (key === 'Home' || key === 'End'));

// 修正(段階 2 の見直し): 複数行の入力欄(<textarea>)の中がその向きへまだスクロールできるか。できるときは PageUp / PageDown を
//   入力欄に任せます(長い文を 1 画面ずつ動ける。これまでは止めていた)。スクロールしきったときと中がスクロールしないときは
//   これまでどおり止めます(グリッドがスクロールしてエディタが画面の外へ出ないように)。
const canTextAreaScroll = (element: HTMLTextAreaElement, key: string): boolean =>
  key === 'PageDown'
    ? element.scrollTop + element.clientHeight < element.scrollHeight - 1
    : key === 'PageUp' && element.scrollTop > 0;

export const createEditorKeyDownHandler =
  ({
    value,
    onCommit,
    onCancel,
    onRejected,
    enterMove,
    blockHomeEnd = false,
    multilineEnter,
    onInsertNewline,
  }: CreateEditorKeyDownHandlerArgs) =>
  (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    if (isImeComposingKeyEvent(event.nativeEvent)) {
      return;
    }

    if (isEditorScrollKey(event.key, blockHomeEnd)) {
      if (!(event.currentTarget instanceof HTMLTextAreaElement && canTextAreaScroll(event.currentTarget, event.key))) {
        event.preventDefault();
      }
      return;
    }

    const commitWith = (direction?: EditorCommitDirection) => {
      const result = onCommit(value, direction);
      if (result && result.status === 'rejected') {
        onRejected?.(result.message);
      }
    };

    if (event.key === 'Enter' && multilineEnter !== undefined && isMultilineNewlineEnter(event, multilineEnter)) {
      // 素の Enter / Shift+Enter は textarea が自分で改行を入れる。修飾キー付きは入らないので代わりに入れる。
      if (event.altKey || event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (event.currentTarget instanceof HTMLTextAreaElement) {
          onInsertNewline?.(event.currentTarget);
        }
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      // 変更(enter-move ②): 方向は editorEnterMove に従います(既定 'down')。
      commitWith(resolveEnterDirection(enterMove));
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      commitWith(event.shiftKey ? 'left' : 'right');
    }
  };