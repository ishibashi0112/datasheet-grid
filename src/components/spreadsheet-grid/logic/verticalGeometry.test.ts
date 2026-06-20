// V-1: verticalGeometry の等価性 / 不変条件テスト(旧 adhoc ハーネスの恒久化)。
//   旧 rowVirtualizer(scrollMargin=headerHeight / estimateSize=rowHeight)は import できないため、
//   等価性は「ドキュメント化された契約=不変条件」として encode します:
//     - no-op(logicalBodyHeight <= cap): scaleFactor=1 / translateY=0 / start=headerHeight+i*rowHeight
//       (= 旧 virtualRow.start と数値一致)。
//     - scaling: physicalBodyHeight=cap / scaleFactor>=1 / translateY<=0 / 末尾行到達可能 /
//       物理↔論理のラウンドトリップ / clientYToRowIndex の逆写像一致。
//   旧ハーネスの 369 ケースに相当する系統的スイープ(>369 組合せ)を回し、各ケースで不変条件を検査します。
import { describe, it, expect } from 'vitest';
import {
  MAX_BODY_PX,
  WINDOW_BASE_CHUNK_PX,
  clientYToRowIndex,
  clipRowRangeToWindow,
  computeVerticalGeometry,
  createUniformRowMetrics,
  logicalToPhysicalScrollTop,
  physicalToLogicalScrollTop,
  type ComputeVerticalGeometryArgs,
} from './verticalGeometry';

// transform/レイアウトが安定してペイントされる float32 の正確整数域(2^24)。
//   行/オーバーレイの配置値・wrapper の translateY はこの範囲内に収まる必要があります
//   (超えると 1M 行で末尾行がペイントされなくなる回帰)。
const FLOAT32_SAFE_PX = 1 << 24;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

