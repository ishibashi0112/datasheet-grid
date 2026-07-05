// 追加(FM-4 / パネルドラッグ): 独立パネル(FilterManagement / SortManagement / ColumnChooser)
//   のドラッグ位置をビューポートへ clamp する純ロジックです。controller(moveXxx /
//   updateXxxLayout のドラッグ分岐)が使います。
// 方針:
//   - 左右: パネル全幅が [margin, viewportWidth - panelWidth - margin] に収まるようにします。
//     ビューポートがパネルより狭い極小画面では範囲が反転しますが、Math.max を後に適用する
//     ことで左端 margin を優先します(左上が見えていれば操作を継続できるため)。
//   - 上下: 下方向はパネル全高ではなく「上端がビューポート下端から MIN_VISIBLE 以上残る」
//     ことだけを保証します(パネル高は可変のため計測不要で、ヘッダー = 掴み直し領域が
//     必ず画面内に残ります)。
export const PANEL_DRAG_VIEWPORT_MARGIN = 8;
// ヘッダー(掴み直し領域)として画面内に必ず残す高さです(ヘッダー実高 ≈ 33px + 余裕)。
export const PANEL_DRAG_MIN_VISIBLE = 40;

export type PanelDragClampArgs = {
  top: number;
  left: number;
  panelWidth: number;
  viewportWidth: number;
  viewportHeight: number;
};

export const clampPanelDragPosition = ({
  top,
  left,
  panelWidth,
  viewportWidth,
  viewportHeight,
}: PanelDragClampArgs): { top: number; left: number } => {
  const clampedLeft = Math.max(
    PANEL_DRAG_VIEWPORT_MARGIN,
    Math.min(left, viewportWidth - panelWidth - PANEL_DRAG_VIEWPORT_MARGIN),
  );
  const clampedTop = Math.max(
    PANEL_DRAG_VIEWPORT_MARGIN,
    Math.min(top, viewportHeight - PANEL_DRAG_MIN_VISIBLE),
  );
  return { top: clampedTop, left: clampedLeft };
};