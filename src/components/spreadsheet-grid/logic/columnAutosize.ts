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
//   本実装は (a)[全行スクリーニング] と (b)[実 DOM 計測] を 2 段で組み合わせます(変更 ②-S1):
//   Phase 1 = (a) の canvas 推定で全表示行から候補(TOP_K)を絞り、Phase 2 = (b) で候補だけを
//   実 DOM(grid root 配下の計測セル)で実測します。全行カバレッジ((c) の弱点を回避)と、実描画
//   忠実((a) の弱点を回避: padding / 字間 / kerning / valueFormatter を offsetWidth が内包)を
//   両取りします。実測は候補のみ(列あたり最大 TOP_K 件)なので reflow は finalize で 1 回です。
//   DOM 不可(SSR 等)では (a) の canvas 計測へフォールバックします。
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
// 既知の制限 / 拡張点:
//   - Phase 2 は「デフォルトセルの表示テキスト」(valueFormatter 適用後 / 未指定は String(value))を
//     実 DOM で測ります。整形・letter-spacing・フォントは反映されますが、renderCell で独自の DOM
//     (アイコン / バッジ等)を描く列は、テキストを proxy にする Phase 1 では幅相関が崩れます。その
//     場合は列に estimateCellWidth(②-S2)を指定すると、その列は「申告 content 幅の全行 running-max」で
//     確定します(テキスト / 候補 / 実 DOM 計測を使わず、consumer 申告を信頼。React mount は行いません)。
//   - suppressAutoSize: true の列は計測対象から除外し、consumer 指定の width を維持します
//     (固定幅優先。collect でも候補を貯めず、finalize でも幅を出しません)。
//   - autoHeight: true の列も計測対象外です(②-S3)。autoHeight 列は「幅固定 + 折り返し」が本来の姿で、
//     autoSize は単一行幅で測るため、autoHeight 列を測ると長文を1行幅にし maxWidth で途切れる /
//     極端に横長になります。consumer が選んだ width を維持し、折り返し(autoHeight 有効時)に委ねます。
import type { GridColumn } from '../model/gridTypes';
import { getCellValue } from '../utils/permissions';

// ── レイアウト定数(GridBodyLayer / GridHeaderRow の style と同期) ──
// セル: padding '0 10px'(=20) + borderRight 1px、box-sizing: border-box。
//   注記(②-S1/S2): Phase 2 の実 DOM 計測では offsetWidth に padding / border が含まれるため不要です。
//   canvas フォールバック経路(DOM 不可時)と、estimateCellWidth 列(申告 content 幅へ枠を加算)で使用します。
const CELL_HORIZONTAL_FRAME = 21;
// canvas 計測と DOM 描画の僅差(カーニング・サブピクセル丸め)の安全マージンです。
//   注記(②-S1): Phase 2 の実 DOM 計測では実体を測るため不要。canvas フォールバックと、ヘッダー
//   計測(従来どおり canvas)でのみ使用します。
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
// リサイズ(column/resizeStart)と同じ既定下限です(gridReducer と同期)。
//   上限は既定で設けません(②-S4: 旧 DEFAULT_MAX_WIDTH=1000 を撤廃。明示 maxWidth のみ上限になります)。
const DEFAULT_MIN_WIDTH = 60;

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

// 追加(②-S1): セルの表示テキストを返します(デフォルトセル描画と同一の規則)。
//   valueFormatter 指定時はその返り値、未指定は String(value ?? '')。Phase 2 の実 DOM 計測で
//   「実際に表示される文字列」を測るために使います(整形後の桁区切り等が幅へ反映されます)。
const resolveCellDisplayText = <T,>(
  row: T,
  column: GridColumn<T>,
): string => {
  const value = getCellValue(row, column);
  return column.valueFormatter
    ? column.valueFormatter({ value, row, column })
    : String(value ?? '');
};

// 追加(②-S1): Phase 2 の計測コンテナを grid root 配下に生成します(作れなければ null)。
//   grid root 配下に置くことで font / letter-spacing 等の継承文脈を実セルと一致させます。
//   コンテナ自体は画面外・不可視・レイアウト非干渉です。
const createMeasuringContainer = (
  gridRoot: HTMLElement | null,
): HTMLElement | null => {
  if (!gridRoot || typeof document === 'undefined') {
    return null;
  }
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText =
    'position:absolute;top:-99999px;left:-99999px;' +
    'visibility:hidden;pointer-events:none;width:auto;height:auto;' +
    'contain:layout style;';
  gridRoot.appendChild(container);
  return container;
};

