// 追加(差し込み式 段階 5): サーバーサイド行モデル(SSRM。dataSource)の機能です。
//   - エンジン側: 書き戻しのセル単位の保存状態の表示(core controllers/saveStatusController)。
//   - シェル側: useServerSide = 行モデルの controller(core controllers/serverSideRowModel)の接続
//     (hooks/useServerSideRowModel)と、内蔵エラーバー(取得失敗の再試行 / 保存失敗。「閉じる」状態込み)の描画。
//     シェルにあったときと同じ位置で呼びます(hook の順番は従来どおり)。
//   query の組み立て(rowPipeline.resolveServerSideQuery)と debounce(engine.serverSideQueryStore)は小さく、
//   clientSide の空 query も同じ経路なのでシェル側に残しています。
//   機能セットに無い構成では dataSource を外して clientSide として扱い(createSpreadsheetGrid)、代役は件数 0 の
//   行モデルを返します。
import { useState, type ReactNode } from 'react';
import { createSaveStatusController } from '@ishibashi0112/spreadsheet-grid-core/controllers/saveStatusController';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/logic/cx';
import {
  useServerSideRowModel,
  type ServerSideLoadErrorState,
  type ServerSideWriteErrorState,
} from '../hooks/useServerSideRowModel';
import type { GridResolvedSlots } from '../model/gridTypes';
import type { ReactGridFeatures, ServerSideFeatureArgs, ServerSideFeatureResult } from './types';

const useServerSide = <T,>(args: ServerSideFeatureArgs<T>): ServerSideFeatureResult<T> => {
  const result = useServerSideRowModel<T>(args);
  // 追加(batch 9): 内蔵エラーバーの「閉じる」状態です。閉じた時点の loadError 参照を記録し、
  //   同一参照の間だけ非表示にします(失敗集合が変わる = 新しい失敗イベントで新参照になり
  //   再表示。クエリ変化 / retry / 全回復で loadError が null に戻れば記録は自然に無効化)。
  const [dismissedLoadError, setDismissedLoadError] =
    useState<ServerSideLoadErrorState | null>(null);
  // 追加(SSRM 書き戻し): 保存失敗バーの「閉じる」状態です(loadError と同じ参照比較の契約。
  //   新しい書き戻し失敗のたびに writeError が新参照になり再表示されます)。
  const [dismissedWriteError, setDismissedWriteError] =
    useState<ServerSideWriteErrorState | null>(null);

  // 追加(batch 9): SSRM エラーバー(getRows 失敗の再試行 UI)です。autosize / filter overlay と
  //   同じくシェルへの絶対配置ですが、下部中央に浮かべ、ボタン操作のため pointer-events は
  //   生かします(バー自身のみ。行操作は遮りません)。「閉じる」は同一 loadError 参照の間だけ
  //   有効で、新しい失敗(参照変化)で再表示されます。
  // 変更(SSRM 書き戻し): 保存失敗バー(writeError)と同時表示できるよう、絶対配置を
  //   縦積みコンテナ(.ssg-ssrm-error-bars)へ移しました(単独表示の見た目は従来と同一)。
  // 変更(差し込み式 段階 5): シェルの JSX から移しました(シェルが isServerSide のときだけ呼ぶ)。
  const renderErrorBars = (errorBarSlot: GridResolvedSlots['errorBar']): ReactNode =>
    ((result.loadError !== null &&
      result.loadError !== dismissedLoadError) ||
      (result.writeError !== null &&
        result.writeError !== dismissedWriteError)) && (
      <div className="ssg-ssrm-error-bars">
        {result.loadError !== null &&
          result.loadError !== dismissedLoadError && (
            <div
              className={cx('ssg-ssrm-error-bar', errorBarSlot?.className)}
              style={errorBarSlot?.style}
              role="alert"
            >
              <span className="ssg-ssrm-error-bar-dot" aria-hidden="true" />
              <span className="ssg-ssrm-error-bar-msg">
                行の取得に失敗しました(
                {result.loadError.failedBlockCount} ブロック)
              </span>
              <button
                type="button"
                className="ssg-ssrm-error-bar-retry"
                onClick={result.retryFailedBlocks}
              >
                再試行
              </button>
              <button
                type="button"
                className="ssg-ssrm-error-bar-close"
                aria-label="エラー通知を閉じる"
                onClick={() => setDismissedLoadError(result.loadError)}
              >
                ×
              </button>
            </div>
          )}
        {/* 追加(SSRM 書き戻し): 保存失敗バーです。フック側でロールバック済みのため再試行は
            提供しません(値は既に元へ戻っている)。「閉じる」は同一 writeError 参照の間だけ
            有効で、新しい書き戻し失敗(参照変化)で再表示されます。 */}
        {result.writeError !== null &&
          result.writeError !== dismissedWriteError && (
            <div
              className={cx('ssg-ssrm-error-bar', errorBarSlot?.className)}
              style={errorBarSlot?.style}
              role="alert"
            >
              <span className="ssg-ssrm-error-bar-dot" aria-hidden="true" />
              <span className="ssg-ssrm-error-bar-msg">
                変更の保存に失敗しました(
                {result.writeError.failedRowCount} 行)。値を元に戻しました
              </span>
              <button
                type="button"
                className="ssg-ssrm-error-bar-close"
                aria-label="保存エラー通知を閉じる"
                onClick={() => setDismissedWriteError(result.writeError)}
              >
                ×
              </button>
            </div>
          )}
      </div>
    );

  return { ...result, renderErrorBars };
};

export const serverSideFeature: NonNullable<ReactGridFeatures['serverSide']> = {
  createSaveStatusController,
  useServerSide,
};