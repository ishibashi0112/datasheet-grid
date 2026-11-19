// 行ドラッグによる並べ替え(enableRowDrag / isRowDraggable / canDropRow / rowDragMotion)の機能です。中身は core の
//   controllers/rowDragController の接続(primitives/rowDrag)と、ハンドル列のセルの部品(view/RowDragHandle)です
//   (React 版と同じ)。行の移動の確定と命令的 API の moveRow はシェルに置きます(ドラッグなしでも使える)。機能セットに
//   無い構成では enableRowDrag を false として扱います(createSpreadsheetGrid。ハンドル列もガイド線も出ない)。
import { DEFAULT_ROW_DRAG_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { createRowDrag } from '../primitives/rowDrag';
import { RowDragHandle } from '../view/RowDragHandle';
import type { GridFeature, GridFeatureParts } from './types';

export const rowDragFeature = {
  createRowDrag,
  RowDragHandle,
  // この機能だけが使う文言の既定(シェルが本体の既定に重ねる)。
  localeText: DEFAULT_ROW_DRAG_LOCALE_TEXT,
} satisfies GridFeatureParts<'rowDrag'> as unknown as GridFeature<'rowDrag'>;