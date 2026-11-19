// IME オンのままの直接入力(imeDirectInput prop)の機能です。透明な入力受けのコントローラ(core)と、入力してよいセルの判定・
//   編集の初期値の決定(全角の数字は半角へ)をシェルへ渡します(React 版と同じ)。機能セットに無い構成では imeDirectInput を
//   渡しても無効(入力受けを描かない = 既定と同じ)です。
import { createImeInputController } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/imeInputController';
import { canStartImeEdit, resolveImeEditText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/imeInput';
import type { GridFeature, GridFeatureParts } from './types';

export const imeDirectInputFeature = {
  createImeInputController,
  canStartImeEdit,
  resolveImeEditText,
} satisfies GridFeatureParts<'imeDirectInput'> as unknown as GridFeature<'imeDirectInput'>;