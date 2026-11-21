// 追加(段階 3-3 ポップアップの遅延読み込み): 開いたときにだけ要る大きめの部品(列フィルターのポップオーバー / ツールパネル)を
//   別のチャンクへ分けて、後から読み込みます(React 版の view/lazyPopups.ts と同じ。初期の JS を約 1 割減らす)。
//   - 読み込みの状態は core の logic/lazyModule(購読できる store)に持ち、シェルは signal として読みます。読み込み前は null
//     (部品を描かない)で、読み込み終わると、その部品を描く `<Show>` だけが描き直されます(Solid は部品の本体を呼び直さないので、
//     React 版のように開いている間だけ購読する工夫は要らない)。
//   - 読み込みの契機は React 版と同じ: (1) 表を描いた後、ブラウザが暇なときの先読み(その機能が使えるときだけ)、(2) 先読みの前に
//     開かれたらその場で読み込む(終わるまで部品は出ない)、(3) 公開の関数 preloadGridPopups()(テストで開いた直後に中身を
//     確かめたいとき / 画面を移る前の先読み)。
//   - 読み込みに失敗したら console.error に出し、開いていた状態を閉じます(見えないポップアップが開いたままだと表のキー操作が
//     止まったままになるため。React 版と同じ)。
import { createEffect } from 'solid-js';
import { createLazyModule, type LazyModule } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/lazyModule';
import { scheduleIdleTask } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/scheduler';
import { createExternalStoreSignal } from '../primitives/externalStore';

// 使わない側(機能を外した構成のツールパネルなど)を束ねたときに消せるよう、副作用なしの印を付けます(React 版と同じ)。
export const filterPopoverModule = /* @__PURE__ */ createLazyModule(() => import('./ColumnFilterPopover'));
export const toolPanelModule = /* @__PURE__ */ createLazyModule(() => import('./toolPanelViews'));

export type FilterPopoverViews = typeof import('./ColumnFilterPopover');
export type ToolPanelViews = typeof import('./toolPanelViews');

/**
 * 列フィルターのポップオーバーとツールパネルの部品を先に読み込みます(React 版と同じ)。
 * 表は描いた後に自動で先読みするので、ふつうは呼ばなくて構いません。テストでポップオーバーを開いた直後に中身を
 * 確かめたいときは、`beforeAll` などで `await preloadGridPopups()` してください。
 */
export const preloadGridPopups = async (): Promise<void> => {
  await Promise.all([filterPopoverModule.load(), toolPanelModule.load()]);
};

// 文は日本語の行と英語の行の 2 行です(読み込みの失敗は本番でも出します。React 版と同じ文)。
const reportLoadError = (error: unknown) => {
  console.error('[SpreadsheetGrid] ポップオーバー部品の読み込みに失敗しました。\n[SpreadsheetGrid] Failed to load the popup components.', error);
};

export type LazyModuleSignalOptions = {
  // 今すぐ要る(開かれている)か。読み込み前なら、その場で読み込みます。
  needed: () => boolean;
  // その機能が使えるか。使えるなら、描いた後の暇なときに先読みします。
  prefetch: () => boolean;
  // 開かれて読み込んだのに失敗したとき(開いていた状態を閉じる)。
  onLoadError?: (() => void) | undefined;
};

export function createLazyModuleSignal<M>(module: LazyModule<M>, options: LazyModuleSignalOptions, name: string): () => M | null {
  const loaded = createExternalStoreSignal(module, `${name}Module`);
  // 開かれたのに読み込んでいなければ、その場で読み込みます。失敗が届く前に閉じられたら閉じ直しません(閉じると表へフォーカスを
  //   戻すため。React 版と同じ)。
  createEffect(
    () => options.needed() && loaded() === null,
    (shouldLoad) => {
      if (!shouldLoad) {
        return;
      }
      let stillNeeded = true;
      module.load().catch((error: unknown) => {
        reportLoadError(error);
        if (stillNeeded) {
          options.onLoadError?.();
        }
      });
      return () => {
        stillNeeded = false;
      };
    },
    { name: `${name}Load` },
  );
  // 使える機能なら、描いた後の暇なときに先読みします(effect は描いた後に走る)。
  createEffect(
    () => options.prefetch() && module.getSnapshot() === null,
    (shouldPrefetch) => {
      if (!shouldPrefetch) {
        return;
      }
      return scheduleIdleTask(() => {
        module.load().catch(reportLoadError);
      });
    },
    { name: `${name}Prefetch` },
  );
  return loaded;
}