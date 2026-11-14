// 追加(validation): reject 時の即時エラーメッセージバブルです。エディタ wrapper
//   (.ssg-cell-editor / position:absolute)内に描画し、既定はセル直下へ表示します。
//   カスタムツールチップ(data-ssg-tooltip)は hover 遅延があるため使いません。
//   ビューポート下端にかかる場合はセル上側へ簡易フリップします(マウント時に 1 回計測)。
// 変更(1.0.2 / 2026-11-09 実アプリの総点検 B-05): 右端の列で吹き出しがグリッドの外(や右固定ペインの下)へはみ出して
//   切れていたので、はみ出した分だけ左へずらします(左端は越えない。マウント時に 1 回計測)。
import { useCallback, useState } from 'react';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
import { resolveShiftIntoView } from './editorVisibleBounds';

const ABOVE_CLASS = 'ssg-cell-editor-error--above';

export function CellEditorErrorBubble({ message }: { message: string }) {
  const [placement, setPlacement] = useState({ above: false, shift: 0 });
  // マウント時に自身の矩形を計測し、下側に収まらなければ上側へフリップします
  //   (callback ref は commit 後 = レイアウト確定後に 1 回呼ばれます)。
  const measureRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      return;
    }
    // ずらす前・下に出した位置で測ります(文言が変わって測り直すとき)。
    // 変更(1.0.2 / レビュー QA-3): 作り直した要素は今の配置(上に出す印・ずらし)を付けて描かれるので、外してから測り、測った
    //   配置をこの場で付け直します(上に出した位置で測ると「下に収まる」と判定して下へ戻っていた。配置が前と同じだと React は
    //   DOM を書き直さないので、外したままにもしない)。
    element.classList.remove(ABOVE_CLASS);
    element.style.left = '';
    const next = {
      above: element.getBoundingClientRect().bottom > window.innerHeight - 4,
      shift: resolveShiftIntoView(element),
    };
    element.classList.toggle(ABOVE_CLASS, next.above);
    element.style.left = next.shift > 0 ? `${-next.shift}px` : '';
    setPlacement(next);
  }, []);

  return (
    <div
      // 文言が変わったら作り直して測り直します(長さで左へずらす量が変わる)。
      key={message}
      ref={measureRef}
      role="alert"
      className={cx(
        'ssg-cell-editor-error',
        placement.above && ABOVE_CLASS,
      )}
      style={placement.shift > 0 ? { left: -placement.shift } : undefined}
    >
      {message}
    </div>
  );
}

export default CellEditorErrorBubble;