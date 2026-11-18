// 変更(Solid 版 段階 1-2): React 版の editors/editorVisibleBounds.ts から移しました(DOM だけを見るので Solid 版と共用)。
import { resolveGridVisibleBand } from './gridVisibleBand';

// 追加(1.0.2 / 2026-11-09 実アプリの総点検 A-09 / B-05): エディタの部品(日付の入力欄・エラーの吹き出し)が見えている横の範囲。
//   グリッドのスクロールの枠の中で、中央のペインにあるときは左右の固定ペインの下を除きます(固定ペインが上に重なるため)。
//   固定ペインにあるときはそのペインの中です(QA-2)。
//   jsdom など大きさの無い環境では null(ずらさない)。
export const resolveEditorVisibleX = (element: Element): { left: number; right: number } | null => {
  const container = element.closest('.ssg-scroll-container');
  if (!container) {
    return null;
  }
  const rect = container.getBoundingClientRect();
  let left = rect.left + container.clientLeft;
  let right = left + container.clientWidth;
  const center = element.closest('.ssg-center-pane') ?? container.querySelector('.ssg-center-pane');
  if (center) {
    // 中央のペインの前が左固定ペイン、後ろが右固定ペイン(GridShell の並び)。
    const before = center.previousElementSibling;
    const after = center.nextElementSibling;
    if (center.contains(element)) {
      if (before) {
        left = Math.max(left, before.getBoundingClientRect().right);
      }
      if (after) {
        right = Math.min(right, after.getBoundingClientRect().left);
      }
    } else {
      // 変更(1.0.2 / レビュー QA-2): 固定ペインの中なら、そのペインの中に収めます(固定ペインは中身を `overflow: clip` で
      //   切るので、ペインの外へずらすと先頭が切れていた。ペインより幅の広い部品は、先頭をペインの左端にそろえる)。
      const pane = before?.contains(element) ? before : after?.contains(element) ? after : null;
      if (pane) {
        const paneRect = pane.getBoundingClientRect();
        left = Math.max(left, paneRect.left);
        right = Math.min(right, paneRect.right);
      }
    }
  }
  return right - left > 0 ? { left, right } : null;
};

// 追加(1.0.2 の確かめ直し): エディタの部品(エラーの吹き出し)が見えている縦の範囲。グリッドのスクロールの枠の中で、
//   上に固定した見出しの行と下に固定した合計行の下を除き、ウィンドウの中に限ります(見えている最後の行の吹き出しが合計行や
//   枠の外 = 下部バーの裏に隠れていた)。jsdom など大きさの無い環境ではウィンドウだけ。
export const resolveEditorVisibleY = (element: Element): { top: number; bottom: number } => {
  // 変更(1.2.0 の見直し QH-6): 上と下の固定行(pinnedTopRows / pinnedBottomRows)の下も除きます(下の固定行は既定で合計行の
  //   上にあり、見えている最後の行の吹き出しが固定行の下に隠れていた)。範囲は core の resolveGridVisibleBand(IME の入力受けと共用)。
  const band = resolveGridVisibleBand(element);
  return {
    top: Math.max(0, band?.top ?? 0),
    bottom: Math.min(window.innerHeight, band?.bottom ?? window.innerHeight),
  };
};

// 要素を見えている範囲へ収めるために左へずらす量(px。0 = ずらさない)。右へはみ出した分だけ左へ、ただし左端を越えない。
const EDGE_MARGIN = 4;
// 追加(1.0.2 の確かめ直し): 見えている範囲に収まる幅(px。両端の余白を除く)。大きさの無い環境では null。
//   細い固定ペインの中のエラーの吹き出しを、この幅で折り返すのに使います。
export const resolveVisibleWidth = (element: Element): number | null => {
  const bounds = resolveEditorVisibleX(element);
  if (!bounds) {
    return null;
  }
  const width = Math.floor(bounds.right - bounds.left - EDGE_MARGIN * 2);
  return width > 0 ? width : null;
};
export const resolveShiftIntoView = (element: Element): number => {
  const bounds = resolveEditorVisibleX(element);
  if (!bounds) {
    return 0;
  }
  const rect = element.getBoundingClientRect();
  const overflow = rect.right - (bounds.right - EDGE_MARGIN);
  if (overflow <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(overflow, rect.left - bounds.left));
};