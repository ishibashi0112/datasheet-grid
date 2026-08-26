// 追加(FIT-1): 列フィルター popover 配置計算の回帰テストです。
//   従来実装(見積もり高さのみ・下端クランプなし)では「実高 > 見積もり」や小さい viewport で
//   下端が画面外へはみ出していました(修正前は『はみ出し系』のケースが落ちます)。
import { describe, it, expect } from 'vitest';

import { computeFilterPopoverPlacement } from './filterPopoverLayout';

// 共通入力(1080p 相当の viewport / 幅 240 / margin 8 / offset 8)です。
const base = {
  anchorTop: 100,
  anchorBottom: 130,
  anchorRight: 800,
  viewportWidth: 1920,
  viewportHeight: 1080,
  popupWidth: 240,
  popupHeight: 470,
  offsetY: 8,
  viewportMargin: 8,
};

describe('computeFilterPopoverPlacement', () => {
  it('下に収まる場合は anchor 直下 + 右揃えに配置する', () => {
    const placement = computeFilterPopoverPlacement(base);
    expect(placement).toEqual({
      top: 138, // anchorBottom 130 + offset 8
      left: 560, // anchorRight 800 - width 240
      maxHeight: 1064, // 1080 - 8×2
    });
  });

  it('下に収まらない場合は anchor の上へフリップする', () => {
    const placement = computeFilterPopoverPlacement({
      ...base,
      anchorTop: 900,
      anchorBottom: 930,
    });
    // 上フリップ: anchorTop 900 - height 470 - offset 8
    expect(placement.top).toBe(422);
    // 全体が viewport 内に収まっていること。
    expect(placement.top + base.popupHeight).toBeLessThanOrEqual(1080 - 8);
  });

  it('anchor が上端付近で実高が下に収まらない場合も下端を viewport 内へ収める', () => {
    // 修正前実装では top = 138 のまま 138 + 700 = 838 > 592(= 600 - 8)ではみ出していました。
    const placement = computeFilterPopoverPlacement({
      ...base,
      viewportHeight: 600,
      popupHeight: 700,
    });
    // maxHeight = 584 に切り詰めた上で、下端 = viewport - margin へ収まる位置まで引き上げます。
    expect(placement.maxHeight).toBe(584);
    expect(placement.top).toBe(8);
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(600 - 8);
  });

  it('viewport より高い実高でも top は margin を下回らない', () => {
    const placement = computeFilterPopoverPlacement({
      ...base,
      viewportHeight: 400,
      popupHeight: 1200,
    });
    expect(placement.top).toBe(8);
    expect(placement.maxHeight).toBe(384);
  });

  it('左右も margin でクランプされる(左端はみ出し)', () => {
    const placement = computeFilterPopoverPlacement({
      ...base,
      anchorRight: 100, // 100 - 240 = -140 → margin 8 へ
    });
    expect(placement.left).toBe(8);
  });

  it('左右も margin でクランプされる(右端はみ出し)', () => {
    const placement = computeFilterPopoverPlacement({
      ...base,
      anchorRight: 1918, // 1918 - 240 = 1678 > 1920 - 240 - 8 = 1672 → 1672 へ
    });
    expect(placement.left).toBe(1672);
  });
});
