// 追加(差し込み式 段階 2): IME オンのままの直接入力(imeDirectInput prop)の機能です。透明な入力受けのコントローラ(core)と、
//   入力してよいセルの判定・編集の初期値の決定(全角数値)をシェルへ渡します。機能セットに無い構成では imeDirectInput を
//   渡しても無効(入力受けを描画しない = 従来の既定と同じ)、開発時に警告します。
import { createImeInputController } from '@ishibashi0112/spreadsheet-grid-core/controllers/imeInputController';
import { canStartImeEdit, resolveImeEditText } from '@ishibashi0112/spreadsheet-grid-core/logic/imeInput';
import type { ReactGridFeatures } from './types';

export const imeDirectInputFeature: NonNullable<ReactGridFeatures['imeDirectInput']> = {
  createImeInputController,
  canStartImeEdit,
  resolveImeEditText,
};