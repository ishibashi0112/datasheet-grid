// 追加(editor 基盤): 組み込みエディタ共有のキーバインド生成です。
//   Enter = down commit(enter-move ②: editorEnterMove で 'up'/'right'/'left'/'none' へ変更可)/
//   Tab = 左右 commit / Escape = cancel。
//   IME 変換中(isComposing)の Enter / Escape / Tab は IME の確定・取り消し・候補操作なので
//   セル編集の commit / cancel には使いません(日本語入力で変換確定の Enter がセル確定まで
//   巻き込む誤動作の防止)。変換確定後のキーは isComposing=false で届くため通常どおり動きます。
//   変更(FC-13): Safari は変換を確定する Enter を isComposing=false / keyCode 229 で送るため、229 も変換中とみなします。
import type { KeyboardEvent } from 'react';
import {
  handleEditorKeyDown,
  type EditorKeyDownOptions,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorKeys';

// 変更(Solid 版 段階 0-4): 判断(IME の変換中 / スクロールのキー / 複数行の Enter / Enter・Tab・Escape)は core
//   logic/editorKeys(Solid 版と共用)へ移しました。ここは React の合成イベントを構造的な型へ詰め替えるだけです。
//   IME の変換中かは nativeEvent(isComposing / keyCode)で見ます。
export {
  isEditorScrollKey,
  isMultilineNewlineEnter,
  resolveEnterDirection,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorKeys';

export const createEditorKeyDownHandler =
  (options: EditorKeyDownOptions) =>
  (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void =>
    handleEditorKeyDown(
      {
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
        keyCode: event.nativeEvent.keyCode,
        currentTarget: event.currentTarget,
        preventDefault: () => event.preventDefault(),
      },
      options,
    );