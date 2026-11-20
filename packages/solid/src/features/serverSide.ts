// サーバーサイドの行モデル(SSRM。dataSource)の機能です。React 版の features/serverSide.tsx と同じ中身:
//   - エンジン側: 書き戻しのセル単位の保存状態の表示(core controllers/saveStatusController)。
//   - シェル側: 行モデルのコントローラ(core controllers/serverSideRowModel)の接続(primitives/serverSide)と、内蔵の
//     エラーバー(取得の失敗の再試行 / 保存の失敗。view/GridServerSideErrorBars)、読み込み中の行(view/GridBodySkeletonRow)。
//   query の組み立て(rowPipeline.resolveServerSideQuery)と debounce(engine.serverSideQueryStore)は小さく、clientSide の
//   空の query も同じ経路なのでシェルに残す(React 版と同じ)。
//   機能セットに無い構成では dataSource を外して clientSide として扱う(createSpreadsheetGrid)。
import { createSaveStatusController } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/saveStatusController';
import { DEFAULT_SERVER_SIDE_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { createServerSide } from '../primitives/serverSide';
import { GridServerSideErrorBars } from '../view/GridServerSideErrorBars';
import { GridBodySkeletonRow } from '../view/GridBodySkeletonRow';
import type { GridFeature, GridFeatureParts } from './types';

export const serverSideFeature = {
  createSaveStatusController,
  createServerSide,
  ErrorBars: GridServerSideErrorBars,
  BodySkeletonRow: GridBodySkeletonRow,
  localeText: DEFAULT_SERVER_SIDE_LOCALE_TEXT,
} satisfies GridFeatureParts<'serverSide'> as unknown as GridFeature<'serverSide'>;