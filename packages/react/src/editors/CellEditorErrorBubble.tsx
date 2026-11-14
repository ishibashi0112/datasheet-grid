// 追加(validation): reject 時の即時エラーメッセージバブルです。エディタ wrapper
//   (.ssg-cell-editor / position:absolute)内に描画し、既定はセル直下へ表示します。
//   カスタムツールチップ(data-ssg-tooltip)は hover 遅延があるため使いません。
//   ビューポート下端にかかる場合はセル上側へ簡易フリップします(マウント時に 1 回計測)。
// 変更(1.0.2 / 2026-11-09 実アプリの総点検 B-05): 右端の列で吹き出しがグリッドの外(や右固定ペインの下)へはみ出して
//   切れていたので、はみ出した分だけ左へずらします(左端は越えない。マウント時に 1 回計測)。
import { useCallback, useState } from 'react';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
import { resolveShiftIntoView } from './editorVisibleBounds';

export function CellEditorErrorBubble({ message }: { message: string }) {
  const [placement, setPlacement] = useState({ above: false, shift: 0 });
  // マウント時に自身の矩形を計測し、下側に収まらなければ上側へフリップします
  //   (callback ref は commit 後 = レイアウト確定後に 1 回呼ばれます)。
  const measureRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      return;
    }
    // ずらす前の位置で測ります(文言が変わって測り直すとき)。
    element.style.left = '';
    setPlacement({
      above: element.getBoundingClientRect().bottom > window.innerHeight - 4,
      shift: resolveShiftIntoView(element),
    });
  }, []);

  return (
    <div
      // 文言が変わったら作り直して測り直します(長さで左へずらす量が変わる)。
      key={message}
      ref={measureRef}
      role="alert"
      className={cx(
        'ssg-cell-editor-error',
        placement.above && 'ssg-cell-editor-error--above',
      )}
      style={placement.shift > 0 ? { left: -placement.shift } : undefined}
    >
      {message}
    </div>
  );
}

export default CellEditorErrorBubble;