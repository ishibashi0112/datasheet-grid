// 追加(validation): reject 時の即時エラーメッセージバブルです。エディタ wrapper
//   (.ssg-cell-editor / position:absolute)内に描画し、既定はセル直下へ表示します。
//   カスタムツールチップ(data-ssg-tooltip)は hover 遅延があるため使いません。
//   ビューポート下端にかかる場合はセル上側へ簡易フリップします(マウント時に 1 回計測)。
import { useCallback, useState } from 'react';
import { cx } from '../logic/cx';

export function CellEditorErrorBubble({ message }: { message: string }) {
  const [above, setAbove] = useState(false);
  // マウント時に自身の矩形を計測し、下側に収まらなければ上側へフリップします
  //   (callback ref は commit 後 = レイアウト確定後に 1 回呼ばれます)。
  const measureRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      return;
    }
    setAbove(element.getBoundingClientRect().bottom > window.innerHeight - 4);
  }, []);

  return (
    <div
      ref={measureRef}
      role="alert"
      className={cx(
        'ssg-cell-editor-error',
        above && 'ssg-cell-editor-error--above',
      )}
    >
      {message}
    </div>
  );
}

export default CellEditorErrorBubble;