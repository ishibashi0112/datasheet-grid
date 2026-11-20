// サーバーサイドの行モデル(SSRM。機能 features/serverSide)のコントローラを Solid へつなぎます。React 版の
//   hooks/useServerSideRowModel.ts(+ features/serverSide.tsx の useServerSide)にあたるものです。中身は core の
//   controllers/serverSideRowModel(ブロック単位の取得とキャッシュ・query の変化で捨てて取り直す・取得の失敗と再試行・
//   書き戻しの楽観更新とロールバック)。
//   - 引数はレイアウトの段(描画の段の effect)で毎回渡す(React 版の useController と同じ)。
//   - 行のモデル / 件数 / 失敗の状態は、コントローラのスナップショット(外部 store)を signal にして読む。
import { createMemo, untrack } from 'solid-js';
import {
  createServerSideRowModel,
  type ServerSideRowModelArgs,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/serverSideRowModel';
import { connectController } from './controller';
import { createExternalStoreSignal } from './externalStore';

export function createServerSide<T>(args: () => ServerSideRowModelArgs<T>) {
  const controller = createServerSideRowModel<T>(untrack(args));
  connectController(controller, args, 'render');
  const snapshot = createExternalStoreSignal(controller);
  return {
    rowModel: createMemo(() => snapshot().rowModel),
    rowCount: () => snapshot().rowCount,
    loadError: createMemo(() => snapshot().loadError),
    writeError: createMemo(() => snapshot().writeError),
    isRowLoaded: controller.isRowLoaded,
    requestRange: controller.requestRange,
    refresh: controller.refresh,
    retryFailedBlocks: controller.retryFailedBlocks,
    // 書き戻し先(dataSource.updateRows)があるか。無い間はシェルがすべてのセルを編集できないようにする。
    canUpdateRows: createMemo(() => args().dataSource?.updateRows !== undefined),
    applyCellEdits: controller.applyCellEdits,
  };
}

export type ServerSide<T> = ReturnType<typeof createServerSide<T>>;