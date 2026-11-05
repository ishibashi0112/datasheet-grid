// 追加(editor: custom): カスタムエディタの薄い箱です。consumer の render(ctx) の返り値を
//   そのまま編集オーバーレイ(.ssg-cell-editor wrapper)内に描画します。
//   フォーカス管理(マウント時 focus 等)とキーバインド(Enter / Tab / Esc)は consumer 側の
//   責務で、確定 / キャンセルは ctx.commit / ctx.cancel を呼びます。
// 変更(1.0 前の最終チェック FC-11): この箱は編集セッションごとに作り直されます(CellEditorLayer の key={sessionId})。
//   セッションが終わった(確定 / 取消 / 別のセルの編集が始まった)後に、前のセッションの ctx.commit / ctx.cancel が呼ばれても
//   何もしません(サーバーで検査してから commit する作りで、取消のあとに始めた別のセルの編集へ遅れて届いた値が書かれていた)。
import { useEffect, useState, type ReactNode } from 'react';
import type { CellEditorContext } from '../model/gridTypes';

// セッションが続いているか(マウント中か)の旗です。ref ではなく閉包で持ちます(ctx の関数はレンダー中に render(ctx) へ
//   渡すため、ref を読む関数にすると React Compiler の lint が「レンダー中の ref の参照」とみなす)。
const createSessionGuard = () => {
  let alive = true;
  return {
    isAlive: () => alive,
    start: () => {
      alive = true;
    },
    end: () => {
      alive = false;
    },
  };
};

type CustomCellEditorProps<T> = {
  render: (ctx: CellEditorContext<T>) => ReactNode;
  context: CellEditorContext<T>;
};

export function CustomCellEditor<T>({
  render,
  context,
}: CustomCellEditorProps<T>) {
  const [guard] = useState(createSessionGuard);
  useEffect(() => {
    guard.start();
    return guard.end;
  }, [guard]);
  const { commit, cancel } = context;
  const sessionContext: CellEditorContext<T> = {
    ...context,
    commit: (value, direction) => (guard.isAlive() ? commit(value, direction) : { status: 'noop' }),
    cancel: () => {
      if (guard.isAlive()) {
        cancel();
      }
    },
  };
  return <>{render(sessionContext)}</>;
}

export default CustomCellEditor;