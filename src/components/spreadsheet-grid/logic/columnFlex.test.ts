import { describe, it, expect } from 'vitest';

import {
  DEFAULT_FLEX_MIN_WIDTH,
  isFlexingColumn,
  computeCenterFlexWidths,
} from './columnFlex';
import type { GridColumn } from '../model/gridTypes';

type Row = Record<string, unknown>;

// テスト用の列ファクトリ(必要なフィールドだけ指定し、残りは既定で埋めます)。
const col = (over: Partial<GridColumn<Row>> & { key: string }): GridColumn<Row> => ({
  width: 100,
  ...over,
});

// 確定幅の合計(横スクロール判定 = 合計と available の比較)を取るユーティリティ。
const sum = (widths: Record<string, number>): number =>
  Object.values(widths).reduce((acc, w) => acc + w, 0);

describe('isFlexingColumn', () => {
  it('center(非 pinned) かつ flex>0 のときだけ true', () => {
    expect(isFlexingColumn(col({ key: 'a', flex: 1 }))).toBe(true);
    expect(isFlexingColumn(col({ key: 'a', flex: 2 }))).toBe(true);
  });

  it('flex 未指定 / flex<=0 は false', () => {
    expect(isFlexingColumn(col({ key: 'a' }))).toBe(false);
    expect(isFlexingColumn(col({ key: 'a', flex: 0 }))).toBe(false);
    expect(isFlexingColumn(col({ key: 'a', flex: -1 }))).toBe(false);
  });

  it('pinned 列は flex 指定があっても false(sticky 配置のため対象外)', () => {
    expect(isFlexingColumn(col({ key: 'a', flex: 1, pinned: 'left' }))).toBe(false);
    expect(isFlexingColumn(col({ key: 'a', flex: 1, pinned: 'right' }))).toBe(false);
  });
});

describe('computeCenterFlexWidths', () => {
  it('flex 列が無ければ空 map(呼び出し側は素通し)', () => {
    const result = computeCenterFlexWidths(
      [col({ key: 'a', width: 100 }), col({ key: 'b', width: 200 })],
      {},
      500,
    );
    expect(result).toEqual({});
  });

  it('単一 flex 列は「利用可能幅 − 固定列合計」を埋める', () => {
    const result = computeCenterFlexWidths(
      [col({ key: 'a', width: 100 }), col({ key: 'b', flex: 1 })],
      {},
      300,
    );
    expect(result).toEqual({ b: 200 });
  });

  it('複数 flex 列は flex 比で配分し、合計は利用可能幅に厳密一致', () => {
    const result = computeCenterFlexWidths(
      [col({ key: 'a', flex: 1 }), col({ key: 'b', flex: 2 })],
      {},
      300,
    );
    expect(result).toEqual({ a: 100, b: 200 });
    expect(sum(result)).toBe(300);
  });

  it('返り値は flex 列のキーのみを含む(固定列は含めない)', () => {
    const result = computeCenterFlexWidths(
      [col({ key: 'a', width: 100 }), col({ key: 'b', flex: 1 })],
      {},
      300,
    );
    expect(Object.keys(result)).toEqual(['b']);
  });

  it('minWidth 到達列はクランプし、残りを残列で再配分', () => {
    // available 200 / 2 列(flex 1 ずつ)→ 暫定 100 ずつ。a は min 150 で潰せないので 150 に確定、
    //   残り 50 を b(min 既定 50)が受ける。
    const result = computeCenterFlexWidths(
      [col({ key: 'a', flex: 1, minWidth: 150 }), col({ key: 'b', flex: 1 })],
      {},
      200,
    );
    expect(result).toEqual({ a: 150, b: 50 });
    expect(sum(result)).toBe(200);
  });

  it('maxWidth 到達列はクランプし、余剰を残列で再配分', () => {
    // available 300 / 2 列(flex 1 ずつ)→ 暫定 150 ずつ。a は max 80 を超えるので 80 に確定、
    //   残り 220 を b が受ける。
    const result = computeCenterFlexWidths(
      [col({ key: 'a', flex: 1, maxWidth: 80 }), col({ key: 'b', flex: 1 })],
      {},
      300,
    );
    expect(result).toEqual({ a: 80, b: 220 });
    expect(sum(result)).toBe(300);
  });

  it('minWidth 未指定の flex 列は DEFAULT_FLEX_MIN_WIDTH を下限に使う', () => {
    // available 60 / flex 1 が 2 列。固定列なし。暫定 30 ずつ → どちらも既定 min(50)未満。
    //   a を 50 へ確定 → 残り 10 / b 暫定 10 も 50 未満 → b も 50。合計 100(>60 = 横スクロール)。
    const result = computeCenterFlexWidths(
      [col({ key: 'a', flex: 1 }), col({ key: 'b', flex: 1 })],
      {},
      60,
    );
    expect(result).toEqual({ a: DEFAULT_FLEX_MIN_WIDTH, b: DEFAULT_FLEX_MIN_WIDTH });
  });

  it('固定列合計が利用可能幅を超える場合、flex 列は min まで潰れる(横スクロール)', () => {
    // 固定 400 + flex 1 / available 300 → flexSpace = -100 → flex は min(既定 50)へ。
    const result = computeCenterFlexWidths(
      [col({ key: 'a', width: 400 }), col({ key: 'b', flex: 1 })],
      {},
      300,
    );
    expect(result).toEqual({ b: DEFAULT_FLEX_MIN_WIDTH });
    // 合計(400 + 50 = 450)> available(300)= 横スクロール発生。
  });

  it('手動リサイズ済み(columnWidths にエントリ)の flex 列は固定として除外', () => {
    // a は flex 指定だが columnWidths[a]=250 があるので固定扱い → fixedTotal に算入。
    //   残り(500 − 250 = 250)を b(flex 1)が受ける。a は返り値に含まれない。
    const result = computeCenterFlexWidths(
      [col({ key: 'a', flex: 1 }), col({ key: 'b', flex: 1 })],
      { a: 250 },
      500,
    );
    expect(result).toEqual({ b: 250 });
    expect(result).not.toHaveProperty('a');
  });

  it('割り切れない比率でも合計は利用可能幅に厳密一致(端数は最後の列へ)', () => {
    // min(既定 50)に張り付かないよう十分な available を与え、純粋な比率配分の端数処理を見ます。
    const result = computeCenterFlexWidths(
      [col({ key: 'a', flex: 1 }), col({ key: 'b', flex: 1 }), col({ key: 'c', flex: 1 })],
      {},
      1000,
    );
    expect(sum(result)).toBeCloseTo(1000, 10);
    // 先頭 2 列は等分、最後が端数吸収。
    expect(result.a).toBeCloseTo(1000 / 3, 10);
    expect(result.b).toBeCloseTo(1000 / 3, 10);
  });

  it('pinned 列が混在しても flex 対象外(固定として available から差し引く)', () => {
    // 仮に pinned 列が center リストへ紛れても、getColumnPane!==center で固定扱いになる。
    const result = computeCenterFlexWidths(
      [col({ key: 'p', flex: 1, pinned: 'left', width: 120 }), col({ key: 'b', flex: 1 })],
      {},
      300,
    );
    // p は固定(width 120)→ 残り 180 を b が受ける。p は返り値に含まれない。
    expect(result).toEqual({ b: 180 });
  });
});