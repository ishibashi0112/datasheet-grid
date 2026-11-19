// custom エディタの薄い箱。利用側の render(ctx) の戻り値をそのまま編集の枠(.ssg-cell-editor)の中に描きます。React 版の
//   editors/CustomCellEditor.tsx にあたります。フォーカス(開いたときの focus など)とキー(Enter / Tab / Esc)は利用側が受け持ち、
//   確定 / 取り消しは ctx.commit / ctx.cancel を呼びます。
//   - render は編集のセッションごとに 1 回だけ呼びます(React 版は描き直しのたびに呼ぶ)。ctx の行・位置・値は読んだときに引く
//     ので、JSX の中で読めば追従します(renderCell と同じ決め方)。
//   - セッションが終わった(確定 / 取り消し / 別のセルの編集が始まった)後に、前のセッションの ctx.commit / ctx.cancel が
//     呼ばれても何もしません(サーバーで検査してから commit する作りで、取り消しのあとに始めた別のセルの編集へ遅れて届いた値が
//     書かれていた。React 版の FC-11 と同じ)。
import { onCleanup, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { CellEditorContext } from '@ishibashi0112/spreadsheet-grid-core';
import type { SolidGridTypes } from '../model/gridTypes';

type CustomCellEditorProps<T> = {
  render: (ctx: CellEditorContext<T, SolidGridTypes>) => JSX.Element;
  context: CellEditorContext<T, SolidGridTypes>;
};

export function CustomCellEditor<T>(props: CustomCellEditorProps<T>) {
  let alive = true;
  onCleanup(() => {
    alive = false;
  });
  // ctx の読んだときに引く項目(getter)はそのまま写し、commit / cancel だけセッションの間だけ効く形に差し替えます。
  const context = untrack(() => props.context);
  const sessionContext = Object.defineProperties({}, Object.getOwnPropertyDescriptors(context)) as CellEditorContext<
    T,
    SolidGridTypes
  >;
  sessionContext.commit = (value, direction) => (alive ? context.commit(value, direction) : { status: 'noop' });
  sessionContext.cancel = () => {
    if (alive) {
      context.cancel();
    }
  };
  return <>{untrack(() => props.render(sessionContext))}</>;
}