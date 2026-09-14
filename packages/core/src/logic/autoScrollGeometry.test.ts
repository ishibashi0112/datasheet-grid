import { describe, it, expect } from 'vitest';

import {
  computeNextScrollPosition,
  hasPointerLeftActivationRadius,
  resolveAutoScrollAxisDirection,
  resolveScrollContentBox,
} from './autoScrollGeometry';

describe('resolveScrollContentBox', () => {
  it('ボーダー(clientLeft/Top)とスクロールバー幅を除いたコンテンツ領域を返す', () => {
    // 外形 800x600 / ボーダー各 1px / 縦横スクロールバー 15px の想定:
    //   clientWidth = 800 - 2 - 15 = 783 / clientHeight = 600 - 2 - 15 = 583
    expect(
      resolveScrollContentBox({
        rectLeft: 100,
        rectTop: 50,
        clientLeft: 1,
        clientTop: 1,
        clientWidth: 783,
        clientHeight: 583,
      }),
    ).toEqual({ left: 101, top: 51, right: 884, bottom: 634 });
  });

  it('ボーダー・スクロールバーなしなら外形と一致する', () => {
    expect(
      resolveScrollContentBox({
        rectLeft: 0,
        rectTop: 0,
        clientLeft: 0,
        clientTop: 0,
        clientWidth: 500,
        clientHeight: 400,
      }),
    ).toEqual({ left: 0, top: 0, right: 500, bottom: 400 });
  });
});

describe('resolveAutoScrollAxisDirection', () => {
  // コンテンツ領域 [100, 900] / 端帯 24px を基準にします。
  it('始端帯内(start + threshold 未満)は -1', () => {
    expect(resolveAutoScrollAxisDirection(100, 100, 900, 24)).toBe(-1);
    expect(resolveAutoScrollAxisDirection(123, 100, 900, 24)).toBe(-1);
  });

  it('終端帯内(end - threshold 超)は 1', () => {
    expect(resolveAutoScrollAxisDirection(877, 100, 900, 24)).toBe(1);
    expect(resolveAutoScrollAxisDirection(900, 100, 900, 24)).toBe(1);
  });

  it('帯の外(境界ちょうどを含む)は 0', () => {
    expect(resolveAutoScrollAxisDirection(124, 100, 900, 24)).toBe(0);
    expect(resolveAutoScrollAxisDirection(500, 100, 900, 24)).toBe(0);
    expect(resolveAutoScrollAxisDirection(876, 100, 900, 24)).toBe(0);
  });

  it('回帰(スクロールバー食われ): 外形基準では帯外だった実セル右端付近が、コンテンツ基準では帯内になる', () => {
    // 外形右端 916(縦スクロールバー 15px + ボーダー 1px 込み) / コンテンツ右端 900。
    // ポインタ 880 は旧実装(916 - 24 = 892 より右で発動)では帯外でしたが、
    // 新実装(900 - 24 = 876 より右で発動)では帯内です。
    expect(resolveAutoScrollAxisDirection(880, 100, 900, 24)).toBe(1);
  });
});

describe('computeNextScrollPosition', () => {
  it('direction=0 は現在値を維持する', () => {
    expect(computeNextScrollPosition(120, 0, 18, 1000)).toBe(120);
  });

  it('正方向は step ぶん進み、max で頭打ちになる', () => {
    expect(computeNextScrollPosition(120, 1, 18, 1000)).toBe(138);
    expect(computeNextScrollPosition(990, 1, 18, 1000)).toBe(1000);
    // 端到達後は current === next のため、呼び出し側の scrollTo/選択更新が完全に止まります。
    expect(computeNextScrollPosition(1000, 1, 18, 1000)).toBe(1000);
  });

  it('負方向は step ぶん戻り、0 で頭打ちになる', () => {
    expect(computeNextScrollPosition(120, -1, 18, 1000)).toBe(102);
    expect(computeNextScrollPosition(10, -1, 18, 1000)).toBe(0);
    expect(computeNextScrollPosition(0, -1, 18, 1000)).toBe(0);
  });

  it('max が負(コンテンツがビューポート以下)でも 0 未満へは進まない', () => {
    expect(computeNextScrollPosition(0, 1, 18, -5)).toBe(0);
  });
});

describe('hasPointerLeftActivationRadius', () => {
  const origin = { x: 100, y: 100 };

  it('起点から activationDistance 未満なら false(押しただけ/手ブレでは発動しない)', () => {
    expect(
      hasPointerLeftActivationRadius(origin, { x: 100, y: 100 }, 6),
    ).toBe(false);
    // 距離 5(3-4-5 の直角三角形)。
    expect(
      hasPointerLeftActivationRadius(origin, { x: 103, y: 104 }, 6),
    ).toBe(false);
  });

  it('activationDistance ちょうど以上なら true', () => {
    expect(
      hasPointerLeftActivationRadius(origin, { x: 106, y: 100 }, 6),
    ).toBe(true);
    expect(
      hasPointerLeftActivationRadius(origin, { x: 100, y: 94 }, 6),
    ).toBe(true);
    // 斜め移動(距離 ≒7.07)。
    expect(
      hasPointerLeftActivationRadius(origin, { x: 105, y: 105 }, 6),
    ).toBe(true);
  });
});