// 追加(editor: custom): カスタムエディタの薄い箱です。consumer の render(ctx) の返り値を
//   そのまま編集オーバーレイ(.ssg-cell-editor wrapper)内に描画します。
//   フォーカス管理(マウント時 focus 等)とキーバインド(Enter / Tab / Esc)は consumer 側の
//   責務で、確定 / キャンセルは ctx.commit / ctx.cancel を呼びます。
import type { ReactNode } from 'react';
import type { CellEditorContext } from '../model/gridTypes';

type CustomCellEditorProps<T> = {
  render: (ctx: CellEditorContext<T>) => ReactNode;
  context: CellEditorContext<T>;
};

export function CustomCellEditor<T>({
  render,
  context,
}: CustomCellEditorProps<T>) {
  return <>{render(context)}</>;
}

export default CustomCellEditor;