// 1 ケースの不変条件を検査します(失敗時はケース内容を添えて throw)。
const checkInvariants = (args: ComputeVerticalGeometryArgs): void => {
  const {
    rowCount,
    rowHeight,
    headerHeight,
    viewportHeight,
    scrollTop,
    maxBodyPx,
  } = args;
  const geometry = computeVerticalGeometry(args);
  const label = (message: string): string =>
    `${message} | case=${JSON.stringify(args)} | geometry.scaleFactor=${geometry.scaleFactor} translateY=${geometry.translateY}`;
  const assert = (condition: boolean, message: string): void => {
    if (!condition) {
      throw new Error(label(message));
    }
  };

  const logicalBodyHeight = rowCount * rowHeight;
  const physicalBodyHeight = Math.min(logicalBodyHeight, maxBodyPx);
  const physicalMax = Math.max(
    headerHeight + physicalBodyHeight - viewportHeight,
    0,
  );

  assert(geometry.logicalBodyHeight === logicalBodyHeight, 'logicalBodyHeight');
  assert(
    geometry.physicalBodyHeight === physicalBodyHeight,
    'physicalBodyHeight',
  );
  assert(geometry.scaleFactor >= 1, 'scaleFactor >= 1');

  // 描画ウィンドウ基準オフセット: 0(no-op) または WINDOW_BASE_CHUNK_PX の非負整数倍(scaling)。
  assert(geometry.windowBaseOffsetPx >= 0, 'windowBaseOffsetPx >= 0');
  assert(
    geometry.windowBaseOffsetPx % WINDOW_BASE_CHUNK_PX === 0,
    'windowBaseOffsetPx is a multiple of WINDOW_BASE_CHUNK_PX',
  );

  // 物理↔論理スクロール(画面座標の不変性チェック・可視帯被覆で再利用)。
  const clampedScrollTop = clamp(scrollTop, 0, physicalMax);
  const logicalScrollTop = clampedScrollTop * geometry.scaleFactor;

  // 有界性(回帰ガード): wrapper の translateY は float32 の正確整数域に収まる。
  //   これを超えると巨大 transform で 1M 行の末尾行がペイントされなくなる(本修正が直したバグ)。
  assert(
    Math.abs(geometry.translateY) < FLOAT32_SAFE_PX,
    'translateY within float32-safe range',
  );

  // 窓は連続・[0,rowCount) 内・rowIndexSet と整合。row.start は基準オフセット相対。
  for (let k = 0; k < geometry.rows.length; k += 1) {
    const row = geometry.rows[k];
    assert(row.index >= 0 && row.index < rowCount, 'row.index in range');
    // start = 絶対論理 top - windowBaseOffsetPx。no-op では windowBaseOffsetPx=0 で従来式と一致。
    assert(
      row.start ===
        headerHeight + row.index * rowHeight - geometry.windowBaseOffsetPx,
      'row.start === headerHeight + index*rowHeight - windowBaseOffsetPx',
    );
    // 有界性(回帰ガード): per-row の配置値も float32 安全域に収まる。
    assert(
      Math.abs(row.start) < FLOAT32_SAFE_PX,
      'row.start within float32-safe range',
    );
    // 画面座標の不変性(等価性の本質): wrapper(translateY) + 行(start) のスクロール内位置は、
    //   基準オフセットの有無に関わらず
    //   「(clampedScrollTop - logicalScrollTop) + headerHeight + index*rowHeight」
    //   (= 旧 translateY + 旧 start)と一致する。
    const sceneTop = geometry.translateY + row.start;
    const expectedSceneTop =
      clampedScrollTop - logicalScrollTop + headerHeight + row.index * rowHeight;
    assert(
      Math.abs(sceneTop - expectedSceneTop) < 1e-3,
      'scene position invariant (translateY + start)',
    );
    if (k > 0) {
      assert(
        row.index === geometry.rows[k - 1].index + 1,
        'rows are contiguous',
      );
    }
    assert(geometry.rowIndexSet.has(row.index), 'rowIndexSet contains index');
  }
  assert(
    geometry.rowIndexSet.size === geometry.rows.length,
    'rowIndexSet size === rows length',
  );

  const isNoop = logicalBodyHeight <= maxBodyPx;
  if (isNoop) {
    assert(geometry.scaleFactor === 1, 'no-op scaleFactor === 1');
    assert(geometry.translateY === 0, 'no-op translateY === 0');
    assert(geometry.windowBaseOffsetPx === 0, 'no-op windowBaseOffsetPx === 0');
  }

  // 可視帯の被覆: 論理可視域の先頭/末尾行が窓に含まれる(overscan が上下マージンを賄う)。
  //   viewportHeight=0 は可視行が存在しないため対象外。
  if (rowCount > 0 && viewportHeight > 0) {
    const firstVisible = clamp(
      Math.floor(logicalScrollTop / rowHeight),
      0,
      rowCount - 1,
    );
    const lastVisible = clamp(
      Math.floor((logicalScrollTop + viewportHeight) / rowHeight),
      0,
      rowCount - 1,
    );
    assert(geometry.rowIndexSet.has(firstVisible), 'first visible row in window');
    assert(geometry.rowIndexSet.has(lastVisible), 'last visible row in window');
  }

  // 末尾行到達可能: スクロール可能 かつ 可視域がある なら scrollTop=physicalMax で
  //   最終行が窓に入る。viewportHeight=0 は可視域ゼロのため対象外(末尾で 1 行が域外に出るのは正常)。
  if (rowCount > 0 && physicalMax > 0 && viewportHeight > 0) {
    const atBottom = computeVerticalGeometry({ ...args, scrollTop: physicalMax });
    assert(
      atBottom.rowIndexSet.has(rowCount - 1),
      'last row reachable at physicalMax',
    );
  }

  // 物理↔論理ラウンドトリップ(可動域内では誤差なく往復する)。
  if (physicalMax > 0) {
    for (const probe of [0, physicalMax / 2, physicalMax]) {
      const roundTrip = logicalToPhysicalScrollTop(
        physicalToLogicalScrollTop(probe, geometry.scaleFactor),
        geometry.scaleFactor,
      );
      assert(Math.abs(roundTrip - probe) < 1e-3, 'scroll round-trip');
    }
  }
};

