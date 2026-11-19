// 列見出しのドラッグによる列の並べ替え(onColumnsChange があるときの見出しの grip / ドロップの縦線 / live 方式の
//   columnDragMotion)の機能です。中身は core の controllers/columnHeaderDragController の接続です(React 版と同じ)。機能セットに
//   無い構成では grip も縦線も出しません(onColumnsChange が無いときと同じ見出し。React 版の代役と同じ)。
import { createColumnReorder } from '../primitives/columnReorder';
import type { GridFeature, GridFeatureParts } from './types';

export const columnReorderFeature = {
  createColumnReorder,
} satisfies GridFeatureParts<'columnReorder'> as unknown as GridFeature<'columnReorder'>;