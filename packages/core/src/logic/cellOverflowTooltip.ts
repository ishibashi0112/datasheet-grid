// 追加: セル省略時ツールチップ(showCellOverflowTooltip)の「マーカー付与判定」の純関数です。
//   実際の表示可否(実クリップ = scrollWidth > clientWidth)はホバー時に useGridTooltip が DOM 計測
//   しますが、そもそも「どのセルにマーカー(data-ssg-tooltip-overflow)を付けるか」の判定はここに
//   切り出して単体テスト可能にしています(logic/ への純関数抽出方針。jsdom は overflow を実測不可)。
//
//   対象は「既定テキストセル」のみです:
//   - autoHeight 折り返しセルは対象外(折り返すのでクリップされない = 省略が起きない)。
//   - renderCell 列は対象外(バッジ/チップ等、テキストとは限らず textContent が意味を持たないため)。
export const shouldMarkCellOverflowTooltip = (params: {
  // グリッド prop showCellOverflowTooltip(既定 false)。
  enabled: boolean;
  // auto-height モードかつ column.autoHeight のセル(= 折り返し = クリップされない)か。
  isAutoHeightCell: boolean;
  // 列が renderCell を持つ(= カスタム UI 列)か。
  hasRenderCell: boolean;
}): boolean =>
  params.enabled && !params.isAutoHeightCell && !params.hasRenderCell;