// 追加(F-3): 条件付き書式ヘルパー(GridColumn.conditionalFormat)の純粋ロジックです(React 非依存)。
//   - 列ごとの min / max はビュー行(フィルター / ソート適用後。SSRM はロード済み範囲)から集計します。
//     集計は rowModel / columns の参照が変わったときだけ行い、内容が同じなら前回の Map を返します(行の memo を
//     壊さないため)。min / max を明示した列は集計しません(無コスト)。
//   - データバーは「軸(0 の位置)からの帯」を % で返し、カラースケールは CSS の color-mix() 式を返します
//     (JS で色を補間しない = トークン(var(--ssg-*))や任意の CSS 色をそのまま混ぜられる)。
//   - チップは値 → 指定のマップか関数から GridChipSpec へ正規化します。
//   表示だけの機能で、エクスポート / コピー / ソート / フィルターには影響しません。
import type {
  CellStyleContext,
  GridChipSpec,
  GridChipTone,
  GridColorScaleFormat,
  GridColumn,
  GridConditionalFormat,
  GridDataBarFormat,
  RowModel,
} from '../model/gridTypes.unbound';
import { getCellValue } from '../utils/permissions';

export type ConditionalFormatStats = { min: number; max: number };
export type ConditionalFormatStatsMap = ReadonlyMap<string, ConditionalFormatStats>;

export const EMPTY_CONDITIONAL_FORMAT_STATS: ConditionalFormatStatsMap = new Map();

const CHIP_TONES: readonly GridChipTone[] = ['neutral', 'info', 'good', 'warning', 'critical'];

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

// 列が「自動集計を必要とするか」(dataBar / colorScale のどちらかで min / max の片方でも省略)。
const needsStats = <T>(format: GridConditionalFormat<T> | undefined): boolean => {
  if (!format) {
    return false;
  }
  const bar = format.dataBar;
  const scale = format.colorScale;
  return (
    (bar !== undefined && (bar.min === undefined || bar.max === undefined)) ||
    (scale !== undefined && (scale.min === undefined || scale.max === undefined))
  );
};

// ビュー行を 1 回走査して、必要な列の min / max をまとめて集計します(数値以外・未ロード行は読み飛ばし)。
export const collectConditionalFormatStats = <T>(
  rowModel: RowModel<T>,
  columns: readonly GridColumn<T>[],
): ConditionalFormatStatsMap => {
  const targets = columns.filter((column) => needsStats(column.conditionalFormat));
  if (targets.length === 0) {
    return EMPTY_CONDITIONAL_FORMAT_STATS;
  }
  const mins = new Array<number>(targets.length).fill(Number.POSITIVE_INFINITY);
  const maxs = new Array<number>(targets.length).fill(Number.NEGATIVE_INFINITY);
  const total = rowModel.getRowCount();
  for (let rowIndex = 0; rowIndex < total; rowIndex += 1) {
    const row = rowModel.getRow(rowIndex);
    if (row === undefined) {
      continue;
    }
    for (let i = 0; i < targets.length; i += 1) {
      const value = getCellValue(row, targets[i]);
      if (!isFiniteNumber(value)) {
        continue;
      }
      if (value < mins[i]) {
        mins[i] = value;
      }
      if (value > maxs[i]) {
        maxs[i] = value;
      }
    }
  }
  const result = new Map<string, ConditionalFormatStats>();
  targets.forEach((column, i) => {
    if (Number.isFinite(mins[i]) && Number.isFinite(maxs[i])) {
      result.set(column.key, { min: mins[i], max: maxs[i] });
    }
  });
  return result;
};

const statsEqual = (a: ConditionalFormatStatsMap, b: ConditionalFormatStatsMap): boolean => {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, stats] of a) {
    const other = b.get(key);
    if (!other || other.min !== stats.min || other.max !== stats.max) {
      return false;
    }
  }
  return true;
};

export type ConditionalFormatStatsResolver<T> = (
  rowModel: RowModel<T>,
  columns: readonly GridColumn<T>[],
) => ConditionalFormatStatsMap;

// 集計のメモ化です。入力(rowModel / columns)の参照が同じなら再集計せず、再集計しても内容が同じなら前回の
//   Map の参照を返します(GridBodyRow の memo が参照比較のため、編集で min / max が変わらない限り行を再描画しない)。
export const createConditionalFormatStatsResolver = <T>(): ConditionalFormatStatsResolver<T> => {
  let lastRowModel: RowModel<T> | null = null;
  let lastColumns: readonly GridColumn<T>[] | null = null;
  let lastResult: ConditionalFormatStatsMap = EMPTY_CONDITIONAL_FORMAT_STATS;
  return (rowModel, columns) => {
    if (rowModel === lastRowModel && columns === lastColumns) {
      return lastResult;
    }
    const next = collectConditionalFormatStats(rowModel, columns);
    lastRowModel = rowModel;
    lastColumns = columns;
    if (!statsEqual(next, lastResult)) {
      lastResult = next;
    }
    return lastResult;
  };
};

