// 追加(③): セル表示値の整形(UI 表示のみ)の組み込みフォーマッタ集約です。
//   - 返り値は表示文字列。元の値・編集・コピー・ソート・フィルターには一切影響しません。
//   - 各フォーマッタは CellValueFormatter<T> を返すファクタです。将来パターン(日付/％/通貨等)は
//     本ファイルへファクタを足し、index.ts でバレル公開すれば拡張できます。
import type { CellValueFormatter } from '../model/gridTypes';

// 追加(③): numberFormatter のオプションです。
export type NumberFormatterOptions = {
  // 整形ロケール。未指定時は実行環境の既定(日本/米国はいずれも 3 桁区切り「,」/小数点「.」)。
  locale?: string;
  // 3 桁区切りの有無。既定 true。
  useGrouping?: boolean;
  // 小数桁を固定したいとき指定。未指定時は「元の値の精度を保持」します。
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  // 値が null / undefined / '' のときの表示。既定 ''。
  emptyText?: string;
};

// 追加(③): 数値を「桁区切り＋(既定では)元の精度保持」で整形するフォーマッタを生成します。
//   - null / undefined / '' → emptyText('')。
//   - 数値化できない値 → 原値の文字列(String(value))をそのまま返します(整形しません)。
//   - min/maxFractionDigits 未指定時は値が本来持つ小数桁数をそのまま表示します
//     (Intl 既定の 3 桁丸めで表示精度が変わるのを避けるため)。
export function numberFormatter<T>(
  options: NumberFormatterOptions = {},
): CellValueFormatter<T> {
  const {
    locale,
    useGrouping = true,
    minimumFractionDigits,
    maximumFractionDigits,
    emptyText = '',
  } = options;

  return ({ value }) => {
    if (value === null || value === undefined || value === '') {
      return emptyText;
    }
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) {
      return String(value);
    }

    // 既定の小数桁: 値が本来持つ桁数(指数表記は 0 桁扱い・上限 20)。固定指定があればそれを優先。
    const s = Math.abs(n).toString();
    const dot = s.indexOf('.');
    const naturalFractionLength = dot === -1 ? 0 : s.length - dot - 1;

    const resolvedMin = minimumFractionDigits ?? 0;
    const baseMax = maximumFractionDigits ?? Math.min(naturalFractionLength, 20);
    const resolvedMax = Math.max(resolvedMin, baseMax);

    return new Intl.NumberFormat(locale, {
      useGrouping,
      minimumFractionDigits: resolvedMin,
      maximumFractionDigits: resolvedMax,
    }).format(n);
  };
}