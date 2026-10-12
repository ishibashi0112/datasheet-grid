// 追加(フィルハンドル): 連続データ / コピーの値の決め方(数値・日付・曜日 / 月・末尾の数・数値の文字列・
//   空や型の混在・逆向き・Ctrl の入れ替え)を固定します。
import { describe, expect, it } from 'vitest';

import {
  analyzeFillLine,
  createFillLineValues,
  resolveFillLineKind,
  type FillRequest,
} from './fillSeries';

// 元の値から count 個の値を作ります(request の決め方で)。
const fill = (source: unknown[], count: number, request: FillRequest = 'auto') => {
  const analysis = analyzeFillLine(source);
  const kind = resolveFillLineKind(analysis, request);
  const valueAt = createFillLineValues(source, analysis, kind);
  return { kind, values: Array.from({ length: count }, (_, index) => valueAt(index)) };
};

describe('数値', () => {
  it('1 つは既定でコピー、Ctrl で +1 ずつ', () => {
    expect(fill([120], 3)).toEqual({ kind: 'copy', values: [120, 120, 120] });
    expect(fill([120], 3, 'toggled')).toEqual({ kind: 'series', values: [121, 122, 123] });
    expect(fill([120], 2, 'series')).toEqual({ kind: 'series', values: [121, 122] });
  });

  it('2 つ以上は差で続け、Ctrl でコピー(周期)', () => {
    expect(fill([1, 3], 3)).toEqual({ kind: 'series', values: [5, 7, 9] });
    expect(fill([10, 7, 4], 2)).toEqual({ kind: 'series', values: [1, -2] });
    expect(fill([1, 3], 3, 'toggled')).toEqual({ kind: 'copy', values: [1, 3, 1] });
  });

  it('差が一定でないときは最小二乗の直線で続ける', () => {
    // 1, 2, 4 → 傾き 1.5、切片 0.8333… → x = 3, 4 で 5.3333…, 6.8333…
    const { values } = fill([1, 2, 4], 2);
    expect(values[0]).toBeCloseTo(5.333333333333, 10);
    expect(values[1]).toBeCloseTo(6.833333333333, 10);
  });

  it('浮動小数の誤差を丸め、大きな整数は桁を落とさない', () => {
    expect(fill([0.1, 0.2], 3).values).toEqual([0.3, 0.4, 0.5]);
    expect(fill([0.1, 0.2, 0.3], 1).values).toEqual([0.4]);
    expect(fill([1_000_000_000_000_001, 1_000_000_000_000_002], 1).values).toEqual([
      1_000_000_000_000_003,
    ]);
  });

  it('同じ数の繰り返しは同じ数のまま', () => {
    expect(fill([5, 5], 2)).toEqual({ kind: 'series', values: [5, 5] });
  });

  it('NaN / Infinity を含むとコピー', () => {
    expect(fill([1, Number.NaN], 2)).toEqual({ kind: 'copy', values: [1, Number.NaN] });
    expect(fill([1, Infinity], 1, 'series').kind).toBe('copy');
  });
});

describe('日付', () => {
  it('YYYY-MM-DD は 1 つでも 1 日ずつ進み、形式を保つ', () => {
    expect(fill(['2026-10-30'], 3)).toEqual({
      kind: 'series',
      values: ['2026-10-31', '2026-11-01', '2026-11-02'],
    });
    expect(fill(['2026-10-30'], 2, 'toggled')).toEqual({
      kind: 'copy',
      values: ['2026-10-30', '2026-10-30'],
    });
  });

  it('YYYY/MM/DD と 0 埋めしない形も保つ', () => {
    expect(fill(['2026/12/31'], 1).values).toEqual(['2027/01/01']);
    expect(fill(['2026/1/9'], 2).values).toEqual(['2026/1/10', '2026/1/11']);
  });

  it('2 つ以上は日数の差で続ける(週ごと)', () => {
    expect(fill(['2026-10-01', '2026-10-08'], 2).values).toEqual(['2026-10-15', '2026-10-22']);
  });

  it('日が同じで月の差が一定なら月ごと(月末は丸め、元の日へ戻る)', () => {
    expect(fill(['2026-01-31', '2026-03-31'], 3).values).toEqual([
      '2026-05-31',
      '2026-07-31',
      '2026-09-30',
    ]);
    expect(fill(['2025-12-31', '2026-01-31'], 3).values).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    // 年ごと(12 か月)。閏日は丸める。
    expect(fill(['2024-02-29', '2025-02-28'], 1).values).toEqual(['2026-02-28']);
    expect(fill(['2023-06-15', '2024-06-15'], 2).values).toEqual(['2025-06-15', '2026-06-15']);
  });

  it('存在しない日付の文字列は日付として扱わない', () => {
    // 2026-02-30 は日付ではない → 末尾の数の規則で 31, 32 …
    expect(fill(['2026-02-30'], 1).values).toEqual(['2026-02-31']);
  });

  it('Date は Date で返し、時刻を保つ', () => {
    const { kind, values } = fill([new Date(2026, 9, 31, 9, 30)], 2);
    expect(kind).toBe('series');
    expect(values).toEqual([new Date(2026, 10, 1, 9, 30), new Date(2026, 10, 2, 9, 30)]);
  });

  it('Date の月ごと', () => {
    const { values } = fill([new Date(2026, 0, 15), new Date(2026, 1, 15)], 2);
    expect(values).toEqual([new Date(2026, 2, 15), new Date(2026, 3, 15)]);
  });

  it('Date のコピーは行ごとに別の実体', () => {
    const source = new Date(2026, 0, 1);
    const { values } = fill([source], 2, 'copy');
    expect(values[0]).toEqual(source);
    expect(values[0]).not.toBe(source);
    expect(values[0]).not.toBe(values[1]);
  });

  it('無効な Date はコピー', () => {
    expect(fill([new Date(Number.NaN)], 1, 'series').kind).toBe('copy');
  });
});

