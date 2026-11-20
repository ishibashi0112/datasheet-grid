// サーバーサイドの行モデル(SSRM。機能 features/serverSide の部品)の内蔵のエラーバー。React 版の features/serverSide.tsx の
//   renderErrorBars と同じ DOM と class。
//   - 取得の失敗(getRows): 失敗したブロックの数・再試行・閉じる。
//   - 保存の失敗(updateRows): 失敗した行の数・閉じる(値はもう元に戻っているので再試行は無い)。
//   「閉じる」は閉じたときの失敗の状態(参照)の間だけ隠す。新しい失敗が起きると状態が新しい参照になるので、また出る
//   (取得し直し / 再試行 / 全部回復で null に戻れば、閉じた印も意味を失う)。
import { Show, createSignal } from 'solid-js';
import type { ServerSideLoadErrorState, ServerSideWriteErrorState } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/serverSideRowModel';
import type { DEFAULT_SERVER_SIDE_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { formatLocaleText, type FeatureLocaleText, type ResolvedGridLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { GridResolvedSlot } from '../model/gridTypes';

type ServerSideTexts = FeatureLocaleText<typeof DEFAULT_SERVER_SIDE_LOCALE_TEXT>;

type GridServerSideErrorBarsProps = {
  loadError: ServerSideLoadErrorState | null;
  writeError: ServerSideWriteErrorState | null;
  onRetry: () => void;
  slot: GridResolvedSlot | undefined;
  localeTexts: ResolvedGridLocaleText;
};

export function GridServerSideErrorBars(props: GridServerSideErrorBarsProps) {
  const [dismissedLoadError, setDismissedLoadError] = createSignal<ServerSideLoadErrorState | null>(null);
  const [dismissedWriteError, setDismissedWriteError] = createSignal<ServerSideWriteErrorState | null>(null);
  const texts = () => props.localeTexts as ServerSideTexts & ResolvedGridLocaleText;
  const shownLoadError = () => (props.loadError !== null && props.loadError !== dismissedLoadError() ? props.loadError : null);
  const shownWriteError = () =>
    props.writeError !== null && props.writeError !== dismissedWriteError() ? props.writeError : null;
  return (
    <Show when={shownLoadError() !== null || shownWriteError() !== null}>
      <div class="ssg-ssrm-error-bars">
        <Show when={shownLoadError()}>
          {(loadError) => (
            <div class={['ssg-ssrm-error-bar', props.slot?.className]} style={props.slot?.style} role="alert">
              <span class="ssg-ssrm-error-bar-dot" aria-hidden="true" />
              <span class="ssg-ssrm-error-bar-msg">
                {formatLocaleText(texts().loadFailed, { count: loadError().failedBlockCount })}
              </span>
              <button type="button" class="ssg-ssrm-error-bar-retry" onClick={() => props.onRetry()}>
                {texts().retry}
              </button>
              <button
                type="button"
                class="ssg-ssrm-error-bar-close"
                aria-label={texts().dismissLoadError}
                onClick={() => setDismissedLoadError(() => props.loadError)}
              >
                ×
              </button>
            </div>
          )}
        </Show>
        <Show when={shownWriteError()}>
          {(writeError) => (
            <div class={['ssg-ssrm-error-bar', props.slot?.className]} style={props.slot?.style} role="alert">
              <span class="ssg-ssrm-error-bar-dot" aria-hidden="true" />
              <span class="ssg-ssrm-error-bar-msg">
                {formatLocaleText(texts().saveFailed, { count: writeError().failedRowCount })}
              </span>
              <button
                type="button"
                class="ssg-ssrm-error-bar-close"
                aria-label={texts().dismissSaveError}
                onClick={() => setDismissedWriteError(() => props.writeError)}
              >
                ×
              </button>
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
}