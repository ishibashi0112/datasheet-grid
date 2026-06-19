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
  clientYToRowIndex,
  computeVerticalGeometry,
  logicalToPhysicalScrollTop,
  physicalToLogicalScrollTop,
  type ComputeVerticalGeometryArgs,
} from './verticalGeometry';

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
  // translateY = clampedScrollTop * (1 - scaleFactor) <= 0。
  assert(geometry.translateY <= 1e-6, 'translateY <= 0');

  // 窓は連続・[0,rowCount) 内・rowIndexSet と整合。
  for (let k = 0; k < geometry.rows.length; k += 1) {
    const row = geometry.rows[k];
    assert(row.index >= 0 && row.index < rowCount, 'row.index in range');
    assert(
      row.start === headerHeight + row.index * rowHeight,
      'row.start === headerHeight + index*rowHeight',
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
  }

  // 可視帯の被覆: 論理可視域の先頭/末尾行が窓に含まれる(overscan が上下マージンを賄う)。
  //   viewportHeight=0 は可視行が存在しないため対象外。
  if (rowCount > 0 && viewportHeight > 0) {
    const clampedScrollTop = clamp(scrollTop, 0, physicalMax);
    const logicalScrollTop = clampedScrollTop * geometry.scaleFactor;
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

describe('clientYToRowIndex (inverse of body-content row band)', () => {
  it('reduces to floor(y / rowHeight) when scaleFactor === 1', () => {
    const rowHeight = 38;
    const rowCount = 1000;
    for (let i = 0; i < 50; i += 1) {
      for (const delta of [0, 1, rowHeight - 1]) {
        const y = i * rowHeight + delta;
        expect(clientYToRowIndex(y, 0, 1, rowHeight, rowCount)).toBe(i);
      }
    }
  });

  it('inverts the d-shifted band under scaling (row i occupies [i*rowHeight + d, ...))', () => {
    const rowHeight = 38;
    const rowCount = 1_000_000;
    const scaleFactor = 1.27;
    const scrollTop = 1_000_000;
    const d = scrollTop * (1 - scaleFactor); // <= 0
    for (const i of [0, 1, 100, 5000, rowCount - 1]) {
      for (const delta of [0, rowHeight / 2, rowHeight - 1]) {
        const y = i * rowHeight + d + delta;
        expect(
          clientYToRowIndex(y, scrollTop, scaleFactor, rowHeight, rowCount),
        ).toBe(clamp(i, 0, rowCount - 1));
      }
    }
  });

  it('clamps out-of-range y into [0, rowCount-1]', () => {
    const rowHeight = 38;
    const rowCount = 10;
    expect(clientYToRowIndex(-9999, 0, 1, rowHeight, rowCount)).toBe(0);
    expect(clientYToRowIndex(9_999_999, 0, 1, rowHeight, rowCount)).toBe(9);
  });
});