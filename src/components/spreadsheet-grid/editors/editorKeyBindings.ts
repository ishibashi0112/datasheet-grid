// 追加(editor 基盤): 組み込みエディタ共有のキーバインド生成です。
//   Enter = down commit / Tab = 左右 commit / Escape = cancel。
//   IME 変換中(isComposing)の Enter / Escape / Tab は IME の確定・取り消し・候補操作なので
//   セル編集の commit / cancel には使いません(日本語入力で変換確定の Enter がセル確定まで
//   巻き込む誤動作の防止)。変換確定後のキーは isComposing=false で届くため通常どおり動きます。
import type { KeyboardEvent } from 'react';
import type {
  EditorCommitDirection,
  EditorCommitResult,
} from '../model/gridTypes';

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
};

export const createEditorKeyDownHandler =
  ({ value, onCommit, onCancel, onRejected }: CreateEditorKeyDownHandlerArgs) =>
  (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    const commitWith = (direction?: EditorCommitDirection) => {
      const result = onCommit(value, direction);
      if (result && result.status === 'rejected') {
        onRejected?.(result.message);
      }
    };

    if (event.key === 'Enter') {
      event.preventDefault();
      commitWith('down');
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