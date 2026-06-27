// 追加(13-B1): 列幅の自動調整(AG Grid の Autosize This Column /
//             Autosize All Columns 相当)の計測ロジックです。
//
// 方式の選定メモ(canvas measureText 方式を採用):
//   (a) canvas measureText: フォントを実セルと揃えて文字列幅を計測します。
//       同期・高速で、reflow を発生させません。
//       デメリットは renderCell カスタム描画を反映できないことと、
//       DOM レンダリング(カーニング / サブピクセル)との僅差です
//       (僅差は TEXT_SAFETY で吸収します)。
//   (b) オフスクリーン DOM 計測: 実 DOM へ流し込んで幅を読む方式。正確ですが
//       5,000 行 × 29 列では layout コストが大きく、分割実行が必要になります。
//   (c) AG Grid 本家の方式: 「描画済み(仮想化で DOM に存在する)セル」だけを計測。
//       高速ですが、画面外の行にある最長値が反映されないという既知の挙動があります。
//   本実装は (a) を採用し、全表示行を対象にします。
//
// 計測回数の抑制方式(変更 DS-4 ①-(1)):
//   旧版は列ごとに「ユニーク文字列の Set を全構築 → ユニーク数ぶん measureText」
//   していました。実データは値の重複が多いため Set dedupe が効きますが、全列ユニーク
//   (例: 30万行 ?stress)では dedupe が無効化し、列あたり数万回の measureText で
//   クリックハンドラが同期フリーズします。
//   そこで本版は次の 2 段構えに変えます:
//     1. 行を 1 パス走査し(全列同時)、列ごとに「推定幅が大きい上位 TOP_K 件の
//        文字列候補」だけを保持します(Set 全構築は撤去)。推定幅は measureText を
//        使わず、コードポイント単位の全角=2 / 半角=1 の整数ウェイト和です
//        (estimateTextWidthUnits)。
//     2. パス後、列ごとに候補 TOP_K 件だけを実 measureText し、最大値を採用します。
//   推定ウェイトは「どの候補を残すか」だけに効き、最終的な列幅は必ず実 measureText
//   から出すため、幅の値自体は常に正確です。日本語(全角)混在列で「文字数は少ないが
//   実幅は最大」の行が候補から押し出される取りこぼしを、全角ウェイトで防ぎます。
//   推定がラフでも候補選択が当たれば結果は正確で、残差は TEXT_SAFETY が吸収します。
//
// estimate ループの回避(追加 DS-4 ①-(3a)):
//   上記 1 の候補収集で、候補が TOP_K 件で満杯になった後は、各セルの実推定幅を
//   出す前に text.length だけで O(1) 足切りします。推定幅 units は「全角=2 / 半角=1」の
//   和で、コードポイント数 P に対し P ≤ units ≤ 2P、かつ P ≤ text.length(サロゲートは
//   length 側が大)なので units ≤ 2*text.length が常に成立します。したがって
//   2*text.length ≤ 最小推定幅 なら units ≤ 最小推定幅 が確定し、estimateTextWidthUnits の
//   コードポイント走査を回さずに棄却できます。30万行級では満杯後の estimate が collect の
//   支配項のため、候補が温まれば大多数のセルがここで走査ゼロで弾かれます。結果は
//   ①-(1)/①-(2) とバイト等価です(2*length ≤ minEst ⇒ est ≤ minEst で、既存の
//   est ≤ 最小推定幅 棄却と一致。候補集合・順序・minEst とも不変)。
// メモリ / 走査特性:
//   - 候補保持は列あたり最大 TOP_K 件で、行数に依存しません(旧 Set はユニーク数=
//     最悪 行数 ぶん成長していました)。
//   - 行の取得は rowModel シーム越し(getRow)で、呼び出し側のビュー順全行 materialize
//     は不要です(DS-3-10 clipboard と同型の seam-native 署名)。getRow は 1 行につき
//     1 回(行数ぶん)で、列数倍にはなりません。
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
// ヘッダーセルのテキスト以外の固定幅です(現行の hover オーバーレイヘッダーと同期。styles.css):
//   padding 0 6px(=12) + borderRight 1 + ラベル↔状態スロットの gap 4
//   + 状態スロット(ソート矢印 + フィルター漏斗 + 内部 gap)~24
//   = 41
// 注記(変更前は 141): grip / 列メニュー(⋮)は .ssg-header-actions が absolute + opacity:0 で
//   非hover では幅 0(hover でタイトル末尾を覆うオーバーレイ)になったため、ボタン 3 つぶん(~90)は
//   reserve しません。旧 Excel 列名バッジ(22)も廃止済みで、padding / gap も旧 20 / 18 から現行
//   12 / 4 へ縮んでいます。ソート / フィルターのインジケータ枠(~24)だけ残し、autoSize 後に
//   並べ替え / フィルターしてもタイトルがほぼ欠けないようにしています。
const HEADER_FIXED_CONTENT_WIDTH = 41;
// ヘッダータイトルのフォントです(headerCellBaseStyle: fontSize 13 / fontWeight 600)。
const HEADER_FONT_SIZE = 13;
const HEADER_FONT_WEIGHT = 600;
// リサイズ(column/resizeStart)と同じ既定 clamp 値です(gridReducer と同期)。
const DEFAULT_MIN_WIDTH = 60;
const DEFAULT_MAX_WIDTH = 1000;

