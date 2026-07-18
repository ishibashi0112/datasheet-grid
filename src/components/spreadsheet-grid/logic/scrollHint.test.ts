// scrollHint 純ロジックのユニットテストです。
import { describe, expect, it } from 'vitest';
import {
  SCROLL_HINT_MIN_THUMB_PX,
  computeScrollHintTrack,
  resolveScrollHintDetail,
  resolveScrollHintOptions,
} from './scrollHint';

describe('resolveScrollHintOptions', () => {
  it('undefined / false は null(完全無効 = 既存挙動)', () => {
    expect(resolveScrollHintOptions(undefined)).toBeNull();
    expect(resolveScrollHintOptions(false)).toBeNull();
  });

  it('true は全既定(bubble + ruler / trigger=scroll)', () => {
    expect(resolveScrollHintOptions(true)).toEqual({
      bubble: true,
      ruler: true,
      trigger: 'scroll',
      hintColumn: undefined,
      renderHint: undefined,
    });
  });

  it('オブジェクトの省略項目は既定で補完される', () => {
    const resolved = resolveScrollHintOptions({ hintColumn: 'code' });
    expect(resolved).not.toBeNull();
    expect(resolved?.bubble).toBe(true);
    expect(resolved?.ruler).toBe(true);
    expect(resolved?.trigger).toBe('scroll');
    expect(resolved?.hintColumn).toBe('code');
  });

  it('個別 off の明示指定が既定に勝つ', () => {
    const resolved = resolveScrollHintOptions({
      ruler: false,
      trigger: 'always',
    });
    expect(resolved?.bubble).toBe(true);
    expect(resolved?.ruler).toBe(false);
    expect(resolved?.trigger).toBe('always');
  });

  it('bubble も ruler も false なら null(表示物なし)', () => {
    expect(resolveScrollHintOptions({ bubble: false, ruler: false })).toBeNull();
  });
});

describe('computeScrollHintTrack', () => {
  it('スクロール不能(content <= viewport)や viewport 未計測では null', () => {
    expect(
      computeScrollHintTrack({
        scrollTop: 0,
        contentHeight: 300,
        viewportHeight: 480,
      }),
    ).toBeNull();
    expect(
      computeScrollHintTrack({
        scrollTop: 0,
        contentHeight: 1000,
        viewportHeight: 0,
      }),
    ).toBeNull();
  });

  it('先頭で thumbTop=0、末尾でサム下端がトラック下端に一致する', () => {
    const params = { contentHeight: 4800, viewportHeight: 480 };
    const top = computeScrollHintTrack({ ...params, scrollTop: 0 });
    expect(top?.thumbTop).toBe(0);
    const bottom = computeScrollHintTrack({
      ...params,
      scrollTop: params.contentHeight - params.viewportHeight,
    });
    expect(bottom).not.toBeNull();
    expect((bottom?.thumbTop ?? 0) + (bottom?.thumbHeight ?? 0)).toBeCloseTo(
      params.viewportHeight,
    );
  });

  it('巨大コンテンツでも thumbHeight は最小値を下回らない', () => {
    const track = computeScrollHintTrack({
      scrollTop: 0,
      contentHeight: 15_000_000,
      viewportHeight: 480,
    });
    expect(track?.thumbHeight).toBe(SCROLL_HINT_MIN_THUMB_PX);
  });

  it('scrollTop は可動域へ clamp される(負値 / 超過)', () => {
    const params = { contentHeight: 4800, viewportHeight: 480 };
    const negative = computeScrollHintTrack({ ...params, scrollTop: -100 });
    expect(negative?.thumbTop).toBe(0);
    const over = computeScrollHintTrack({ ...params, scrollTop: 99_999 });
    expect((over?.thumbTop ?? 0) + (over?.thumbHeight ?? 0)).toBeCloseTo(
      params.viewportHeight,
    );
  });

  it('centerY はサム中心を指す', () => {
    const track = computeScrollHintTrack({
      scrollTop: 0,
      contentHeight: 4800,
      viewportHeight: 480,
    });
    expect(track?.centerY).toBeCloseTo((track?.thumbHeight ?? 0) / 2);
  });
});

describe('resolveScrollHintDetail', () => {
  type Row = { code: string; name: string; count: number };
  const row: Row = { code: 'KX-48293', name: '渡辺 大輔', count: 3 };

  it('renderHint が最優先で呼ばれ、返り値がそのまま detail になる', () => {
    const detail = resolveScrollHintDetail<Row>(
      {
        hintColumn: 'name',
        renderHint: ({ rowIndex, rowData }) =>
          `${rowData?.code} (${rowIndex + 1})`,
      },
      { rowIndex: 41, rowData: row },
    );
    expect(detail).toBe('KX-48293 (42)');
  });

  it('renderHint の null / undefined / false は null(既定表示へフォールバック)', () => {
    expect(
      resolveScrollHintDetail<Row>(
        { hintColumn: undefined, renderHint: () => null },
        { rowIndex: 0, rowData: row },
      ),
    ).toBeNull();
    expect(
      resolveScrollHintDetail<Row>(
        { hintColumn: undefined, renderHint: () => undefined },
        { rowIndex: 0, rowData: row },
      ),
    ).toBeNull();
    expect(
      resolveScrollHintDetail<Row>(
        { hintColumn: undefined, renderHint: () => false },
        { rowIndex: 0, rowData: row },
      ),
    ).toBeNull();
  });

  it('renderHint には rowData undefined(SSRM 未ロード)がそのまま渡る', () => {
    const seen: Array<Row | undefined> = [];
    resolveScrollHintDetail<Row>(
      {
        hintColumn: undefined,
        renderHint: ({ rowData }) => {
          seen.push(rowData);
          return null;
        },
      },
      { rowIndex: 10, rowData: undefined },
    );
    expect(seen).toEqual([undefined]);
  });

  it('hintColumn は行データの列値を文字列化する(数値もOK)', () => {
    expect(
      resolveScrollHintDetail<Row>(
        { hintColumn: 'code', renderHint: undefined },
        { rowIndex: 0, rowData: row },
      ),
    ).toBe('KX-48293');
    expect(
      resolveScrollHintDetail<Row>(
        { hintColumn: 'count', renderHint: undefined },
        { rowIndex: 0, rowData: row },
      ),
    ).toBe('3');
  });

  it('hintColumn は rowData undefined / 列値 null・undefined・空文字で null', () => {
    expect(
      resolveScrollHintDetail<Row>(
        { hintColumn: 'code', renderHint: undefined },
        { rowIndex: 0, rowData: undefined },
      ),
    ).toBeNull();
    expect(
      resolveScrollHintDetail<{ v: string | null }>(
        { hintColumn: 'v', renderHint: undefined },
        { rowIndex: 0, rowData: { v: null } },
      ),
    ).toBeNull();
    expect(
      resolveScrollHintDetail<{ v: string }>(
        { hintColumn: 'v', renderHint: undefined },
        { rowIndex: 0, rowData: { v: '' } },
      ),
    ).toBeNull();
    expect(
      resolveScrollHintDetail<{ v: string }>(
        { hintColumn: 'missing', renderHint: undefined },
        { rowIndex: 0, rowData: { v: 'x' } },
      ),
    ).toBeNull();
  });

  it('hintColumn / renderHint の両方未指定は null', () => {
    expect(
      resolveScrollHintDetail<Row>(
        { hintColumn: undefined, renderHint: undefined },
        { rowIndex: 0, rowData: row },
      ),
    ).toBeNull();
  });
});