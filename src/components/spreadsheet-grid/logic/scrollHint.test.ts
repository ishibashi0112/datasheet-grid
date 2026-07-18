// scrollHint 純ロジックのユニットテストです。
import { describe, expect, it } from 'vitest';
import {
  SCROLL_HINT_MIN_THUMB_PX,
  computeScrollHintRulerTicks,
  computeScrollHintTrack,
  computeScrollHintTrackPointerScrollTop,
  formatScrollHintRulerValue,
  niceStepAtLeast,
  resolveScrollHintDetail,
  resolveScrollHintOptions,
} from './scrollHint';

describe('resolveScrollHintOptions', () => {
  it('undefined / false は null(完全無効 = 既存挙動)', () => {
    expect(resolveScrollHintOptions(undefined)).toBeNull();
    expect(resolveScrollHintOptions(false)).toBeNull();
  });

  it('true は全既定(bubble + ruler + scrollbar / trigger=scroll)', () => {
    expect(resolveScrollHintOptions(true)).toEqual({
      bubble: true,
      ruler: true,
      scrollbar: true,
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
    expect(resolved?.scrollbar).toBe(true);
    expect(resolved?.trigger).toBe('scroll');
    expect(resolved?.hintColumn).toBe('code');
  });

  it('個別 off の明示指定が既定に勝つ', () => {
    const resolved = resolveScrollHintOptions({
      ruler: false,
      scrollbar: false,
      trigger: 'always',
    });
    expect(resolved?.bubble).toBe(true);
    expect(resolved?.ruler).toBe(false);
    expect(resolved?.scrollbar).toBe(false);
    expect(resolved?.trigger).toBe('always');
  });

  it('bubble / ruler だけ false でも scrollbar が残るので有効', () => {
    const resolved = resolveScrollHintOptions({ bubble: false, ruler: false });
    expect(resolved).not.toBeNull();
    expect(resolved?.scrollbar).toBe(true);
  });

  it('bubble / ruler / scrollbar すべて false なら null(表示物なし)', () => {
    expect(
      resolveScrollHintOptions({ bubble: false, ruler: false, scrollbar: false }),
    ).toBeNull();
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

  it('trackHeight 指定(カスタムスクロールバーのガター)でもトラック内へ正しく写像される', () => {
    const params = {
      contentHeight: 36_036,
      viewportHeight: 480,
      trackHeight: 444,
    };
    const top = computeScrollHintTrack({ ...params, scrollTop: 0 });
    // サム高 = max(444 * 480 / 36036 ≈ 5.9, 30) = 30(最小値)。
    expect(top?.thumbHeight).toBe(SCROLL_HINT_MIN_THUMB_PX);
    expect(top?.thumbTop).toBe(0);
    const bottom = computeScrollHintTrack({
      ...params,
      scrollTop: params.contentHeight - params.viewportHeight,
    });
    expect((bottom?.thumbTop ?? 0) + (bottom?.thumbHeight ?? 0)).toBeCloseTo(
      444,
    );
  });

  it('trackHeight 0 では null', () => {
    expect(
      computeScrollHintTrack({
        scrollTop: 0,
        contentHeight: 4800,
        viewportHeight: 480,
        trackHeight: 0,
      }),
    ).toBeNull();
  });
});

describe('niceStepAtLeast', () => {
  it('1 / 2 / 5 系の切り上げ(10^k < 10 では 2.5 系を使わない)', () => {
    expect(niceStepAtLeast(1)).toBe(1);
    expect(niceStepAtLeast(1.2)).toBe(2);
    expect(niceStepAtLeast(3)).toBe(5);
    expect(niceStepAtLeast(7)).toBe(10);
  });

  it('10^k >= 10 では 2.5 系(25 / 250 …)も採用する', () => {
    expect(niceStepAtLeast(21)).toBe(25);
    expect(niceStepAtLeast(26)).toBe(50);
    expect(niceStepAtLeast(120_000)).toBe(200_000);
  });

  it('1 未満は 1 へ clamp される', () => {
    expect(niceStepAtLeast(0.3)).toBe(1);
  });
});

describe('formatScrollHintRulerValue', () => {
  it('1 万以上の切りのよい値は「N万」へ圧縮する', () => {
    expect(formatScrollHintRulerValue(10_000)).toBe('1万');
    expect(formatScrollHintRulerValue(100_000)).toBe('10万');
    expect(formatScrollHintRulerValue(1_000_000)).toBe('100万');
  });

  it('それ以外は桁区切りの数値文字列', () => {
    expect(formatScrollHintRulerValue(0)).toBe('0');
    expect(formatScrollHintRulerValue(500)).toBe('500');
    expect(formatScrollHintRulerValue(12_500)).toBe((12_500).toLocaleString());
  });

  it('useManUnit=false を明示すると 1 万の倍数でも桁区切りのまま(表記統一用)', () => {
    expect(formatScrollHintRulerValue(10_000, false)).toBe(
      (10_000).toLocaleString(),
    );
  });
});

describe('computeScrollHintRulerTicks', () => {
  it('行なし / 高さなしでは空配列', () => {
    expect(
      computeScrollHintRulerTicks({ rowCount: 0, rulerHeight: 400 }),
    ).toEqual([]);
    expect(
      computeScrollHintRulerTicks({ rowCount: 100, rulerHeight: 0 }),
    ).toEqual([]);
  });

  it('1,000 行 × 444px では 100 行刻みで 0〜1,000 の 11 目盛り', () => {
    const ticks = computeScrollHintRulerTicks({
      rowCount: 1000,
      rulerHeight: 444,
    });
    expect(ticks).toHaveLength(11);
    expect(ticks[0]).toEqual({ row: 0, y: 0, label: '0' });
    expect(ticks[10].row).toBe(1000);
    expect(ticks[10].y).toBeCloseTo(444);
    expect(ticks[5].y).toBeCloseTo(222);
  });

  it('100 万行では「10万」刻みの圧縮ラベルになる', () => {
    const ticks = computeScrollHintRulerTicks({
      rowCount: 1_000_000,
      rulerHeight: 444,
    });
    expect(ticks.map((tick) => tick.label)).toEqual([
      '0',
      '10万',
      '20万',
      '30万',
      '40万',
      '50万',
      '60万',
      '70万',
      '80万',
      '90万',
      '100万',
    ]);
  });

  it('目盛り間隔は最小ラベル間隔を下回らない', () => {
    const ticks = computeScrollHintRulerTicks({
      rowCount: 50_000,
      rulerHeight: 200,
    });
    for (let index = 1; index < ticks.length; index += 1) {
      expect(ticks[index].y - ticks[index - 1].y).toBeGreaterThanOrEqual(44);
    }
  });

  it('刻みが 1 万の倍数でないときは全目盛りが桁区切り表記(万との混在を防ぐ)', () => {
    // 50,000 行 × 444px → 刻み 5,000。旧実装では 5,000 / 1万 / 15,000 / 2万 … と混在していた。
    const ticks = computeScrollHintRulerTicks({
      rowCount: 50_000,
      rulerHeight: 444,
    });
    expect(ticks[1].label).toBe((5_000).toLocaleString());
    expect(ticks[2].label).toBe((10_000).toLocaleString());
    expect(ticks.some((tick) => tick.label.includes('万'))).toBe(false);
  });
});

describe('computeScrollHintTrackPointerScrollTop', () => {
  const track = {
    maxScroll: 10_000,
    thumbTop: 0,
    thumbHeight: 30,
    centerY: 15,
  };

  it('サム中心基準の線形写像(中央 → 可動域の中央)', () => {
    // viewport 480 / thumb 30 → range 450。pointerY 240 → frac (240-15)/450 = 0.5。
    expect(computeScrollHintTrackPointerScrollTop(240, track, 480)).toBe(5000);
  });

  it('上端 / 下端で 0 / maxScroll へ clamp される', () => {
    expect(computeScrollHintTrackPointerScrollTop(-50, track, 480)).toBe(0);
    expect(computeScrollHintTrackPointerScrollTop(9999, track, 480)).toBe(
      10_000,
    );
  });

  it('range 0(サムがトラック全高)では 0', () => {
    expect(
      computeScrollHintTrackPointerScrollTop(
        100,
        { ...track, thumbHeight: 480 },
        480,
      ),
    ).toBe(0);
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