describe('曜日 / 月の名前', () => {
  it('日本語の曜日は 1 つでも続き、一周する', () => {
    expect(fill(['土'], 3).values).toEqual(['日', '月', '火']);
    expect(fill(['金曜日'], 2).values).toEqual(['土曜日', '日曜日']);
    expect(fill(['水曜'], 1).values).toEqual(['木曜']);
  });

  it('差が一定なら飛ばして続け、一定でなければコピー', () => {
    expect(fill(['月', '水'], 3).values).toEqual(['金', '日', '火']);
    expect(fill(['月', '水', '木'], 2)).toEqual({ kind: 'copy', values: ['月', '水'] });
  });

  it('月の名前(日本語 / 英語)', () => {
    expect(fill(['11月'], 3).values).toEqual(['12月', '1月', '2月']);
    expect(fill(['Nov'], 2).values).toEqual(['Dec', 'Jan']);
    expect(fill(['May', 'June'], 1).values).toEqual(['July']);
  });

  it('英語の大文字 / 小文字を最後の値に合わせる', () => {
    expect(fill(['MON'], 1).values).toEqual(['TUE']);
    expect(fill(['friday'], 1).values).toEqual(['saturday']);
    expect(fill(['Sun'], 1).values).toEqual(['Mon']);
  });

  it('Ctrl でコピー', () => {
    expect(fill(['月'], 2, 'toggled')).toEqual({ kind: 'copy', values: ['月', '月'] });
  });
});

describe('末尾が数字の文字列', () => {
  it('1 つでも末尾の数を進め、0 埋めの桁数を保つ', () => {
    expect(fill(['P-001'], 3).values).toEqual(['P-002', 'P-003', 'P-004']);
    expect(fill(['P-099'], 2).values).toEqual(['P-100', 'P-101']);
    expect(fill(['Item9'], 2).values).toEqual(['Item10', 'Item11']);
  });

  it('2 つ以上は差で続ける', () => {
    expect(fill(['A1', 'A3'], 2).values).toEqual(['A5', 'A7']);
  });

  it('負になる位置は絶対値(Excel と同じ)', () => {
    expect(fill(['P-2', 'P-1'], 3).values).toEqual(['P-0', 'P-1', 'P-2']);
  });

  it('0 埋めは最後の値が 0 で始まるときだけ', () => {
    expect(fill(['P-10', 'P-9'], 2).values).toEqual(['P-8', 'P-7']);
    expect(fill(['P-002', 'P-001'], 2).values).toEqual(['P-000', 'P-001']);
  });

  it('前置きが違うとコピー', () => {
    expect(fill(['A1', 'B2'], 3)).toEqual({ kind: 'copy', values: ['A1', 'B2', 'A1'] });
  });

  it('数字だけの文字列 1 つは既定コピー、Ctrl で +1(0 埋めを保つ)', () => {
    expect(fill(['007'], 2)).toEqual({ kind: 'copy', values: ['007', '007'] });
    expect(fill(['007'], 2, 'toggled')).toEqual({ kind: 'series', values: ['008', '009'] });
    expect(fill(['1', '2'], 2)).toEqual({ kind: 'series', values: ['3', '4'] });
  });

  it('桁が多すぎる数はコピー', () => {
    expect(fill(['ID1234567890123456'], 1, 'series').kind).toBe('copy');
  });
});