const resolveRange = (
  explicitMin: number | undefined,
  explicitMax: number | undefined,
  stats: ConditionalFormatStats | undefined,
): { min: number; max: number } | null => {
  const min = explicitMin ?? stats?.min;
  const max = explicitMax ?? stats?.max;
  if (min === undefined || max === undefined || !Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }
  return { min, max };
};

// データバーの帯(セル幅に対する %)。負の値は 0 の軸から左へ伸び、負だけ / 正だけの列は端から伸びます(Excel と同じ)。
export type DataBarGeometry = {
  // 帯の左端 / 右端(0〜100 の %)。
  start: number;
  end: number;
  // 負の値の帯か(色を変える)。
  negative: boolean;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

export const resolveDataBar = (
  format: GridDataBarFormat,
  value: unknown,
  stats: ConditionalFormatStats | undefined,
): DataBarGeometry | null => {
  if (!isFiniteNumber(value)) {
    return null;
  }
  const range = resolveRange(format.min, format.max, stats);
  if (!range) {
    return null;
  }
  const span = range.max - range.min;
  if (!(span > 0)) {
    // 全行が同じ値(または min = max 指定): 0 以外は帯いっぱい、0 は帯なし。
    return value === 0 ? null : { start: 0, end: 100, negative: value < 0 };
  }
  const axis = clamp01((0 - range.min) / span);
  const position = clamp01((value - range.min) / span);
  const start = round2(Math.min(axis, position) * 100);
  const end = round2(Math.max(axis, position) * 100);
  if (end - start <= 0) {
    return null;
  }
  return { start, end, negative: value < 0 };
};

const SEQ_DEFAULT_COLORS: readonly string[] = ['var(--ssg-cf-seq-min)', 'var(--ssg-cf-seq-max)'];
const DIV_DEFAULT_COLORS: readonly string[] = [
  'var(--ssg-cf-div-negative)',
  'var(--ssg-cf-div-mid)',
  'var(--ssg-cf-div-positive)',
];

const mix = (color: string, percent: number, base: string): string =>
  `color-mix(in srgb, ${color} ${percent}%, ${base})`;

// カラースケールのセル背景(CSS の color-mix() 式)。数値以外・範囲が決まらないときは null(染めない)。
export const resolveColorScaleBackground = (
  format: GridColorScaleFormat,
  value: unknown,
  stats: ConditionalFormatStats | undefined,
): string | null => {
  if (!isFiniteNumber(value)) {
    return null;
  }
  const range = resolveRange(format.min, format.max, stats);
  if (!range) {
    return null;
  }
  if (format.type === 'diverging') {
    const colors = format.colors && format.colors.length >= 3 ? format.colors : DIV_DEFAULT_COLORS;
    const mid = format.mid ?? (range.min < 0 && range.max > 0 ? 0 : (range.min + range.max) / 2);
    const positive = value >= mid;
    const extent = positive ? range.max - mid : mid - range.min;
    const t = extent > 0 ? clamp01(Math.abs(value - mid) / extent) : value === mid ? 0 : 1;
    if (t === 0) {
      return colors[1];
    }
    // 小さな差も見えるよう 12% から始めて最大 60% まで(文字のコントラストを保つ上限)。
    const percent = Math.round(12 + 48 * t);
    return mix(positive ? colors[2] : colors[0], percent, colors[1]);
  }
  const colors = format.colors && format.colors.length >= 2 ? format.colors : SEQ_DEFAULT_COLORS;
  const span = range.max - range.min;
  const t = span > 0 ? clamp01((value - range.min) / span) : 1;
  return mix(colors[1], Math.round(t * 100), colors[0]);
};

// チップの指定を正規化します(tone 文字列 → spec。載っていない値は null)。
export const resolveChipSpec = <T>(
  chips: NonNullable<GridConditionalFormat<T>['chips']>,
  ctx: CellStyleContext<T>,
): GridChipSpec | null => {
  const raw = typeof chips === 'function' ? chips(ctx) : chips[String(ctx.value ?? '')];
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === 'string') {
    return CHIP_TONES.includes(raw) ? { tone: raw } : null;
  }
  return raw;
};

export const resolveChipTone = (spec: GridChipSpec): GridChipTone =>
  spec.tone && CHIP_TONES.includes(spec.tone) ? spec.tone : 'neutral';
