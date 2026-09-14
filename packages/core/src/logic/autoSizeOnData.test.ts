import { describe, it, expect } from 'vitest';
import { resolveAutoSizeOnData } from './autoSizeOnData';

// 追加: autoSizeColumns の発火判定(純関数)のテストです。実計測は canvas 依存で jsdom では
//   検証できないため、ここでは「いつ shouldRun=true になるか / mount フラグの遷移」だけを固定します。
describe('resolveAutoSizeOnData', () => {
  it('mode=false は行数によらず発火しない(フラグ据え置き)', () => {
    expect(
      resolveAutoSizeOnData({
        mode: false,
        isServerSide: false,
        rowCount: 100,
        hasAutoSizedOnMount: false,
      }),
    ).toEqual({ shouldRun: false, nextHasAutoSizedOnMount: false });
  });

  it('serverSide は発火しない(未ロード行を測れないため)', () => {
    expect(
      resolveAutoSizeOnData({
        mode: 'onDataChange',
        isServerSide: true,
        rowCount: 100,
        hasAutoSizedOnMount: false,
      }),
    ).toEqual({ shouldRun: false, nextHasAutoSizedOnMount: false });
  });

  it('rowCount=0(空データ)は発火しない', () => {
    expect(
      resolveAutoSizeOnData({
        mode: 'onMount',
        isServerSide: false,
        rowCount: 0,
        hasAutoSizedOnMount: false,
      }),
    ).toEqual({ shouldRun: false, nextHasAutoSizedOnMount: false });
  });

  it("'onMount' 未発火 + 行あり → 発火し、フラグを true にする", () => {
    expect(
      resolveAutoSizeOnData({
        mode: 'onMount',
        isServerSide: false,
        rowCount: 100,
        hasAutoSizedOnMount: false,
      }),
    ).toEqual({ shouldRun: true, nextHasAutoSizedOnMount: true });
  });

  it("'onMount' 発火済み → 二度目以降は発火しない(フラグ true 維持)", () => {
    expect(
      resolveAutoSizeOnData({
        mode: 'onMount',
        isServerSide: false,
        rowCount: 100,
        hasAutoSizedOnMount: true,
      }),
    ).toEqual({ shouldRun: false, nextHasAutoSizedOnMount: true });
  });

  it("'onDataChange' 行あり → 発火し、mount フラグは使わない(据え置き)", () => {
    expect(
      resolveAutoSizeOnData({
        mode: 'onDataChange',
        isServerSide: false,
        rowCount: 100,
        hasAutoSizedOnMount: false,
      }),
    ).toEqual({ shouldRun: true, nextHasAutoSizedOnMount: false });
  });

  it("'onDataChange' は連続呼び出しでも毎回発火する", () => {
    const first = resolveAutoSizeOnData({
      mode: 'onDataChange',
      isServerSide: false,
      rowCount: 10,
      hasAutoSizedOnMount: false,
    });
    const second = resolveAutoSizeOnData({
      mode: 'onDataChange',
      isServerSide: false,
      rowCount: 20,
      hasAutoSizedOnMount: first.nextHasAutoSizedOnMount,
    });
    expect(first.shouldRun).toBe(true);
    expect(second.shouldRun).toBe(true);
  });
});