describe('数値の文字列', () => {
  it('小数 / 負の数は数値の規則で文字列を返す', () => {
    expect(fill(['1.5'], 2)).toEqual({ kind: 'copy', values: ['1.5', '1.5'] });
    expect(fill(['1.5'], 2, 'toggled')).toEqual({ kind: 'series', values: ['2.5', '3.5'] });
    expect(fill(['0.1', '0.2'], 2).values).toEqual(['0.3', '0.4']);
    expect(fill(['-3', '-1'], 2).values).toEqual(['1', '3']);
  });
});

describe('コピーになる値', () => {
  it('空を含む / 空だけ / 型の混在 / 真偽値 / 続き方の無い文字列', () => {
    expect(fill([1, null], 3)).toEqual({ kind: 'copy', values: [1, null, 1] });
    expect(fill([''], 2)).toEqual({ kind: 'copy', values: ['', ''] });
    expect(fill([undefined], 1, 'series')).toEqual({ kind: 'copy', values: [undefined] });
    expect(fill([1, '2'], 2)).toEqual({ kind: 'copy', values: [1, '2'] });
    expect(fill([true, false], 3)).toEqual({ kind: 'copy', values: [true, false, true] });
    expect(fill(['東京'], 2, 'toggled')).toEqual({ kind: 'copy', values: ['東京', '東京'] });
  });

  it('コピーは元の値を周期で繰り返す', () => {
    expect(fill(['a', 'b', 'c'], 7, 'copy').values).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'a']);
  });
});

describe('逆向き(呼び出し側で元の値を逆順にして渡す)', () => {
  it('1, 2, 3 を上へ埋めると 0, -1', () => {
    expect(fill([3, 2, 1], 2).values).toEqual([0, -1]);
  });

  it('コピーは周期がそろう(a, b, c の上は c, b, a)', () => {
    expect(fill(['c', 'b', 'a'], 3).values).toEqual(['c', 'b', 'a']);
  });

  it('日付を上へ埋めると前の日', () => {
    expect(fill(['2026-10-02', '2026-10-01'], 2).values).toEqual(['2026-09-30', '2026-09-29']);
  });

  it('元の値が 1 つのときは backward で 1 ずつ戻す(Excel と同じ)', () => {
    const back = (source: unknown[], count: number, request: FillRequest = 'auto') => {
      const analysis = analyzeFillLine(source, { backward: true });
      const valueAt = createFillLineValues(source, analysis, resolveFillLineKind(analysis, request));
      return Array.from({ length: count }, (_, index) => valueAt(index));
    };
    expect(back(['2026-10-01'], 2)).toEqual(['2026-09-30', '2026-09-29']);
    expect(back([5], 2, 'toggled')).toEqual([4, 3]);
    expect(back(['P-003'], 4)).toEqual(['P-002', 'P-001', 'P-000', 'P-001']);
    expect(back(['月'], 2)).toEqual(['日', '土']);
    expect(back(['Jan'], 1)).toEqual(['Dec']);
    expect(back(['1.5'], 1, 'toggled')).toEqual(['0.5']);
    const date = back([new Date(2026, 0, 1, 9, 30)], 1)[0] as Date;
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2025, 11, 31, 9, 30]);
    // 2 つ以上は並び順で向きが決まる(backward は効かない)
    expect(back([3, 2], 2)).toEqual([1, 0]);
  });
});

describe('resolveFillLineKind', () => {
  it('続き方の無い値は要求に関係なくコピー', () => {
    const analysis = analyzeFillLine(['東京']);
    expect(resolveFillLineKind(analysis, 'auto')).toBe('copy');
    expect(resolveFillLineKind(analysis, 'toggled')).toBe('copy');
    expect(resolveFillLineKind(analysis, 'series')).toBe('copy');
  });

  it('auto / toggled / 選び直し', () => {
    const series = analyzeFillLine([1, 2]);
    expect(resolveFillLineKind(series, 'auto')).toBe('series');
    expect(resolveFillLineKind(series, 'toggled')).toBe('copy');
    expect(resolveFillLineKind(series, 'copy')).toBe('copy');
    const single = analyzeFillLine([1]);
    expect(resolveFillLineKind(single, 'auto')).toBe('copy');
    expect(resolveFillLineKind(single, 'toggled')).toBe('series');
    expect(resolveFillLineKind(single, 'series')).toBe('series');
  });
});