// 追加(13-B1): 列幅の自動調整(AG Grid の Autosize This Column /
//             Autosize All Columns 相当)の計測ロジックです。
//
// 方式の選定メモ(canvas measureText 方式を採用):
//   (a) canvas measureText: フォントを実セルと揃えて文字列幅を計測します。
//       同期・O(ユニーク文字列数) で高速、reflow を発生させません。
//       デメリットは renderCell カスタム描画を反映できないことと、
//       DOM レンダリング(カーニング / サブピクセル)との僅差です
//       (僅差は TEXT_SAFETY で吸収します)。
//   (b) オフスクリーン DOM 計測: 実 DOM へ流し込んで幅を読む方式。正確ですが
//       5,000 行 × 29 列では layout コストが大きく、分割実行が必要になります。
//   (c) AG Grid 本家の方式: 「描画済み(仮想化で DOM に存在する)セル」だけを計測。
//       高速ですが、画面外の行にある最長値が反映されないという既知の挙動があります。
//   本実装は (a) を採用し、全表示行を対象にしつつ「ユニーク文字列だけを計測」する
//   dedupe で計測回数を抑えます(実データは値の重複が多く、set フィルターの
//   候補収集と同じ性質を利用できます)。
//
// 既知の制限:
//   - 計測対象テキストはデフォルトセル描画と同じ String(getCellValue(row, column) ?? '')
//     です。renderCell を指定した列では実描画と差が出得ます(必要になったら
//     列定義に getAutosizeText のような拡張点を 13-B 後続で追加する想定です)。
import type { GridColumn } from '../model/gridTypes';
import { getCellValue } from '../utils/permissions';

// ── レイアウト定数(GridBodyLayer / GridHeaderRow の style と同期) ──
// セル: padding '0 10px'(=20) + borderRight 1px、box-sizing: border-box。
const CELL_HORIZONTAL_FRAME = 21;
// canvas 計測と DOM 描画の僅差(カーニング・サブピクセル丸め)の安全マージンです。
const TEXT_SAFETY = 4;
// ヘッダーセルのテキスト以外の固定幅です(GridHeaderRow の構造と同期):
//   padding 左右 10+10 + Excel 列名バッジ minWidth 22 + バッジ↔本文 gap 8
//   + 本文内 gap 6×3(タイトル↔ソート↔フィルター↔メニュー)
//   + アクションボタン 24×3(ソート / フィルター / メニュー) + borderRight 1
//   = 141
// 注記: メニュー経由で autosize する時点で enableColumnMenu=true のため、
//       「⋮」ボタン込みの 3 ボタンで見積もります。
const HEADER_FIXED_CONTENT_WIDTH = 141;
// ヘッダータイトルのフォントです(headerCellBaseStyle: fontSize 13 / fontWeight 600)。
const HEADER_FONT_SIZE = 13;
const HEADER_FONT_WEIGHT = 600;
// リサイズ(column/resizeStart)と同じ既定 clamp 値です(gridReducer と同期)。
const DEFAULT_MIN_WIDTH = 60;
const DEFAULT_MAX_WIDTH = 1000;

// ── 共有 canvas context(モジュールローカル・遅延生成) ──
let sharedContext: CanvasRenderingContext2D | null = null;

const getSharedContext = (): CanvasRenderingContext2D | null => {
  if (sharedContext) {
    return sharedContext;
  }
  // 注記: SSR / canvas 非対応環境では null を返し、呼び出し側で no-op になります。
  if (typeof document === 'undefined') {
    return null;
  }
  sharedContext = document.createElement('canvas').getContext('2d');
  return sharedContext;
};

// ── フォント解決 ──
// セルは自前の font 指定を持たず祖先から継承するため、grid root の computed style を
// そのまま使えばセルの実フォント(size / family / weight)と一致します。
// ヘッダーは fontSize 13 / fontWeight 600 を明示しているため、family のみ共有します。
type ResolvedFonts = {
  cellFont: string;
  headerFont: string;
};

