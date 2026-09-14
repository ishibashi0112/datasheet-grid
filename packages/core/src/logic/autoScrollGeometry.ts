// 追加(scroll-fix): ドラッグ中の端 auto-scroll 判定を純関数へ切り出します。
// 背景(2 つの不具合への対処):
//   1) 発動条件が「ポインタが端帯内にあるか」のみだったため、端付近のセル/グリップを
//      「押しただけ」(1px も動かしていない)で毎フレームのスクロールが自己発火していた。
//      → hasPointerLeftActivationRadius による armed ガード(起点から一定距離動くまで不発動)。
//   2) 端帯 24px を rect(ボーダー・スクロールバー込みの外形)から測っていたため、右端帯の
//      大半(縦スクロールバー ≒15px + ボーダー)がスクロールバー上に乗り、実セル上の帯は
//      8px 程度しか残っていなかった(下端も横スクロールバーで同様)。
//      → resolveScrollContentBox でコンテンツ領域基準へ変更(帯が意図どおり実セル上の 24px に)。
//   あわせて computeNextScrollPosition で次位置を [0, max] へ clamp し、スクロール端到達後に
//   毎フレーム scrollTo(+選択更新 dispatch)が走り続けていた無駄も止めます。
// 利用箇所: useGridPointerInteractions(セル/行/列の範囲選択ドラッグ)と
//   useColumnHeaderDragController(列並べ替えドラッグ・横のみ)。

// 端帯の幅(px)です。従来の各フック内ローカル定数(EDGE_THRESHOLD=24)を共通化しました。
export const AUTO_SCROLL_EDGE_THRESHOLD = 24;
// 1 フレームあたりのスクロール量(px)です(従来の SCROLL_STEP=18 と同値)。
export const AUTO_SCROLL_STEP = 18;
// auto-scroll を発動(armed 化)するために必要な、ドラッグ起点からの移動距離(px)です。
//   クリック時の手ブレ(1〜2px)では発動せず、意図的なドラッグでのみ発動します。
export const AUTO_SCROLL_ACTIVATION_DISTANCE = 6;

// 軸ごとのスクロール方向です(-1=負方向 / 0=なし / 1=正方向)。
export type AutoScrollAxisDirection = -1 | 0 | 1;

// スクロールバー・ボーダーを除いた「コンテンツ領域」の client 座標矩形です。
export type AutoScrollContentBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

// getBoundingClientRect(外形)と client 系プロパティからコンテンツ領域を求めます。
//   rect.left + clientLeft がコンテンツ左端、そこへ clientWidth を足した位置が
//   (縦スクロールバーの内側の)コンテンツ右端です。縦も同様です。
export const resolveScrollContentBox = ({
  rectLeft,
  rectTop,
  clientLeft,
  clientTop,
  clientWidth,
  clientHeight,
}: {
  rectLeft: number;
  rectTop: number;
  clientLeft: number;
  clientTop: number;
  clientWidth: number;
  clientHeight: number;
}): AutoScrollContentBox => {
  const left = rectLeft + clientLeft;
  const top = rectTop + clientTop;
  return {
    left,
    top,
    right: left + clientWidth,
    bottom: top + clientHeight,
  };
};

// ポインタの 1 軸座標が端帯(edgeThreshold)へ入っているかを判定し、スクロール方向を返します。
//   start / end はコンテンツ領域の始端/終端(横なら left/right、縦なら top/bottom)です。
//   境界ちょうど(start + threshold / end - threshold)は帯外(0)です。
export const resolveAutoScrollAxisDirection = (
  pointer: number,
  start: number,
  end: number,
  edgeThreshold: number,
): AutoScrollAxisDirection => {
  if (pointer < start + edgeThreshold) {
    return -1;
  }
  if (pointer > end - edgeThreshold) {
    return 1;
  }
  return 0;
};

// 次のスクロール位置を [0, max] へ clamp して返します。
//   従来は正方向の上限 clamp が無く、端到達後も「next !== current」が真のまま毎フレーム
//   scrollTo(範囲選択側はさらに選択更新 dispatch)が走り続けていました。clamp により
//   端到達後は current === next となり、呼び出し側の処理が完全に止まります。
export const computeNextScrollPosition = (
  current: number,
  direction: AutoScrollAxisDirection,
  step: number,
  max: number,
): number => {
  if (direction === 0) {
    return current;
  }
  const upperBound = Math.max(max, 0);
  const next = current + direction * step;
  if (next < 0) {
    return 0;
  }
  return next > upperBound ? upperBound : next;
};

// ドラッグ起点からの移動距離が activationDistance 以上かを判定します(平方比較で sqrt 回避)。
//   true になった時点で呼び出し側は armed 化し、以後ドラッグ終了まで再判定しません
//   (起点付近へ戻っても解除しない)。
export const hasPointerLeftActivationRadius = (
  origin: { x: number; y: number },
  pointer: { x: number; y: number },
  activationDistance: number,
): boolean => {
  const dx = pointer.x - origin.x;
  const dy = pointer.y - origin.y;
  return dx * dx + dy * dy >= activationDistance * activationDistance;
};