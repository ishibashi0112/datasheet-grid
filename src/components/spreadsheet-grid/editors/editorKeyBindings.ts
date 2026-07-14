// 追加(editor 基盤): 組み込みエディタ共有のキーバインド生成です。
//   Enter = down commit / Tab = 左右 commit / Escape = cancel。
//   IME 変換中(isComposing)の Enter / Escape / Tab は IME の確定・取り消し・候補操作なので
//   セル編集の commit / cancel には使いません(日本語入力で変換確定の Enter がセル確定まで
//   巻き込む誤動作の防止)。変換確定後のキーは isComposing=false で届くため通常どおり動きます。
import type { KeyboardEvent } from 'react';
import type { EditorCommitDirection } from '../model/gridTypes';

type CreateEditorKeyDownHandlerArgs = {
  // 確定時に commit へ渡すドラフト値です(レンダーごとに現在値の閉包で作り直します)。
  value: unknown;
  onCommit: (value: unknown, direction?: EditorCommitDirection) => void;
  onCancel: () => void;
};

export const createEditorKeyDownHandler =
  ({ value, onCommit, onCancel }: CreateEditorKeyDownHandlerArgs) =>
  (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit(value, 'down');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      onCommit(value, event.shiftKey ? 'left' : 'right');
    }
  };