// 系統的スイープのケースを生成します(>369 組合せ)。
const buildCases = (): ComputeVerticalGeometryArgs[] => {
  const rowCounts = [0, 1, 10, 400_000, 420_000, 1_000_000];
  const rowHeights = [1, 36, 38];
  const headerHeights = [0, 42];
  const viewportHeights = [0, 300, 1000];
  const overscans = [0, 20];
  // MAX_BODY_PX に加え、小行数でも scaling を起動させる小さい cap を併用して経路網羅を上げます。
  const maxBodyPxs = [MAX_BODY_PX, 1000];

  const cases: ComputeVerticalGeometryArgs[] = [];
  for (const rowCount of rowCounts) {
    for (const rowHeight of rowHeights) {
      for (const headerHeight of headerHeights) {
        for (const viewportHeight of viewportHeights) {
          for (const overscan of overscans) {
            for (const maxBodyPx of maxBodyPxs) {
              const physicalBodyHeight = Math.min(
                rowCount * rowHeight,
                maxBodyPx,
              );
              const physicalMax = Math.max(
                headerHeight + physicalBodyHeight - viewportHeight,
                0,
              );
              const scrollTops = Array.from(
                new Set([
                  0,
                  Math.floor(physicalMax / 2),
                  physicalMax,
                  physicalMax + 1000,
                ]),
              );
              for (const scrollTop of scrollTops) {
                cases.push({
                  rowCount,
                  rowHeight,
                  headerHeight,
                  viewportHeight,
                  scrollTop,
                  overscan,
                  maxBodyPx,
                });
              }
            }
          }
        }
      }
    }
  }
  return cases;
};

describe('computeVerticalGeometry (sweep invariants)', () => {
  const cases = buildCases();

  it(`covers >= 369 cases (actual ${cases.length})`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(369);
  });

  it('holds invariants on every swept case', () => {
    for (const args of cases) {
      checkInvariants(args);
    }
  });
});

describe('computeVerticalGeometry (no-op equivalence with old uniform virtualizer)', () => {
  it('produces start === headerHeight + index*rowHeight and identity scaling below cap', () => {
    const geometry = computeVerticalGeometry({
      rowCount: 1000,
      rowHeight: 38,
      headerHeight: 42,
      viewportHeight: 600,
      scrollTop: 5_000,
      overscan: 20,
      maxBodyPx: MAX_BODY_PX,
    });
    expect(geometry.scaleFactor).toBe(1);
    expect(geometry.translateY).toBe(0);
    expect(geometry.windowBaseOffsetPx).toBe(0);
    for (const row of geometry.rows) {
      expect(row.start).toBe(42 + row.index * 38);
    }
  });
});

describe('computeVerticalGeometry (scaling activation at App defaults)', () => {
  it('activates scaling at 500k rows / rowHeight=38 (sf ~ 1.27)', () => {
    const geometry = computeVerticalGeometry({
      rowCount: 500_000,
      rowHeight: 38,
      headerHeight: 42,
      viewportHeight: 800,
      scrollTop: 0,
      overscan: 20,
      maxBodyPx: MAX_BODY_PX,
    });
    expect(geometry.physicalBodyHeight).toBe(MAX_BODY_PX);
    expect(geometry.scaleFactor).toBeGreaterThan(1.2);
    expect(geometry.scaleFactor).toBeLessThan(1.35);
  });

  it('keeps no-op below the activation threshold (<= 394,736 rows)', () => {
    const geometry = computeVerticalGeometry({
      rowCount: 394_000,
      rowHeight: 38,
      headerHeight: 42,
      viewportHeight: 800,
      scrollTop: 1000,
      overscan: 20,
      maxBodyPx: MAX_BODY_PX,
    });
    expect(geometry.scaleFactor).toBe(1);
    expect(geometry.translateY).toBe(0);
  });
});

