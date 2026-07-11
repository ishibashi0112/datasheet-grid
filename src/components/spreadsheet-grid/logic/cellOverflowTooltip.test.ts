import { describe, it, expect } from 'vitest';
import { shouldMarkCellOverflowTooltip } from './cellOverflowTooltip';

// 追加: 省略ツールチップのマーカー付与判定(純関数)のテストです。実クリップ判定は DOM 依存で
//   jsdom では検証できないため、ここでは「どのセルにマーカーを付けるか」の分岐だけを固定します。
describe('shouldMarkCellOverflowTooltip', () => {
  it('無効(enabled=false)なら常に付与しない', () => {
    expect(
      shouldMarkCellOverflowTooltip({
        enabled: false,
        isAutoHeightCell: false,
        hasRenderCell: false,
      }),
    ).toBe(false);
  });

  it('有効 + 既定テキストセル(非 autoHeight / 非 renderCell)なら付与する', () => {
    expect(
      shouldMarkCellOverflowTooltip({
        enabled: true,
        isAutoHeightCell: false,
        hasRenderCell: false,
      }),
    ).toBe(true);
  });

  it('有効でも autoHeight 折り返しセルには付与しない', () => {
    expect(
      shouldMarkCellOverflowTooltip({
        enabled: true,
        isAutoHeightCell: true,
        hasRenderCell: false,
      }),
    ).toBe(false);
  });

  it('有効でも renderCell 列には付与しない', () => {
    expect(
      shouldMarkCellOverflowTooltip({
        enabled: true,
        isAutoHeightCell: false,
        hasRenderCell: true,
      }),
    ).toBe(false);
  });
});