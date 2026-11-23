// 追加(editor: custom): カスタムエディタの薄い箱です。consumer の render(ctx) の返り値を
//   そのまま編集オーバーレイ(.ssg-cell-editor wrapper)内に描画します。
//   フォーカス管理(マウント時 focus 等)とキーバインド(Enter / Tab / Esc)は consumer 側の
//   責務で、確定 / キャンセルは ctx.commit / ctx.cancel を呼びます。
// 変更(1.0 前の最終チェック FC-11): この箱は編集セッションごとに作り直されます(CellEditorLayer の key={sessionId})。
//   セッションが終わった(確定 / 取消 / 別のセルの編集が始まった)後に、前のセッションの ctx.commit / ctx.cancel が呼ばれても
//   何もしません(サーバーで検査してから commit する作りで、取消のあとに始めた別のセルの編集へ遅れて届いた値が書かれていた)。
// 変更(1.4.1 / 2026-11-09 実アプリの総点検 AP-11): グリッドの中を押してグリッドが編集を終えた(onBlur で ctx.commit / ctx.cancel を
//   呼ばない作りで、エディタが開いたまま残っていた)後に届いた ctx.commit は、編集していたセルへ書きます(core editController の
//   registerLateCommitReceiver で受け取る関数。onBlur でサーバーの検査を待ってから確定する作りの値を捨てない)。
// 変更(1.3.0 / Solid 版の品質の段 2 S3-21): 編集中の位置に行が無い間(グループの先頭の行の編集中に上のグループへ行が足され、
//   編集中の位置が一瞬グループ行を指すときなど)も外さず、最後の ctx のまま描きます。これまでは CellEditorLayer がその間だけ
//   描かず、利用側のエディタが作り直されて打ちかけが消え、開いたときの値に戻っていた。
import { useEffect, useState, type ReactNode } from 'react';
import { useIsomorphicLayoutEffect } from '../hooks/useController';
import type { CellEditorContext } from '../model/gridTypes';
import type {
  LateEditCommit,
  LateEditCommitReceiver,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/editController';

// セッションが続いているか(マウント中か)の旗です。ref ではなく閉包で持ちます(ctx の関数はレンダー中に render(ctx) へ
//   渡すため、ref を読む関数にすると React Compiler の lint が「レンダー中の ref の参照」とみなす)。
//   追加(1.4.1 / AP-11): グリッドが編集を終えたときに渡される、遅れて届く確定の書き先(late)も持ちます。
const createSessionGuard = () => {
  let alive = true;
  let late: LateEditCommit | null = null;
  const receiveLate: LateEditCommitReceiver = (commit) => {
    late = commit;
  };
  return {
    isAlive: () => alive,
    start: () => {
      alive = true;
    },
    end: () => {
      alive = false;
    },
    receiveLate,
    // グリッドが終えた後の確定 / 取り消し(終えていなければ null)。取り消しは書き先を捨てる。
    takeLate: (): LateEditCommit | null => {
      const commit = late;
      late = null;
      return commit;
    },
    hasLate: () => late !== null,
  };
};

type CustomCellEditorProps<T> = {
  render: (ctx: CellEditorContext<T>) => ReactNode;
  // 編集中の位置に行が無い間は null(最後の ctx のまま描く)。
  context: CellEditorContext<T> | null;
  // 追加(1.3.0 / S7-03 / S8-04): 打ちかけを確定する関数を預ける先。custom は打ちかけを利用側が持つので預けません(null。前の
  //   エディタの関数を残さない)。編集していた行が絞り込みから外れたら、blur で ctx.commit していなければ取り消しです。
  onRegisterFlush?: ((flush: (() => void) | null) => void) | undefined;
  // 追加(1.4.1 / AP-11): 遅れて届く ctx.commit の受け取り口を登録する先(core editController の registerLateCommitReceiver)。
  onRegisterLateCommit?: ((receiver: LateEditCommitReceiver) => () => void) | undefined;
};

export function CustomCellEditor<T>({
  render,
  context,
  onRegisterFlush,
  onRegisterLateCommit,
}: CustomCellEditorProps<T>) {
  const [guard] = useState(createSessionGuard);
  // 最後の ctx(行・位置・値が変わったときだけ持ち直す = 描き直しのたびには持ち直さない)。
  const [held, setHeld] = useState<CellEditorContext<T> | null>(context);
  if (context !== null && (held === null || !isSameEditorContext(held, context))) {
    setHeld(context);
  }
  useIsomorphicLayoutEffect(() => {
    onRegisterFlush?.(null);
  }, [onRegisterFlush]);
  useIsomorphicLayoutEffect(() => onRegisterLateCommit?.(guard.receiveLate), [onRegisterLateCommit, guard]);
  useEffect(() => {
    guard.start();
    return guard.end;
  }, [guard]);
  const current = context ?? held;
  if (current === null) {
    return null;
  }
  const { commit, cancel } = current;
  const sessionContext: CellEditorContext<T> = {
    ...current,
    commit: (value, direction) => {
      // グリッドが終えた後(エディタがまだ外れていない間も)は、編集していたセルへ書く(1 回だけ)。
      if (guard.hasLate()) {
        return guard.takeLate()?.(value) ?? { status: 'noop' };
      }
      return guard.isAlive() ? commit(value, direction) : { status: 'noop' };
    },
    cancel: () => {
      if (guard.hasLate()) {
        guard.takeLate();
        return;
      }
      if (guard.isAlive()) {
        cancel();
      }
    },
  };
  return <>{render(sessionContext)}</>;
}

const isSameEditorContext = <T,>(a: CellEditorContext<T>, b: CellEditorContext<T>): boolean =>
  a.row === b.row &&
  a.rowIndex === b.rowIndex &&
  a.sourceRowIndex === b.sourceRowIndex &&
  Object.is(a.rowKey, b.rowKey) &&
  a.colIndex === b.colIndex &&
  a.column === b.column &&
  Object.is(a.value, b.value) &&
  a.initialText === b.initialText &&
  a.align === b.align;

export default CustomCellEditor;