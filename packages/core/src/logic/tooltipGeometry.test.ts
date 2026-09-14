import { describe, expect, it } from 'vitest';
import {
  computeTooltipPlacement,
  TOOLTIP_GAP_PX,
  TOOLTIP_VIEWPORT_MARGIN_PX,
} from './tooltipGeometry';

// 対象 rect のショートハンドです(width と top/left/bottom だけ使います)。
function rect(top: number, left: number, width: number, height: number) {
  return { top, left, width, bottom: top + height };
}

describe('computeTooltipPlacement', () => {
  it('基本は対象の上・水平中央に置く', () => {
    // 対象: top=100 left=200 width=40 → 中心 x=220。tip 100x20。
    const p = computeTooltipPlacement({
      targetRect: rect(100, 200, 40, 24),
      tipWidth: 100,
      tipHeight: 20,
      viewportWidth: 1000,
    });
    expect(p.below).toBe(false);
    expect(p.left).toBe(170); // 220 - 100/2
    expect(p.top).toBe(100 - 20 - TOOLTIP_GAP_PX);
  });

  it('左端は margin へ clamp する', () => {
    const p = computeTooltipPlacement({
      targetRect: rect(100, 0, 20, 24),
      tipWidth: 120,
      tipHeight: 20,
      viewportWidth: 1000,
    });
    expect(p.left).toBe(TOOLTIP_VIEWPORT_MARGIN_PX);
  });

  it('右端は viewportWidth - tipWidth - margin へ clamp する', () => {
    const p = computeTooltipPlacement({
      targetRect: rect(100, 980, 20, 24),
      tipWidth: 120,
      tipHeight: 20,
      viewportWidth: 1000,
    });
    expect(p.left).toBe(1000 - 120 - TOOLTIP_VIEWPORT_MARGIN_PX);
  });

  it('極小画面では左端 margin を優先する(clamp の反転時)', () => {
    // viewport 100 に対して tip 200 → min 側が負になるが、左端 margin を優先。
    const p = computeTooltipPlacement({
      targetRect: rect(100, 10, 20, 24),
      tipWidth: 200,
      tipHeight: 20,
      viewportWidth: 100,
    });
    expect(p.left).toBe(TOOLTIP_VIEWPORT_MARGIN_PX);
  });

  it('上に入らないときは対象の下へフリップする', () => {
    // top=10 で tip 高 20 + gap 7 → 上端 -17 < margin → below。
    const p = computeTooltipPlacement({
      targetRect: rect(10, 200, 40, 24),
      tipWidth: 100,
      tipHeight: 20,
      viewportWidth: 1000,
    });
    expect(p.below).toBe(true);
    expect(p.top).toBe(10 + 24 + TOOLTIP_GAP_PX);
  });

  it('上端がちょうど margin のときは上に置く(フリップしない)', () => {
    // top = margin + tipHeight + gap → aboveTop がちょうど margin。
    const top = TOOLTIP_VIEWPORT_MARGIN_PX + 20 + TOOLTIP_GAP_PX;
    const p = computeTooltipPlacement({
      targetRect: rect(top, 200, 40, 24),
      tipWidth: 100,
      tipHeight: 20,
      viewportWidth: 1000,
    });
    expect(p.below).toBe(false);
    expect(p.top).toBe(TOOLTIP_VIEWPORT_MARGIN_PX);
  });
});