describe('computeVerticalGeometry (1M bottom: bounded transforms regression guard)', () => {
  // 本修正が直したバグ: 1M 行で scaling 起動時、行/オーバーレイを絶対論理 top(最大 38M)へ
  //   置くと float32 安全域(2^24)を超え、末尾付近がペイントされず末尾行へ到達できなかった。
  //   基準オフセットの畳み込みで、末尾でも translateY / row.start が安全域に収まることを固定する。
  const FLOAT32_SAFE = 1 << 24;
  const rowCount = 1_000_000;
  const rowHeight = 38;
  const headerHeight = 42;
  const viewportHeight = 800;
  const maxBodyPx = MAX_BODY_PX;

  const physicalMax = Math.max(
    headerHeight + Math.min(rowCount * rowHeight, maxBodyPx) - viewportHeight,
    0,
  );

  it('reaches the last row at the bottom with all placements within float32-safe range', () => {
    const geometry = computeVerticalGeometry({
      rowCount,
      rowHeight,
      headerHeight,
      viewportHeight,
      scrollTop: physicalMax,
      overscan: 20,
      maxBodyPx,
    });

    // 末尾行が窓に入る(= 到達可能)。
    expect(geometry.rowIndexSet.has(rowCount - 1)).toBe(true);
    // scaling 起動・基準オフセットは正のチャンク倍数。
    expect(geometry.scaleFactor).toBeGreaterThan(1);
    expect(geometry.windowBaseOffsetPx).toBeGreaterThan(0);
    expect(geometry.windowBaseOffsetPx % WINDOW_BASE_CHUNK_PX).toBe(0);
    // wrapper / per-row の配置値はいずれも float32 安全域。
    expect(Math.abs(geometry.translateY)).toBeLessThan(FLOAT32_SAFE);
    for (const row of geometry.rows) {
      expect(Math.abs(row.start)).toBeLessThan(FLOAT32_SAFE);
    }
  });

  it('preserves the on-screen position of the last row at the bottom', () => {
    const geometry = computeVerticalGeometry({
      rowCount,
      rowHeight,
      headerHeight,
      viewportHeight,
      scrollTop: physicalMax,
      overscan: 20,
      maxBodyPx,
    });
    const logicalScrollTop = physicalMax * geometry.scaleFactor;
    const lastRow = geometry.rows.find((row) => row.index === rowCount - 1);
    expect(lastRow).toBeDefined();
    if (lastRow) {
      // wrapper(translateY) + 行(start) のスクロール内位置 = 絶対論理 top - logicalScrollTop + 物理 scrollTop。
      const sceneTop = geometry.translateY + lastRow.start;
      const expectedSceneTop =
        physicalMax - logicalScrollTop + headerHeight + (rowCount - 1) * rowHeight;
      expect(Math.abs(sceneTop - expectedSceneTop)).toBeLessThan(1e-3);
    }
  });
});

describe('clientYToRowIndex (inverse of body-content row band)', () => {
  it('reduces to floor(y / rowHeight) when scaleFactor === 1', () => {
    const rowHeight = 38;
    const rowCount = 1000;
    const metrics = createUniformRowMetrics(rowCount, rowHeight);
    for (let i = 0; i < 50; i += 1) {
      for (const delta of [0, 1, rowHeight - 1]) {
        const y = i * rowHeight + delta;
        expect(clientYToRowIndex(y, 0, 1, metrics)).toBe(i);
      }
    }
  });

  it('inverts the d-shifted band under scaling (row i occupies [i*rowHeight + d, ...))', () => {
    const rowHeight = 38;
    const rowCount = 1_000_000;
    const scaleFactor = 1.27;
    const scrollTop = 1_000_000;
    const d = scrollTop * (1 - scaleFactor); // <= 0
    const metrics = createUniformRowMetrics(rowCount, rowHeight);
    for (const i of [0, 1, 100, 5000, rowCount - 1]) {
      for (const delta of [0, rowHeight / 2, rowHeight - 1]) {
        const y = i * rowHeight + d + delta;
        expect(clientYToRowIndex(y, scrollTop, scaleFactor, metrics)).toBe(
          clamp(i, 0, rowCount - 1),
        );
      }
    }
  });

  it('clamps out-of-range y into [0, rowCount-1]', () => {
    const rowHeight = 38;
    const rowCount = 10;
    const metrics = createUniformRowMetrics(rowCount, rowHeight);
    expect(clientYToRowIndex(-9999, 0, 1, metrics)).toBe(0);
    expect(clientYToRowIndex(9_999_999, 0, 1, metrics)).toBe(9);
  });
});

