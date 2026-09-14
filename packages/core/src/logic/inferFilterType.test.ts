// 追加(filter-ext E): filterType: 'auto' の実効種別推定のテストです。
//   合意仕様: editor ヒント最優先 / 厳格判定(空白除外の全サンプル一致)/ 判定は値の型ではなく
//   「数値・日付として解釈できるか」/ 先頭ゼロは数値とみなさない / serverSide は text へ倒す。
import { describe, it, expect } from 'vitest';
import {
  INFER_SAMPLE_LIMIT,
  inferColumnFilterType,
} from './inferFilterType';

// 配列を getRawValueAt アクセサへ変換します(本体は getCellValue(rows[i], column) 相当)。
const fromValues = (values: unknown[]) => ({
  rowCount: values.length,
  getRawValueAt: (index: number) => values[index],
});

const infer = (values: unknown[], extra: Record<string, unknown> = {}) =>
  inferColumnFilterType({ ...fromValues(values), ...extra });

describe('inferColumnFilterType: editor ヒント(最優先)', () => {
  it('editor number / date は値を見ずに確定する', () => {
    // 値はテキストでも editor 指定が勝ちます(利用者の明示指定のため)。
    expect(infer(['あ', 'い'], { editorType: 'number' })).toEqual({
      filterType: 'numberSet',
      source: 'editor',
      conclusive: true,
    });
    expect(infer(['あ'], { editorType: 'date' })).toEqual({
      filterType: 'dateSet',
      source: 'editor',
      conclusive: true,
    });
  });

  it('その他の editor 種別は値から推定する', () => {
    expect(infer([1, 2, 3], { editorType: 'text' }).filterType).toBe(
      'numberSet',
    );
    expect(infer([1, 2], { editorType: 'select' }).filterType).toBe('numberSet');
  });
});

describe('inferColumnFilterType: 値からの推定', () => {
  it('全て数値なら numberSet(空白は判定から除外)', () => {
    expect(infer([1, 2.5, -3]).filterType).toBe('numberSet');
    expect(infer([1, null, 2, '', 3, '  ']).filterType).toBe('numberSet');
  });

  it('DB 型が文字列でも「数値に見える」なら numberSet(型ではなく解釈可能性で判定)', () => {
    expect(infer(['1234', '56', ' 78 ']).filterType).toBe('numberSet');
  });

  it('先頭ゼロ(品番コード / 郵便番号)は数値とみなさず textSet', () => {
    expect(infer(['0001', '0002', '0003']).filterType).toBe('textSet');
    // '0' 単体と小数の 0.x は数値のままです。
    expect(infer(['0', '0.5', '10']).filterType).toBe('numberSet');
  });

  it('全て日付なら dateSet(表記ゆれ・Date インスタンスも可)', () => {
    expect(infer(['2026-01-15', '2026-07-01']).filterType).toBe('dateSet');
    expect(infer(['2026/7/1', '2026-07-24T10:30']).filterType).toBe('dateSet');
    expect(infer([new Date(2026, 6, 24), '2026-01-01']).filterType).toBe(
      'dateSet',
    );
  });

  it('厳格判定: 1 件でも外れると textSet へ倒れる', () => {
    expect(infer([1, 2, 'N/A']).filterType).toBe('textSet');
    expect(infer(['2026-01-15', '未定']).filterType).toBe('textSet');
    // 数値と日付の混在も textSet(安全側)。
    expect(infer([1, '2026-01-15']).filterType).toBe('textSet');
  });

  it('boolean / オブジェクトは数値とみなさない(暗黙変換で 1/0 にしない)', () => {
    expect(infer([true, false]).filterType).toBe('textSet');
    expect(infer([1, true]).filterType).toBe('textSet');
  });

  it('非有限数値(NaN / Infinity)は数値とみなさない', () => {
    expect(infer([1, Number.NaN]).filterType).toBe('textSet');
    expect(infer([1, Number.POSITIVE_INFINITY]).filterType).toBe('textSet');
  });

  it('判定材料なし(行ゼロ / 全空白)は textSet だが確定させない(次回再推定)', () => {
    expect(infer([])).toEqual({
      filterType: 'textSet',
      source: 'fallback',
      conclusive: false,
    });
    expect(infer([null, '', '   ', undefined])).toEqual({
      filterType: 'textSet',
      source: 'fallback',
      conclusive: false,
    });
  });
});

describe('inferColumnFilterType: serverSide', () => {
  it('editor ヒントがあればそれで確定する', () => {
    expect(
      infer([], { isServerSide: true, editorType: 'number' }).filterType,
    ).toBe('numberSet');
  });

  it('ヒントが無ければ値を見ず text へ倒す(全行を持たないため)', () => {
    expect(infer([1, 2, 3], { isServerSide: true })).toEqual({
      filterType: 'text',
      source: 'fallback',
      conclusive: true,
    });
  });
});

describe('inferColumnFilterType: 走査コスト', () => {
  it('非空白サンプルが上限に達したら走査を打ち切る', () => {
    let reads = 0;
    const result = inferColumnFilterType({
      rowCount: 1_000_000,
      getRawValueAt: (index) => {
        reads += 1;
        return index;
      },
    });
    expect(result.filterType).toBe('numberSet');
    expect(reads).toBe(INFER_SAMPLE_LIMIT);
  });

  it('空白だらけの列でも走査上限で打ち切る(全行を舐めない)', () => {
    let reads = 0;
    const result = inferColumnFilterType({
      rowCount: 1_000_000,
      getRawValueAt: () => {
        reads += 1;
        return null;
      },
      scanLimit: 500,
    });
    expect(reads).toBe(500);
    expect(result.conclusive).toBe(false);
  });
});
