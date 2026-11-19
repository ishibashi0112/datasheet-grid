// 列幅の自動調整(列の境界のダブルクリック・autoSizeColumns prop・列メニューの「この列 / すべての列の幅を自動調整」)の
//   機能です。中身は計測の時間分割ランナー(core controllers/columnAutosizeRunner)の接続です(React 版と同じ)。機能セットに
//   無い構成では、境界のダブルクリックは通常のリサイズ、autoSizeColumns は false 扱い(createSpreadsheetGrid)です。
import { createColumnAutosize } from '../primitives/columnAutosize';
import type { GridFeature, GridFeatureParts } from './types';

export const columnAutosizeFeature = {
  createColumnAutosize,
} satisfies GridFeatureParts<'columnAutosize'> as unknown as GridFeature<'columnAutosize'>;