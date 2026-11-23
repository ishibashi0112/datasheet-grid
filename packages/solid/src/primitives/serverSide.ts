// サーバーサイドの行モデル(SSRM。機能 features/serverSide)のコントローラを Solid へつなぎます。React 版の
//   hooks/useServerSideRowModel.ts(+ features/serverSide.tsx の useServerSide)にあたるものです。中身は core の
//   controllers/serverSideRowModel(ブロック単位の取得とキャッシュ・query の変化で捨てて取り直す・取得の失敗と再試行・
//   書き戻しの楽観更新とロールバック)。
//   - 引数はレイアウトの段(描画の段の effect)で毎回渡す(React 版の useController と同じ)。
//   - 最初の update より前に来た描く窓の知らせ(requestRange)は控えておき、最初の update の直後に渡す。React 版は
//     update(レイアウト effect)→ requestRange(passive effect)の順。Solid のマウントでは最初の update が onSettled まで遅れ
//     (primitives/controller.ts)、シェルの effect がそれより先に requestRange を呼ぶ。そのまま渡すと、最初の update の
//     query の同期(キャッシュと取得の予約を捨てる)に消され、窓が変わらない表(行が少なく、測った後も窓が同じ)は一度も
//     取得しないまま読み込み中の行が残っていた。
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
  let updated = false;
  let pendingRange: { start: number; end: number } | null = null;
  connectController<ServerSideRowModelArgs<T>>(
    {
      update: (next) => {
        controller.update(next);
        if (updated) {
          return;
        }
        updated = true;
        const range = pendingRange;
        pendingRange = null;
        if (range) {
          controller.requestRange(range.start, range.end);
        }
      },
      dispose: controller.dispose,
    },
    args,
    'render',
    'serverSideRowModel',
  );
  const requestRange = (startIndex: number, endIndex: number) => {
    if (!updated) {
      pendingRange = { start: startIndex, end: endIndex };
      return;
    }
    controller.requestRange(startIndex, endIndex);
  };
  const snapshot = createExternalStoreSignal(controller, 'serverSideRowModelStore');
  return {
    rowModel: createMemo(() => snapshot().rowModel),
    rowCount: () => snapshot().rowCount,
    loadError: createMemo(() => snapshot().loadError),
    writeError: createMemo(() => snapshot().writeError),
    // 追加(1.5.0 / serverSideRefetch="keep"): 取り直しの間、前の行を見せているか。
    refetching: createMemo(() => snapshot().refetching),
    isRowLoaded: controller.isRowLoaded,
    requestRange,
    refresh: controller.refresh,
    retryFailedBlocks: controller.retryFailedBlocks,
    // 書き戻し先(dataSource.updateRows)があるか。無い間はシェルがすべてのセルを編集できないようにする。
    canUpdateRows: createMemo(() => args().dataSource?.updateRows !== undefined),
    applyCellEdits: controller.applyCellEdits,
  };
}

export type ServerSide<T> = ReturnType<typeof createServerSide<T>>;