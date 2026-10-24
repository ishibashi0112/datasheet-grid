// 追加(差し込み式 段階 2): エクスポート(命令的 API の exportCsv / downloadCsv / getExportData)の機能です。
//   中身は core の engine/exportCommands(gridApi から移したもの)で、描画の部品はありません。機能セットに無い構成では
//   3 つのメソッドは空を返す / 何もしない代役になり、呼ばれたら開発時に 1 回だけ警告します。
import { createExportCommands } from '@ishibashi0112/spreadsheet-grid-core/engine/exportCommands';
import type { ReactGridFeatures } from './types';

export const exportFeature: NonNullable<ReactGridFeatures['export']> = {
  createExportCommands,
};