// C0(auto-height シーム): createUniformRowMetrics の各 resolver が、移行前に overlay /
//   ヒットテストが直書きしていた算術(index*rowHeight 等)とバイト等価であることのガードです。
//   将来の auto-height(prefix-sum 実装)を入れても uniform 経路はここで一致が担保されます。
describe('createUniformRowMetrics (no-op equivalence with pre-seam arithmetic)', () => {
  const cases: Array<{ rowCount: number; rowHeight: number }> = [];
  for (const rowCount of [0, 1, 2, 10, 1000, 500_000, 1_000_000]) {
    for (const rowHeight of [1, 20, 36, 38, 42]) {
      cases.push({ rowCount, rowHeight });
    }
  }

  it(`covers >= 35 cases (actual ${cases.length})`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(35);
  });

  it('rowTop(i) === i * rowHeight and totalBodyHeight === rowCount * rowHeight', () => {
    for (const { rowCount, rowHeight } of cases) {
      const metrics = createUniformRowMetrics(rowCount, rowHeight);
      expect(metrics.rowCount).toBe(rowCount);
      expect(metrics.totalBodyHeight).toBe(rowCount * rowHeight);
      for (const i of [0, 1, 2, 7, 123, Math.max(rowCount - 1, 0)]) {
        if (i >= rowCount && rowCount > 0) continue;
        expect(metrics.rowTop(i)).toBe(i * rowHeight);
      }
    }
  });

  it('rowsHeight(a, b) === (b - a + 1) * rowHeight (inclusive span)', () => {
    for (const { rowCount, rowHeight } of cases) {
      if (rowCount === 0) continue;
      const metrics = createUniformRowMetrics(rowCount, rowHeight);
      const last = rowCount - 1;
      for (const [a, b] of [
        [0, 0],
        [0, last],
        [Math.min(3, last), Math.min(3, last)],
        [Math.min(2, last), last],
      ] as Array<[number, number]>) {
        expect(metrics.rowsHeight(a, b)).toBe((b - a + 1) * rowHeight);
      }
    }
  });

  it('rowAtContentY(y) === clamp(floor(y / rowHeight), 0, rowCount-1)', () => {
    for (const { rowCount, rowHeight } of cases) {
      const metrics = createUniformRowMetrics(rowCount, rowHeight);
      for (const i of [-5, 0, 1, 50, rowCount - 1, rowCount, rowCount + 10]) {
        for (const delta of [0, rowHeight / 2, rowHeight - 1]) {
          const y = i * rowHeight + delta;
          const expected = clamp(
            Math.floor(y / rowHeight),
            0,
            Math.max(rowCount - 1, 0),
          );
          expect(metrics.rowAtContentY(y)).toBe(expected);
        }
      }
    }
  });
});

describe('clipRowRangeToWindow (selection band clip to render window)', () => {
  it('returns the selection unchanged when fully inside the window (no-op equivalence)', () => {
    // 窓 [80, 132] 内に収まる小さな選択はクリップされず、出力不変(no-op 等価)。
    expect(clipRowRangeToWindow(100, 102, 80, 132)).toEqual({ start: 100, end: 102 });
    expect(clipRowRangeToWindow(80, 132, 80, 132)).toEqual({ start: 80, end: 132 });
    expect(clipRowRangeToWindow(81, 81, 80, 132)).toEqual({ start: 81, end: 81 });
  });

  it('clips a full-body selection (col / whole-grid) down to the window band', () => {
    // col / グリッド全選択は [0, rowCount-1]。窓へ畳まれて巨大 div を回避します。
    expect(clipRowRangeToWindow(0, 999_999, 200, 252)).toEqual({ start: 200, end: 252 });
    expect(clipRowRangeToWindow(0, 999_999, 0, 32)).toEqual({ start: 0, end: 32 });
    expect(clipRowRangeToWindow(0, 999_999, 999_968, 999_999)).toEqual({
      start: 999_968,
      end: 999_999,
    });
  });

  it('clips the leading edge when the selection starts above the window', () => {
    expect(clipRowRangeToWindow(0, 150, 100, 200)).toEqual({ start: 100, end: 150 });
  });

  it('clips the trailing edge when the selection ends below the window', () => {
    expect(clipRowRangeToWindow(150, 999_999, 100, 200)).toEqual({ start: 150, end: 200 });
  });

  it('returns null when the selection is entirely above or below the window', () => {
    expect(clipRowRangeToWindow(0, 50, 100, 200)).toBeNull();
    expect(clipRowRangeToWindow(300, 400, 100, 200)).toBeNull();
  });

  it('returns null for an empty window (no rendered rows)', () => {
    // 空窓は末尾 < 先頭(windowFirstRow=0 / windowLastRow=-1 の規約)。
    expect(clipRowRangeToWindow(0, 999_999, 0, -1)).toBeNull();
    expect(clipRowRangeToWindow(5, 5, 0, -1)).toBeNull();
  });

  it('handles single-row window and single-row selection at the boundary', () => {
    expect(clipRowRangeToWindow(0, 999_999, 42, 42)).toEqual({ start: 42, end: 42 });
    expect(clipRowRangeToWindow(42, 42, 42, 42)).toEqual({ start: 42, end: 42 });
    expect(clipRowRangeToWindow(41, 41, 42, 42)).toBeNull();
    expect(clipRowRangeToWindow(43, 43, 42, 42)).toBeNull();
  });
});