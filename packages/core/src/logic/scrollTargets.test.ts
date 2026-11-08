import { describe, it, expect } from 'vitest';

import {
  computeVerticalScrollTarget,
  computeHorizontalScrollTarget,
} from './scrollTargets';

// 縦: headerHeight=40 / viewportHeight=400 / rowHeight=36 を基準にします。
const V = { headerHeight: 40, viewportHeight: 400, rowHeight: 36 };

describe('computeVerticalScrollTarget', () => {
  it('start: 行上端をヘッダー直下に合わせる', () => {
    expect(
      computeVerticalScrollTarget({
        ...V,
        rowTop: 10000,
        currentScrollTop: 0,
        align: 'start',
      }),
    ).toBe(10000);
  });

  it('end: 行下端をビューポート下端に合わせる', () => {
    expect(
      computeVerticalScrollTarget({
        ...V,
        rowTop: 10000,
        currentScrollTop: 0,
        align: 'end',
      }),
    ).toBe(9676); // (40+10000+36) - 400
  });

  it('center: 行を可視帯の中央へ', () => {
    expect(
      computeVerticalScrollTarget({
        ...V,
        rowTop: 10000,
        currentScrollTop: 0,
        align: 'center',
      }),
    ).toBe(9838); // (10040+10076)/2 - (40+400)/2
  });

  it('auto: 既に可視ならスクロールしない', () => {
    expect(
      computeVerticalScrollTarget({
        ...V,
        rowTop: 10000,
        currentScrollTop: 9900,
        align: 'auto',
      }),
    ).toBe(9900);
  });

  // 追加(段階 2 の確かめ直し N4-1): ラベル行の固定の帯(高さ 30)がヘッダーの直下にあるとき。
  it('stickyTopInset: start と上へ見せる auto は帯の下に置き、帯に隠れている行は見えていない扱い', () => {
    const stickyTopInset = { visibleAt: () => 30, coveringRowAt: () => 30 };
    expect(computeVerticalScrollTarget({ ...V, rowTop: 10000, currentScrollTop: 0, align: 'start', stickyTopInset })).toBe(9970);
    // 行の上端(10010)は見出しの下(10000)だが帯(〜10030)の裏 → 帯の下へ。
    expect(computeVerticalScrollTarget({ ...V, rowTop: 10010, currentScrollTop: 10000, align: 'auto', stickyTopInset })).toBe(9980);
    // 帯より下に見えていれば動かさない。
    expect(computeVerticalScrollTarget({ ...V, rowTop: 10030, currentScrollTop: 10000, align: 'auto', stickyTopInset })).toBe(10000);
    // 帯が無い位置(visibleAt 0)で上にはみ出す行は、行を隠す帯(coveringRowAt)の分だけ上へ。
    expect(
      computeVerticalScrollTarget({
        ...V,
        rowTop: 100,
        currentScrollTop: 500,
        align: 'auto',
        stickyTopInset: { visibleAt: () => 0, coveringRowAt: () => 30 },
      }),
    ).toBe(70);
  });

  it('auto: 下にはみ出すなら end 整列', () => {
    expect(
      computeVerticalScrollTarget({
        ...V,
        rowTop: 10000,
        currentScrollTop: 0,
        align: 'auto',
      }),
    ).toBe(9676);
  });

  it('下限 0 でクランプ(先頭行で end など負になる場合)', () => {
    expect(
      computeVerticalScrollTarget({
        ...V,
        rowTop: 0,
        currentScrollTop: 0,
        align: 'end',
      }),
    ).toBe(0);
  });

  it('maxScrollTop 上限でクランプ', () => {
    expect(
      computeVerticalScrollTarget({
        ...V,
        rowTop: 10000,
        currentScrollTop: 0,
        align: 'start',
        maxScrollTop: 5000,
      }),
    ).toBe(5000);
  });
});

// 横: leftPaneWidth=56 / rightPaneWidth=0 / viewportWidth=800 を基準にします。
const H = { leftPaneWidth: 56, rightPaneWidth: 0, viewportWidth: 800 };

describe('computeHorizontalScrollTarget', () => {
  it('start: 列左端を左固定ペイン直右に合わせる', () => {
    expect(
      computeHorizontalScrollTarget({
        ...H,
        cellLeft: 2000,
        cellWidth: 100,
        currentScrollLeft: 0,
        align: 'start',
      }),
    ).toBe(1944); // 2000 - 56
  });

  it('end: 列右端をビューポート右端に合わせる', () => {
    expect(
      computeHorizontalScrollTarget({
        ...H,
        cellLeft: 2000,
        cellWidth: 100,
        currentScrollLeft: 0,
        align: 'end',
      }),
    ).toBe(1300); // 2100 - 800 + 0
  });

  it('center: 列を可視帯の中央へ', () => {
    expect(
      computeHorizontalScrollTarget({
        ...H,
        cellLeft: 2000,
        cellWidth: 100,
        currentScrollLeft: 0,
        align: 'center',
      }),
    ).toBe(1622); // (2000+2100)/2 - 56 - (800-56)/2
  });

  it('auto: 既に可視ならスクロールしない', () => {
    expect(
      computeHorizontalScrollTarget({
        ...H,
        cellLeft: 56,
        cellWidth: 120,
        currentScrollLeft: 0,
        align: 'auto',
      }),
    ).toBe(0);
  });
});