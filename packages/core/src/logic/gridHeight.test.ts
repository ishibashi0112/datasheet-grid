// 追加(fill-height): height / maxHeight → inline style 解決の純関数テストです。
import { describe, expect, it } from 'vitest';
import { isParentRelativeHeight, resolveGridHeightLayout } from './gridHeight';

describe('isParentRelativeHeight', () => {
  it("'%' を含む文字列だけを親基準とみなす", () => {
    expect(isParentRelativeHeight('100%')).toBe(true);
    expect(isParentRelativeHeight('50%')).toBe(true);
    expect(isParentRelativeHeight('calc(100% - 40px)')).toBe(true);
    expect(isParentRelativeHeight('min(100%, 800px)')).toBe(true);
  });

  it('number / % を含まない文字列 / 未指定は親基準ではない', () => {
    expect(isParentRelativeHeight(400)).toBe(false);
    expect(isParentRelativeHeight('400px')).toBe(false);
    expect(isParentRelativeHeight('50vh')).toBe(false);
    expect(isParentRelativeHeight('calc(100vh - 120px)')).toBe(false);
    expect(isParentRelativeHeight(undefined)).toBe(false);
  });
});

describe('resolveGridHeightLayout', () => {
  it('両者未指定: inline を付けず CSS 既定(max-height: 480px)に委ねる', () => {
    expect(resolveGridHeightLayout(undefined, undefined)).toEqual({
      fillParent: false,
      rootStyle: undefined,
      scrollContainerStyle: undefined,
    });
  });

  it('number: スクロールコンテナの高さ(CSS 既定 480 は none で打ち消す)。ルートは触らない', () => {
    expect(resolveGridHeightLayout(400, undefined)).toEqual({
      fillParent: false,
      rootStyle: undefined,
      scrollContainerStyle: { height: 400, maxHeight: 'none' },
    });
  });

  it("'%' を含まない文字列は従来どおりスクロールコンテナの高さ", () => {
    expect(resolveGridHeightLayout('50vh', undefined)).toEqual({
      fillParent: false,
      rootStyle: undefined,
      scrollContainerStyle: { height: '50vh', maxHeight: 'none' },
    });
  });

  it('maxHeight のみ: スクロールコンテナの上限だけを当てる', () => {
    expect(resolveGridHeightLayout(undefined, 300)).toEqual({
      fillParent: false,
      rootStyle: undefined,
      scrollContainerStyle: { maxHeight: 300 },
    });
  });

  it('number + maxHeight: 両方をスクロールコンテナへ当てる', () => {
    expect(resolveGridHeightLayout(400, 300)).toEqual({
      fillParent: false,
      rootStyle: undefined,
      scrollContainerStyle: { height: 400, maxHeight: 300 },
    });
  });

  it("'%': ルートに height を当てて fill モード。スクロールコンテナは max-height:none だけ", () => {
    expect(resolveGridHeightLayout('100%', undefined)).toEqual({
      fillParent: true,
      rootStyle: { height: '100%' },
      scrollContainerStyle: { maxHeight: 'none' },
    });
    expect(resolveGridHeightLayout('calc(100% - 40px)', undefined)).toEqual({
      fillParent: true,
      rootStyle: { height: 'calc(100% - 40px)' },
      scrollContainerStyle: { maxHeight: 'none' },
    });
  });

  it("'%' + maxHeight: ルートは max-height、スクロールコンテナは maxHeight の高さで置く", () => {
    expect(resolveGridHeightLayout('100%', 300)).toEqual({
      fillParent: true,
      rootStyle: { maxHeight: '100%' },
      scrollContainerStyle: { height: 300, maxHeight: 300 },
    });
  });
});