// 追加(②-S1): 候補 1 件ぶんの計測ノードを作ります。実セル(.ssg-body-cell)の padding / border /
//   box-sizing / フォント継承を流用しつつ、計測用に inline-block + width:auto + nowrap へ上書きします。
//   offsetWidth = テキスト + padding + border = 必要列幅(箱まるごと)になります。
const createMeasuringNode = (text: string): HTMLElement => {
  const node = document.createElement('div');
  node.className = 'ssg-body-cell';
  node.style.cssText =
    'display:inline-block;position:static;top:auto;left:auto;' +
    'width:auto;height:auto;white-space:nowrap;overflow:visible;';
  node.textContent = text;
  return node;
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

// 追加(②-S3): autoSize の計測対象外にする列の判定です。
//   - suppressAutoSize(②-S1): consumer が固定幅を明示した列。
//   - autoHeight: 折り返し前提の列。autoSize の計測は単一行(計測ノードは white-space:nowrap)で
//     行うため、autoHeight 列を測ると「折り返したい長文」を1行幅にし、maxWidth に当たって途切れる
//     / 極端に横長になります。autoHeight 列は consumer が選んだ width で折り返すのが本来の姿なので、
//     autoSize では幅を変えません(グリッドの autoHeight 有効 / 無効に関わらず列フラグで判定)。
const isAutosizeExcludedColumn = <T,>(column: GridColumn<T>): boolean =>
  column.suppressAutoSize === true || column.autoHeight === true;

// 列ごとの候補(推定幅 上位 TOP_K)を 1 パス collect で蓄積し、finalize で実 measureText
// へ落とす accumulator を生成します。候補保持は列あたり最大 TOP_K 件で行数非依存です。
export function createColumnWidthAccumulator<T>(
  columns: GridColumn<T>[],
): ColumnWidthAccumulator<T> {
  // ── 候補状態(1 パス × 全列同時) ──
  //   変更(②-S1): 候補に「元の行」を保持します(candidateRow)。Phase 2 でその行から表示テキスト
  //   (valueFormatter 適用後)を導出して実 DOM 計測するためです。推定 / 足切りは従来どおり生テキスト
  //   (String(getCellValue))で行います(桁区切り等は単調なので候補順位は保たれ、推定は安いまま)。
  //   - candidateRow[ci]: 候補の元行(最大 TOP_K 件)
  //   - candidateEst[ci]: 各候補の推定幅(生テキスト基準)
  //   - candidateMinEst[ci]: 候補内の最小推定幅(満杯時の足切り用。満杯前は +∞)
  const candidateRow: T[][] = columns.map(() => []);
  const candidateEst: number[][] = columns.map(() => []);
  const candidateMinEst: number[] = columns.map(
    () => Number.POSITIVE_INFINITY,
  );
  // 追加(②-S2): estimateCellWidth 指定列用。候補 / テキスト計測を使わず、consumer 申告の content 幅
  //   (px)の全行 running-max を保持します(finalize でセル枠を足して確定)。
  const maxEstimateWidth: number[] = columns.map(() => 0);

  const collect = (row: T): void => {
    for (let ci = 0; ci < columns.length; ci += 1) {
      // 計測対象外(②-S1/S3): suppressAutoSize / autoHeight 列はスキップ(候補も貯めません)。
      if (isAutosizeExcludedColumn(columns[ci])) {
        continue;
      }
      // 追加(②-S2): estimateCellWidth 指定列は、consumer 申告の content 幅で全行 running-max を
      //   取ります(テキスト proxy が効かないカスタムUI列向け。候補 / テキスト計測は使いません)。
      const estimate = columns[ci].estimateCellWidth;
      if (estimate) {
        const w = estimate(row, columns[ci]);
        if (w > maxEstimateWidth[ci]) {
          maxEstimateWidth[ci] = w;
        }
        continue;
      }
      const text = String(getCellValue(row, columns[ci]) ?? '');
      if (text === '') {
        continue;
      }
      const rows = candidateRow[ci];
      const estList = candidateEst[ci];
      // 追加(DS-4 ①-(3a)): 候補が満杯なら、実推定幅を出す前に length で O(1) 足切りします。
      //   units ≤ 2*text.length のため、2*text.length ≤ 最小推定幅 なら推定幅も最小以下が
      //   確定し、estimateTextWidthUnits のコードポイント走査を省けます(結果は下の
      //   est <= candidateMinEst 棄却と一致)。満杯前(minEst=+∞)はこの分岐に入りません。
      if (rows.length === TOP_K && 2 * text.length <= candidateMinEst[ci]) {
        continue;
      }
      const est = estimateTextWidthUnits(text);
      if (rows.length < TOP_K) {
        rows.push(row);
        estList.push(est);
        if (rows.length === TOP_K) {
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
      rows[minIdx] = row;
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

    // Phase 2(②-S1): 実 DOM 計測コンテナ。作れれば DOM 経路、ダメなら canvas フォールバック。
    const container = createMeasuringContainer(gridRoot);
    try {
      // ── DOM 経路: 全列・全候補をノード化(write)してから offsetWidth をまとめて読みます。
      //   write を全件終えてから read するため、強制レイアウトは read の最初の 1 回に集約されます。
      let cellWidthByCol: number[] | null = null;
      if (container) {
        const nodesByCol: HTMLElement[][] = [];
        for (let ci = 0; ci < columns.length; ci += 1) {
          if (isAutosizeExcludedColumn(columns[ci])) {
            nodesByCol.push([]);
            continue;
          }
          // 追加(②-S2): estimateCellWidth 列は候補を使わないため計測ノードを作りません。
          if (columns[ci].estimateCellWidth) {
            nodesByCol.push([]);
            continue;
          }
          const rows = candidateRow[ci];
          const nodes: HTMLElement[] = [];
          for (let j = 0; j < rows.length; j += 1) {
            const text = resolveCellDisplayText(rows[j], columns[ci]);
            if (text === '') {
              continue;
            }
            const node = createMeasuringNode(text);
            container.appendChild(node);
            nodes.push(node);
          }
          nodesByCol.push(nodes);
        }
        // read 相(ここで初回のみレイアウトが走り、以後の offsetWidth は再計算なし)。
        cellWidthByCol = nodesByCol.map((nodes) => {
          let max = 0;
          for (let j = 0; j < nodes.length; j += 1) {
            const w = nodes[j].offsetWidth;
            if (w > max) {
              max = w;
            }
          }
          return max;
        });
      }

      for (let ci = 0; ci < columns.length; ci += 1) {
        const column = columns[ci];
        // 計測対象外(②-S1/S3): suppressAutoSize / autoHeight 列は計測せず、現在幅を維持します。
        if (isAutosizeExcludedColumn(column)) {
          continue;
        }

        // ── ヘッダー幅(従来どおり canvas + 固定要素) ──
        context.font = headerFont;
        const headerTitle = column.title || column.key;
        const headerRequired =
          context.measureText(headerTitle).width +
          TEXT_SAFETY +
          HEADER_FIXED_CONTENT_WIDTH;

        // ── セル幅 ──
        let cellRequired: number;
        if (column.estimateCellWidth) {
          // 追加(②-S2): estimateCellWidth 列は申告 content 幅の最大 + セル枠(padding / border)で確定。
          //   DOM / canvas のテキスト計測は行いません(consumer 申告を信頼)。
          cellRequired =
            maxEstimateWidth[ci] > 0
              ? maxEstimateWidth[ci] + CELL_HORIZONTAL_FRAME
              : 0;
        } else if (cellWidthByCol) {
          // Phase 2: 実 DOM の offsetWidth(padding / border / 字間 / 整形を内包。補正定数は加えません)。
          cellRequired = cellWidthByCol[ci];
        } else {
          // フォールバック(DOM 不可): 表示テキストを canvas 計測 + 補正定数。
          context.font = cellFont;
          let maxCellTextWidth = 0;
          const rows = candidateRow[ci];
          for (let j = 0; j < rows.length; j += 1) {
            const text = resolveCellDisplayText(rows[j], column);
            if (text === '') {
              continue;
            }
            const width = context.measureText(text).width;
            if (width > maxCellTextWidth) {
              maxCellTextWidth = width;
            }
          }
          cellRequired =
            maxCellTextWidth > 0
              ? maxCellTextWidth + TEXT_SAFETY + CELL_HORIZONTAL_FRAME
              : 0;
        }

        // ── clamp + no-op 判定 ──
        const resolved = Math.ceil(
          clamp(
            Math.max(headerRequired, cellRequired),
            column.minWidth ?? DEFAULT_MIN_WIDTH,
            // 変更(②-S4): 既定上限を撤廃。明示 maxWidth がなければ上限なし(内容にぴったり合わせます)。
            column.maxWidth ?? Number.POSITIVE_INFINITY,
          ),
        );

        if (currentWidths[column.key] !== resolved) {
          nextWidths[column.key] = resolved;
        }
      }
    } finally {
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
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