// 追加(DS-4 ①-(1)): 列ごとに実 measureText する候補件数の上限です。
//   推定幅(estimateTextWidthUnits)上位 TOP_K 件だけを実計測します。
//   16 は「最長文字数 ≒ 最大ピクセル幅」がほぼ成立する実データで、推定の取りこぼしを
//   吸収できる十分な余裕値です(measureText 回数を 列あたり数万 → 最大 16 へ抑えます)。
const TOP_K = 16;

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

// 追加(DS-4 ①-(1)): コードポイントが「全角(East Asian Wide / Fullwidth)」かを判定します。
//   measureText を使わず候補選別の推定幅に使うための近似で、CJK・かな・ハングル・
//   全角形・絵文字などの主要レンジを 2 ウェイト、その他を 1 ウェイト扱いにします。
//   厳密な East Asian Width テーブルではありませんが、候補選別用途には十分です
//   (最終幅は実 measureText で確定するため、ここの僅差は結果に乗りません)。
const isWideCodePoint = (cp: number): boolean =>
  (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
  (cp >= 0x2e80 && cp <= 0x303e) || // CJK 部首補助 〜 康熙部首 〜 CJK 記号
  (cp >= 0x3041 && cp <= 0x33ff) || // ひらがな・カタカナ 〜 CJK 互換
  (cp >= 0x3400 && cp <= 0x4dbf) || // CJK 拡張 A
  (cp >= 0x4e00 && cp <= 0x9fff) || // CJK 統合漢字
  (cp >= 0xa000 && cp <= 0xa4cf) || // ヤオ文字(Yi)
  (cp >= 0xac00 && cp <= 0xd7a3) || // ハングル音節
  (cp >= 0xf900 && cp <= 0xfaff) || // CJK 互換漢字
  (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK 互換形
  (cp >= 0xff00 && cp <= 0xff60) || // 全角 ASCII 形
  (cp >= 0xffe0 && cp <= 0xffe6) || // 全角記号
  (cp >= 0x1f300 && cp <= 0x1faff) || // 絵文字(近似で全角扱い)
  (cp >= 0x20000 && cp <= 0x3fffd); // CJK 拡張 B 以降

// 追加(DS-4 ①-(1)): 文字列の推定幅ユニットです(全角=2 / 半角=1 の和)。
//   for...of でコードポイント単位に走査するためサロゲートペアも 1 文字として数えます。
const estimateTextWidthUnits = (text: string): number => {
  let units = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    units += isWideCodePoint(cp) ? 2 : 1;
  }
  return units;
};

export type ColumnAutosizeParams<T> = {
  // 計測対象の列です(1 列だけ / 全表示列のどちらも渡せます)。
  columns: GridColumn<T>[];
  // 変更(DS-4 ①-(1)): rows: T[] → seam-native(getRow + viewRowCount)。
  //   呼び出し側のビュー順全行 materialize を不要にします(DS-3-10 clipboard と同型)。
  //   getRow(viewIndex) はビュー位置(グローバル / 列フィルター適用後)の行を返します。
  //   ソート順は計測結果に影響しません(集合としての最大幅を見るため)。
  getRow: (viewIndex: number) => T;
  // ビュー行数です(= rowModel.getRowCount())。走査は 0..viewRowCount-1 です。
  viewRowCount: number;
  // セルフォント解決に使う grid root 要素です。
  gridRoot: HTMLElement | null;
  // 現在の解決済み幅です。計測結果が同じ列は戻り値から除外します(no-op 判定)。
  currentWidths: Record<string, number>;
};

// 追加(DS-4 ①-(2)): 計測を「行 collect 相」と「幅 finalize 相」に分離した accumulator です。
//   ①-(1) の 2 段方式(候補 TOP_K 収集 → 実 measureText)のうち、collect が候補収集を、
//   finalize がヘッダー / セルの実 measureText + clamp + no-op 判定を担います。
//   sync 版(computeAutosizedColumnWidths)と DS-4 ①-(2) の時間分割ランナーは、どちらも
//   この同一 accumulator を共有するため、走査の刻み方によらず結果が一致します
//   (同期一括 collect でも、チャンク分割 collect でも、collect の呼び出し順が同じなら
//    候補配列の最終状態は同値になります)。
export type ColumnWidthAccumulator<T> = {
  // 1 行ぶんを候補へ反映します(全列同時)。getRow の OOB(undefined)は呼び出し側で
  //   吸収する前提で、ここへは非 null の行だけ渡します。
  collect: (row: T) => void;
  // 候補から各列幅を確定し、現在幅から変化がある列だけの { columnKey: width } を返します
  //   (空オブジェクトなら呼び出し側は dispatch をスキップできます)。
  finalize: (params: {
    gridRoot: HTMLElement | null;
    currentWidths: Record<string, number>;
  }) => Record<string, number>;
};

// 列ごとの候補(推定幅 上位 TOP_K)を 1 パス collect で蓄積し、finalize で実 measureText
// へ落とす accumulator を生成します。候補保持は列あたり最大 TOP_K 件で行数非依存です。
export function createColumnWidthAccumulator<T>(
  columns: GridColumn<T>[],
): ColumnWidthAccumulator<T> {
  // ── 候補状態(1 パス × 全列同時) ──
  //   - candidates[ci]: 候補文字列(最大 TOP_K 件)
  //   - candidateEst[ci]: 各候補の推定幅
  //   - candidateMinEst[ci]: 候補内の最小推定幅(満杯時の足切り用。満杯前は +∞)
  const candidates: string[][] = columns.map(() => []);
  const candidateEst: number[][] = columns.map(() => []);
  const candidateMinEst: number[] = columns.map(
    () => Number.POSITIVE_INFINITY,
  );

  const collect = (row: T): void => {
    for (let ci = 0; ci < columns.length; ci += 1) {
      const text = String(getCellValue(row, columns[ci]) ?? '');
      if (text === '') {
        continue;
      }
      const list = candidates[ci];
      const estList = candidateEst[ci];
      // 追加(DS-4 ①-(3a)): 候補が満杯なら、実推定幅を出す前に length で O(1) 足切りします。
      //   units ≤ 2*text.length のため、2*text.length ≤ 最小推定幅 なら推定幅も最小以下が
      //   確定し、estimateTextWidthUnits のコードポイント走査を省けます(結果は下の
      //   est <= candidateMinEst 棄却と一致)。満杯前(minEst=+∞)はこの分岐に入りません。
      if (list.length === TOP_K && 2 * text.length <= candidateMinEst[ci]) {
        continue;
      }
      const est = estimateTextWidthUnits(text);
      if (list.length < TOP_K) {
        list.push(text);
        estList.push(est);
        if (list.length === TOP_K) {
          // 満杯になった時点で最小推定幅を確定します(以後の足切りに使用)。
          let m = estList[0];
          for (let j = 1; j < TOP_K; j += 1) {
            if (estList[j] < m) {
              m = estList[j];
            }
          }
          candidateMinEst[ci] = m;
        }
        continue;
      }
      // 満杯。length 足切りを通過した残りを、実推定幅で最終判定します。
      if (est <= candidateMinEst[ci]) {
        continue;
      }
      // 最小推定幅の候補を入れ替え、最小推定幅を再計算します。
      let minIdx = 0;
      for (let j = 1; j < TOP_K; j += 1) {
        if (estList[j] < estList[minIdx]) {
          minIdx = j;
        }
      }
      list[minIdx] = text;
      estList[minIdx] = est;
      let m = estList[0];
      for (let j = 1; j < TOP_K; j += 1) {
        if (estList[j] < m) {
          m = estList[j];
        }
      }
      candidateMinEst[ci] = m;
    }
  };

  const finalize = ({
    gridRoot,
    currentWidths,
  }: {
    gridRoot: HTMLElement | null;
    currentWidths: Record<string, number>;
  }): Record<string, number> => {
    const context = getSharedContext();
    if (!context || columns.length === 0) {
      return {};
    }

    const { cellFont, headerFont } = resolveFonts(gridRoot);
    const nextWidths: Record<string, number> = {};

    for (let ci = 0; ci < columns.length; ci += 1) {
      const column = columns[ci];

      // ── ヘッダー幅(タイトル + 固定要素) ──
      context.font = headerFont;
      const headerTitle = column.title || column.key;
      const headerRequired =
        context.measureText(headerTitle).width +
        TEXT_SAFETY +
        HEADER_FIXED_CONTENT_WIDTH;

      // ── セル幅(候補 TOP_K 件の実 measureText の最大) ──
      context.font = cellFont;
      let maxCellTextWidth = 0;
      const list = candidates[ci];
      for (let j = 0; j < list.length; j += 1) {
        const width = context.measureText(list[j]).width;
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
  };

  return { collect, finalize };
}

// 追加(DS-4 ①-(2)): autosize 計測が可能か(canvas 2d context が得られるか)を返します。
//   時間分割ランナーが「行走査を始める前に」no-op 判定するために使います(非対応環境で
//   30万行級の空振り走査をしないため)。sync 版は従来どおり内部の早期 return で吸収します。
export function canMeasureAutosize(): boolean {
  return getSharedContext() !== null;
}

// 列ごとの自動調整幅を計測します(同期一括版)。
// 戻り値は「現在幅から変化がある列だけ」の { columnKey: width } です
// (空オブジェクトなら呼び出し側は dispatch をスキップできます)。
// 変更(DS-4 ①-(2)): 計測本体を createColumnWidthAccumulator へ集約しました。本 sync 版は
//   「全行を一括 collect → finalize」で、DS-4 ①-(1) と結果はバイト等価です(等価検証で確認)。
//   早期 return(context 無し / 列 0)も従来どおり維持し、無駄な行走査を避けます。
export function computeAutosizedColumnWidths<T>({
  columns,
  getRow,
  viewRowCount,
  gridRoot,
  currentWidths,
}: ColumnAutosizeParams<T>): Record<string, number> {
  if (columns.length === 0 || getSharedContext() === null) {
    return {};
  }

  const accumulator = createColumnWidthAccumulator(columns);

  for (let viewIndex = 0; viewIndex < viewRowCount; viewIndex += 1) {
    const row = getRow(viewIndex);
    // 注記(DS-3-9/3-10 と同方針): seam の OOB は実行時ガードで吸収します。
    if (!row) {
      continue;
    }
    accumulator.collect(row);
  }

  return accumulator.finalize({ gridRoot, currentWidths });
}