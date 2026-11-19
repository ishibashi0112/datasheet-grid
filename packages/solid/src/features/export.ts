// エクスポート(命令的 API の exportCsv / downloadCsv / getExportData)の機能です。中身は core の部品だけ(React 版と同じ)。
import { createExportCommands } from '@ishibashi0112/spreadsheet-grid-core/internal/engine/exportCommands';
import type { GridFeature, GridFeatureParts } from './types';

export const exportFeature = {
  createExportCommands,
} satisfies GridFeatureParts<'export'> as unknown as GridFeature<'export'>;
