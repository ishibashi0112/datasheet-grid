// フィルハンドル(fillHandle prop)の機能です。中身は core の controllers/fillHandleController の接続と位置の計算
//   (primitives/fillHandle)と、各ペインのハンドル / 点線 / 埋めたあとのボタン、メニューと値のツールチップの部品
//   (view/FillHandleLayer)です(React 版と同じ)。機能セットに無い構成では何も描かず、prop は何もしません(React 版の代役と同じ)。
import { DEFAULT_FILL_HANDLE_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { createFillHandle } from '../primitives/fillHandle';
import { FillHandleLayer, FillHandlePortals } from '../view/FillHandleLayer';
import type { GridFeature, GridFeatureParts } from './types';

export const fillHandleFeature = {
  createFillHandle,
  FillHandleLayer,
  FillHandlePortals,
  // この機能だけが使う文言の既定(シェルが本体の既定に重ねる)。
  localeText: DEFAULT_FILL_HANDLE_LOCALE_TEXT,
} satisfies GridFeatureParts<'fillHandle'> as unknown as GridFeature<'fillHandle'>;