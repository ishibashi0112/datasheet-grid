// 追加(validation): reject 時の即時エラーメッセージバブルです。エディタ wrapper
//   (.ssg-cell-editor / position:absolute)内に描画し、既定はセル直下へ表示します。
//   カスタムツールチップ(data-ssg-tooltip)は hover 遅延があるため使いません。
//   ビューポート下端にかかる場合はセル上側へ簡易フリップします(マウント時に 1 回計測)。
// 変更(1.0.2 / 2026-11-09 実アプリの総点検 B-05): 右端の列で吹き出しがグリッドの外(や右固定ペインの下)へはみ出して
//   切れていたので、はみ出した分だけ左へずらします(左端は越えない。マウント時に 1 回計測)。
// 変更(1.0.2 の確かめ直し): 見えている範囲(細い固定ペインなど)より幅の広い文言は、その幅で折り返します(1 行のまま
//   省略記号で切れて読めなかった)。上下は、ウィンドウの下端だけでなく、グリッドの見えている範囲(合計行の上・枠の中)の
//   下端にかかるときも上へ出します(見えている最後の行の吹き出しが合計行や下部バーの裏に隠れていた。1.0.0 から)。上も
//   隠れるときは、はみ出しの少ない側です。
import { useCallback, useState } from 'react';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
// 変更(Solid 版 段階 1-2): 測って置く処理は core utils/errorBubblePlacement へ移しました(Solid 版と共用)。
import {
  DEFAULT_ERROR_BUBBLE_PLACEMENT,
  ERROR_BUBBLE_ABOVE_CLASS,
  placeErrorBubble,
  type ErrorBubblePlacement,
} from '@ishibashi0112/spreadsheet-grid-core/internal/utils/errorBubblePlacement';

export function CellEditorErrorBubble({ message }: { message: string }) {
  const [placement, setPlacement] = useState<ErrorBubblePlacement>(DEFAULT_ERROR_BUBBLE_PLACEMENT);
  // マウント時に自身の矩形を計測し、下側に収まらなければ上側へフリップします
  //   (callback ref は commit 後 = レイアウト確定後に 1 回呼ばれます)。
  // 変更(1.0.2 / レビュー QA-3): 作り直した要素は今の配置(上に出す印・ずらし)を付けて描かれるので、外してから測り、測った
  //   配置をこの場で付け直します(placeErrorBubble。配置が前と同じだと React は DOM を書き直さないので、外したままにもしない)。
  const measureRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      return;
    }
    setPlacement(placeErrorBubble(element));
  }, []);

  return (
    <div
      // 文言が変わったら作り直して測り直します(長さで左へずらす量が変わる)。
      key={message}
      ref={measureRef}
      role="alert"
      className={cx(
        'ssg-cell-editor-error',
        placement.above && ERROR_BUBBLE_ABOVE_CLASS,
      )}
      style={
        placement.shift > 0 || placement.wrapWidth !== null
          ? {
              left: placement.shift > 0 ? -placement.shift : undefined,
              width: placement.wrapWidth ?? undefined,
              whiteSpace: placement.wrapWidth !== null ? 'normal' : undefined,
            }
          : undefined
      }
    >
      {message}
    </div>
  );
}

export default CellEditorErrorBubble;