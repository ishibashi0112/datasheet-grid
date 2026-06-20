import type { CSSProperties } from 'react';

// 追加: 選択範囲の矩形情報です。
// 変更(10-D): left は「ペイン列領域内ローカル座標」になりました（leadingWidth 非含有）。
//             描画時に leadingWidth を加算して最終 left を求めます。
export type SelectionOverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type SelectionOverlayProps = {
  rect: SelectionOverlayRect | null;
  headerHeight: number;
  // 変更(10-D): rowHeaderWidth → leadingWidth に一般化しました。
  //             行ヘッダーを持つペインでは rowHeaderWidth、それ以外のペインでは 0 が渡されます。
  //             固定列なしの中央ペインでは leadingWidth === rowHeaderWidth となり、
  //             従来と完全に同じ位置に描画されます。
  leadingWidth: number;
  // 追加(scroll-space 仮想化 修正): 絶対論理 top から差し引く描画ウィンドウ基準オフセット(px)。
  //   no-op では 0(従来と同一配置)。scaling 時のみ正値です(詳細は ActiveCellOverlay と同様)。
  baseOffset?: number;
};

// 追加: 選択範囲をセル本体とは独立したレイヤーで描画するコンポーネントです。
// 変更(10-D): ペイン別座標系に対応。各ペインの relative コンテナ内へ配置されます。
export function SelectionOverlay({
  rect,
  headerHeight,
  leadingWidth,
  baseOffset = 0,
}: SelectionOverlayProps) {
  if (!rect) {
    return null;
  }

  const overlayStyle: CSSProperties = {
    position: 'absolute',
    left: leadingWidth + rect.left,
    top: headerHeight + rect.top - baseOffset,
    width: rect.width,
    height: rect.height,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    border: '2px solid #2563eb',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    zIndex: 2,
  };

  return <div style={overlayStyle} />;
}

export default SelectionOverlay;