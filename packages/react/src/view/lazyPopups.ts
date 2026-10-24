// 追加(lazy-popups): 開いたときにだけ要る大きめの部品(列フィルターポップオーバー / ツールパネル)を別チャンクへ
//   分けて遅延読み込みします。公開 API は不変で、初期の読み込みを約 1 割減らします。
//   - React.lazy + Suspense は使いません。読み込み完了で Suspense 境界の中だけが再描画されると、シェル側の
//     コントローラの update が呼ばれず、filterPopoverController の ResizeObserver 接続 / 入力欄フォーカスが
//     初回オープンで効かないためです。読み込み状態は外部ストア(core logic/lazyModule)に持ち、シェルが購読して
//     読み込み完了でシェルごと再描画します(部品は読み込み前は描画せず、読み込み後は従来と同じ条件で描画)。
//     購読するのは開かれている(要る)間だけで、暇なときの先読みが終わってもシェルは再描画しません(閉じている間の
//     無駄な再描画と、利用側テストでの act 外の更新警告を避ける)。開いた描画で読み込み済みならそのコミットで描画します。
//   - 読み込みの契機: (1) グリッドのマウント後、ブラウザが暇なときの先読み(その機能が使えるときだけ)、
//     (2) 先読み前に開かれたらその場で読み込み(完了まで部品は出ない)、(3) 公開関数 preloadGridPopups()
//     (テストで開いた直後に同期で中身を確かめたいとき / 画面遷移前の先読み用)。
//   - 読み込みに失敗したら console.error に出し、開いていた状態は閉じます(見えないポップアップが開いたままだと
//     グリッドのキーボード操作が止まったままになるため)。次に開いたときは読み直しを試みますが、ブラウザによっては
//     失敗した動的 import をページの再読み込みまで覚えています(Chromium で確認)。
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  createLazyModule,
  type LazyModule,
} from '@ishibashi0112/spreadsheet-grid-core/logic/lazyModule';
import { scheduleIdleTask } from '@ishibashi0112/spreadsheet-grid-core/utils/scheduler';

export const filterPopoverModule = createLazyModule(() => import('./ColumnFilterPopover'));
export const toolPanelModule = createLazyModule(() => import('./toolPanelViews'));

export type ToolPanelViews = typeof import('./toolPanelViews');

/**
 * 列フィルターポップオーバーとツールパネルの部品を先に読み込みます。
 * グリッドはマウント後に自動で先読みするため通常は呼ぶ必要はありません。テストでポップオーバーを開いた直後に
 * 同期で中身を確かめたいときは、`beforeAll` などで `await preloadGridPopups()` してください。
 */
export const preloadGridPopups = async (): Promise<void> => {
  await Promise.all([filterPopoverModule.load(), toolPanelModule.load()]);
};

const reportLoadError = (error: unknown) => {
  console.error('[SpreadsheetGrid] ポップオーバー部品の読み込みに失敗しました。', error);
};

const getNull = () => null;
const subscribeNothing = () => () => {};

export type UseLazyModuleOptions = {
  // 今すぐ要る(開かれている)か。読み込み前なら即座に読み込みます。
  needed: boolean;
  // その機能が使えるか。使えるならマウント後の暇なときに先読みします。
  prefetch: boolean;
  // 一度要ったら、閉じたあとも部品を返し続けるか(ツールパネル: 閉じている間は自分で null を返す部品で、
  //   開くたびにマウントし直すと、既開時フラッシュ(flashTick)がマウント時に走ってしまうため従来どおり置き続ける)。
  retainAfterNeeded?: boolean;
  // 開かれて読み込んだのに失敗したとき(開いていた状態を閉じる)。参照が安定した関数を渡すこと。
  onLoadError?: () => void;
};

export const useLazyModule = <M,>(
  module: LazyModule<M>,
  { needed, prefetch, retainAfterNeeded = false, onLoadError }: UseLazyModuleOptions,
): M | null => {
  // 一度要ったか(前回までの描画からの派生状態。retainAfterNeeded のときだけ立てる)。
  const [wasNeeded, setWasNeeded] = useState(false);
  if (retainAfterNeeded && needed && !wasNeeded) {
    setWasNeeded(true);
  }
  const active = needed || (retainAfterNeeded && wasNeeded);
  const loaded = useSyncExternalStore(
    active ? module.subscribe : subscribeNothing,
    active ? module.getSnapshot : getNull,
    getNull,
  );
  useEffect(() => {
    if (!needed || loaded !== null) {
      return;
    }
    // 失敗が届く前に閉じられた(needed が外れた)ら閉じ直しません(閉じるとグリッドへフォーカスを戻すため)。
    let stillNeeded = true;
    module.load().catch((error: unknown) => {
      reportLoadError(error);
      if (stillNeeded) {
        onLoadError?.();
      }
    });
    return () => {
      stillNeeded = false;
    };
  }, [module, needed, loaded, onLoadError]);
  useEffect(() => {
    if (!prefetch || module.getSnapshot() !== null) {
      return;
    }
    return scheduleIdleTask(() => {
      module.load().catch(reportLoadError);
    });
  }, [module, prefetch]);
  return loaded;
};