// 追加(1.0.2 / 2026-11-09 実アプリの総点検 A-09 / B-05): エディタの部品(日付の入力欄・エラーの吹き出し)が見えている横の範囲。
//   グリッドのスクロールの枠の中で、中央のペインにあるときは左右の固定ペインの下を除きます(固定ペインが上に重なるため)。
//   jsdom など大きさの無い環境では null(ずらさない)。
export const resolveEditorVisibleX = (element: Element): { left: number; right: number } | null => {
  const container = element.closest('.ssg-scroll-container');
  if (!container) {
    return null;
  }
  const rect = container.getBoundingClientRect();
  let left = rect.left + container.clientLeft;
  let right = left + container.clientWidth;
  const center = element.closest('.ssg-center-pane');
  if (center) {
    // 中央のペインの前が左固定ペイン、後ろが右固定ペイン(GridShell の並び)。
    const before = center.previousElementSibling;
    const after = center.nextElementSibling;
    if (before) {
      left = Math.max(left, before.getBoundingClientRect().right);
    }
    if (after) {
      right = Math.min(right, after.getBoundingClientRect().left);
    }
  }
  return right - left > 0 ? { left, right } : null;
};

// 要素を見えている範囲へ収めるために左へずらす量(px。0 = ずらさない)。右へはみ出した分だけ左へ、ただし左端を越えない。
const EDGE_MARGIN = 4;
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