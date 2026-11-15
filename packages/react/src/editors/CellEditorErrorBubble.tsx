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
import { resolveEditorVisibleY, resolveShiftIntoView, resolveVisibleWidth } from './editorVisibleBounds';

const ABOVE_CLASS = 'ssg-cell-editor-error--above';

// 下に出した位置で測り、見えている範囲の下端にかかるなら上へ(上のほうがはみ出すときは下のまま)。
const EDGE_MARGIN = 4;
const shouldPlaceAbove = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  const bounds = resolveEditorVisibleY(element);
  const overflowBelow = rect.bottom - (bounds.bottom - EDGE_MARGIN);
  if (overflowBelow <= 0) {
    return false;
  }
  // 上へ出すと、エディタの枠(.ssg-cell-editor)の上端から 4px 上に下端が来ます。
  const anchorTop = element.parentElement?.getBoundingClientRect().top ?? rect.top;
  const overflowAbove = bounds.top + EDGE_MARGIN - (anchorTop - 4 - rect.height);
  return overflowAbove < overflowBelow;
};

// 折り返すときは幅を決めて書きます(max-width だけだと、絶対配置の吹き出しはエディタの枠 = セルの幅で折り返す)。
const applyWrap = (element: HTMLElement, wrapWidth: number | null) => {
  element.style.width = wrapWidth !== null ? `${wrapWidth}px` : '';
  element.style.whiteSpace = wrapWidth !== null ? 'normal' : '';
};

export function CellEditorErrorBubble({ message }: { message: string }) {
  const [placement, setPlacement] = useState<{ above: boolean; shift: number; wrapWidth: number | null }>({
    above: false,
    shift: 0,
    wrapWidth: null,
  });
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
    element.style.width = '';
    element.style.whiteSpace = '';
    // 見えている範囲より広ければ、その幅で折り返してから上下とずらしを測ります(折り返すと背が高くなる)。
    const visibleWidth = resolveVisibleWidth(element);
    const wrapWidth = visibleWidth !== null && element.getBoundingClientRect().width > visibleWidth ? visibleWidth : null;
    applyWrap(element, wrapWidth);
    const next = {
      above: shouldPlaceAbove(element),
      shift: resolveShiftIntoView(element),
      wrapWidth,
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