const FALLBACK_FONT_FAMILY = 'system-ui, sans-serif';

const resolveFonts = (gridRoot: HTMLElement | null): ResolvedFonts => {
  let fontFamily = FALLBACK_FONT_FAMILY;
  let cellFontSize = 13;
  let cellFontWeight = '400';

  if (gridRoot && typeof window !== 'undefined') {
    const computed = window.getComputedStyle(gridRoot);
    if (computed.fontFamily) {
      fontFamily = computed.fontFamily;
    }
    const parsedSize = Number.parseFloat(computed.fontSize);
    if (Number.isFinite(parsedSize) && parsedSize > 0) {
      cellFontSize = parsedSize;
    }
    if (computed.fontWeight) {
      cellFontWeight = computed.fontWeight;
    }
  }

  return {
    cellFont: `${cellFontWeight} ${cellFontSize}px ${fontFamily}`,
    headerFont: `${HEADER_FONT_WEIGHT} ${HEADER_FONT_SIZE}px ${fontFamily}`,
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export type ColumnAutosizeParams<T> = {
  // 計測対象の列です(1 列だけ / 全表示列のどちらも渡せます)。
  columns: GridColumn<T>[];
  // 表示中の行です(グローバル / 列フィルター適用後。ソート順は計測に影響しません)。
  rows: T[];
  // セルフォント解決に使う grid root 要素です。
  gridRoot: HTMLElement | null;
  // 現在の解決済み幅です。計測結果が同じ列は戻り値から除外します(no-op 判定)。
  currentWidths: Record<string, number>;
};

// 列ごとの自動調整幅を計測します。
// 戻り値は「現在幅から変化がある列だけ」の { columnKey: width } です
// (空オブジェクトなら呼び出し側は dispatch をスキップできます)。
export function computeAutosizedColumnWidths<T>({
  columns,
  rows,
  gridRoot,
  currentWidths,
}: ColumnAutosizeParams<T>): Record<string, number> {
  const context = getSharedContext();
  if (!context || columns.length === 0) {
    return {};
  }

  const { cellFont, headerFont } = resolveFonts(gridRoot);
  const nextWidths: Record<string, number> = {};

  for (const column of columns) {
    // ── ヘッダー幅(タイトル + 固定要素) ──
    context.font = headerFont;
    const headerTitle = column.title || column.key;
    const headerRequired =
      context.measureText(headerTitle).width +
      TEXT_SAFETY +
      HEADER_FIXED_CONTENT_WIDTH;

    // ── セル幅(ユニーク文字列の最長値) ──
    // 注記: 重複値の再計測を避けるため、まずユニーク文字列を集めます
    //       (5,000 行でも実データのユニーク数は大幅に少ないのが通例です)。
    const uniqueTexts = new Set<string>();
    for (const row of rows) {
      uniqueTexts.add(String(getCellValue(row, column) ?? ''));
    }

    context.font = cellFont;
    let maxCellTextWidth = 0;
    for (const text of uniqueTexts) {
      if (text === '') {
        continue;
      }
      const width = context.measureText(text).width;
      if (width > maxCellTextWidth) {
        maxCellTextWidth = width;
      }
    }
    const cellRequired =
      maxCellTextWidth > 0
        ? maxCellTextWidth + TEXT_SAFETY + CELL_HORIZONTAL_FRAME
        : 0;

    // ── clamp + no-op 判定 ──
    const resolved = Math.ceil(
      clamp(
        Math.max(headerRequired, cellRequired),
        column.minWidth ?? DEFAULT_MIN_WIDTH,
        column.maxWidth ?? DEFAULT_MAX_WIDTH,
      ),
    );

    if (currentWidths[column.key] !== resolved) {
      nextWidths[column.key] = resolved;
    }
  }

  return nextWidths;
}
