// 縦スクロールの仮想化ジオメトリ(uniform 行高専用)です。
//
// 目的(scroll-space 仮想化 / 1M 行対応):
//   論理ボディ全高 = rowCount * rowHeight が、ブラウザの要素高さ上限
//   (Chrome/Edge/Electron ≈ 33,554,432px / Firefox ≈ 17,895,697px) を超えると、
//   scrollHeight がクランプされて末尾行が到達不能になります(座標破綻 = 機能ブロッカー)。
//   そこで物理 DOM 高さを上限内(MAX_BODY_PX)へ圧縮し、物理 scrollTop ↔ 論理オフセットを
//   線形写像します(= pixel scaling)。圧縮が不要な行数では完全な恒等写像になります。
//
// 設計(このコードベース固有の前提を踏襲):
//   - 単一スクロールコンテナ + sticky 3 ペイン(Batch 10-G)を維持します。ネイティブ
//     スクロールのまま、行/overlay レイヤーへ translateY(D) を掛けて物理ウィンドウへ
//     引き込みます(JS スクロール同期は増やしません)。
//   - 行は uniform 行高(estimateSize 定数)なので、窓出しは純粋な算術(firstRow / count)に
//     潰れます。実測 / 二分探索 / サイズキャッシュは不要です。
//   - 物理↔論理写像・行窓・ヒットテストを本ファイル 1 か所へ集約します(縦ジオメトリの
//     シーム)。将来 auto-height モードを足すときは、同じ契約の第二実装(prefix-sum +
//     二分探索 + ResizeObserver)へ差し替えるだけで、消費側(GridBodyLayer / ヒットテスト /
//     viewport-sync)は不変に保てます。
//
// 等価性(圧縮不要時の no-op):
//   logicalBodyHeight <= MAX_BODY_PX のとき scaleFactor = 1 / translateY = 0 となり、
//   rows[i].start = headerHeight + i * rowHeight は旧 rowVirtualizer(scrollMargin=
//   headerHeight / estimateSize=rowHeight)の virtualRow.start と数値的に一致します。
//   ヒットテストも D=0 で従来式(floor(y / rowHeight))と一致します。

// 物理ボディ高さの上限です。
// 注記: 全ブラウザ安全側の既定として 15,000,000 を採用しています(Firefox ≈ 17.9M を
//   下回るマージン)。scaling が起動する閾値は MAX_BODY_PX / rowHeight 行
//   (rowHeight=36 なら約 417k 行)で、これ未満では現状と数値一致します。
//   実行環境が Chrome / Electron 確定なら 30,000,000 まで上げて起動閾値を約 833k 行へ
//   押し上げてよく、その場合の差分は本定数 1 行のみです。
export const MAX_BODY_PX = 15_000_000;

// auto-height 行モードの行数上限です(gate)。論理全高 = 行数 × 1 行最大高(~280px)が
//   MAX_BODY_PX を超えない範囲に行数で gate します(MAX_BODY_PX / 280 ≒ 53,571 を切り下げ)。
//   これにより auto-height モードでは scaleFactor=1 / windowBaseOffsetPx=0 / translateY=0 が
//   保証され、scaling・float32 対策・基準オフセットが休眠します。超過時は uniform 行高へ
//   フォールバックします(上限値・1 行最大高はプロダクト判断で調整可)。
export const AUTO_HEIGHT_MAX_ROWS = 50_000;

// auto-height を使うべきか(測定なしで事前判定できる pure gate)。
//   props 有効 + 駆動列(autoHeight:true)が存在 + 行数が [1, maxRows] のとき true。
//   超過時は false(uniform フォールバック)。viewRowCount=0 も false(描画なし)。
export const shouldUseAutoHeight = (
  autoHeightEnabled: boolean,
  hasAutoHeightColumn: boolean,
  viewRowCount: number,
  maxRows: number,
): boolean =>
  autoHeightEnabled &&
  hasAutoHeightColumn &&
  viewRowCount > 0 &&
  viewRowCount <= maxRows;

// 描画ウィンドウの基準オフセットをスナップする単位(px)です。
// 目的(巨大 transform によるペイント不良の回避):
//   scaling 起動時、行/オーバーレイを「絶対論理 top(最大 ≈ rowCount*rowHeight)」へ置くと、
//   1M 行では 38,000,000px に達します。ブラウザの transform/レイアウトは float32 の正確整数域
//   (2^24 = 16,777,216px)を超えると配置が不安定になり、一定の行から先がペイントされません
//   (= 末尾行に到達できない症状)。そこで scaling 時は描画ウィンドウ先頭をこの単位へスナップした
//   基準で相対化し、基準ぶんを wrapper の translateY 側へ畳み込みます。これにより行/オーバーレイの
//   transform も wrapper の translateY も常に <= physicalBodyHeight(< 16.7M)へ収まります。
//   スナップ単位なので、チャンクを跨がない通常スクロールでは per-row の値が変わらず、
//   GridBodyRow の memo(縦スクロールで再レンダーしない最適化)を維持します。
// 注記: 1,048,576px(2^20)は rowHeight=38 で約 27,000 行ぶん。チャンク跨ぎは数万行スクロールに
//   1 回で、per-row 値が更新されるのはその瞬間だけです。
export const WINDOW_BASE_CHUNK_PX = 1 << 20;

// 描画する 1 行の窓エントリです(旧 @tanstack/react-virtual の VirtualItem 互換)。
export type VerticalRow = {
  index: number;
  // 行の論理 top(headerHeight 込み)。GridBodyLayer の translateY 基準(virtualRow.start 互換)。
  start: number;
  // 行ごとの高さ(px)。auto-height 専用。uniform 経路では未設定で、消費側(GridBodyLayer)は
  //   rowHeight prop へフォールバックします(uniform 出力をバイト等価に保つため)。
  size?: number;
};

// 縦ジオメトリのシーム契約です。uniform / 将来の auto-height で実装を差し替えても、
// 消費側はこの型だけに依存します。
export type VerticalGeometry = {
  // コンテナ / overlay+body wrapper / ドロップインジケータの高さに使う物理ボディ高さ
  // (= min(logicalBodyHeight, MAX_BODY_PX))。
  physicalBodyHeight: number;
  // 論理ボディ全高(= rowCount * rowHeight)。selection の全面高さ等、論理座標が要る箇所用。
  logicalBodyHeight: number;
  // 物理 scrollTop → 論理 scrollTop の倍率(>= 1)。logicalBodyHeight <= cap のとき 1。
  scaleFactor: number;
  // overlay+body wrapper に掛ける translateY。scaleFactor=1 のとき 0(現状と一致)。
  //   scaling 時は windowBaseOffsetPx を畳み込むため正値を取り得ます(<= physicalBodyHeight に有界)。
  translateY: number;
  // 行/オーバーレイの「絶対論理 top(headerHeight + row*rowHeight)」から差し引く基準オフセット(px)。
  //   no-op(scaleFactor=1)では 0(= 従来どおり絶対配置)。scaling 時のみ WINDOW_BASE_CHUNK_PX 境界へ
  //   スナップした正値。消費側はオーバーレイの top からこの値を引き、行 start は本ファイルで反映済みです。
  //   基準は translateY 側に同額が含まれるため、ネットの画面座標は scaleFactor に関わらず不変です。
  windowBaseOffsetPx: number;
  // 描画する行窓(virtualRow 互換の {index, start})。
  rows: VerticalRow[];
  // 描画行 index 集合(GridBodyLayer の OOB / 重複ガードと整合)。
  rowIndexSet: Set<number>;
};

export type ComputeVerticalGeometryArgs = {
  rowCount: number;
  rowHeight: number;
  headerHeight: number;
  // スクロールコンテナの可視高さ(clientHeight)。窓の行数と scaleFactor に効きます。
  viewportHeight: number;
  // 物理 scrollTop(スクロールコンテナの scrollTop そのもの)。
  scrollTop: number;
  // 窓の上下に先回りで描画する行数(旧 rowVirtualizer overscan=20 相当)。
  overscan: number;
  // 物理ボディ高さの上限(MAX_BODY_PX)。
  maxBodyPx: number;
};

// 行メトリクス(スクロール非依存)。行の content-top 位置・区間高さ・content-y→行 を解決します。
//   overlay(active cell / selection)の top/height とヒットテストの行解決がここを通ります。
//   ★スクロール非依存(rowCount / rowHeight のみ依存)。overlay の useMemo を scrollTop に結合させず、
//     縦スクロールで再レンダーさせない(11-A の memo 最適化を維持)ための分離です。computeVerticalGeometry
//     が返す per-scroll の窓(rows / translateY)とは別軸で、selection 等が変わったときだけ作り直します。
//   将来の auto-height は同じ RowMetrics 契約を prefix-sum + 二分探索で実装し、消費側を不変に保ちます。
export type RowMetrics = {
  // 行数(= 表示対象の行数)。rowAtContentY の clamp 上限に使います。
  rowCount: number;
  // body content-top 基準の行 top(headerHeight 抜き)。= prefix(index)。
  rowTop(index: number): number;
  // 行区間 [startInclusive, endInclusive] の高さ合計。= prefix(end+1) - prefix(start)。
  rowsHeight(startInclusive: number, endInclusive: number): number;
  // ボディ論理全高(= rowTop(rowCount))。col 選択の全面高さ等に使用。
  totalBodyHeight: number;
  // content-top 基準 y(論理)→ 行 index([0, rowCount-1] へ clamp)。
  rowAtContentY(y: number): number;
};

// uniform 行高の RowMetrics を生成します(純算術)。
//   各 resolver は移行前の呼び出し箇所(index*rowHeight 等)とバイト等価です。
export const createUniformRowMetrics = (
  rowCount: number,
  rowHeight: number,
): RowMetrics => ({
  rowCount,
  rowTop: (index) => index * rowHeight,
  rowsHeight: (startInclusive, endInclusive) =>
    (endInclusive - startInclusive + 1) * rowHeight,
  totalBodyHeight: rowCount * rowHeight,
  rowAtContentY: (y) =>
    Math.min(Math.max(Math.floor(y / rowHeight), 0), Math.max(rowCount - 1, 0)),
});

// 選択オーバーレイの縦範囲を、現在の描画窓(virtualRows の先頭/末尾行 index)へクリップします。
//   col / グリッド全選択 / 巨大 cell・row 選択は論理全高(uniform で rowCount*rowHeight、auto-height でも
//   最大 MAX_BODY_PX)に達し、ブラウザの要素高さ上限(≈33.5M) / float32 正確整数域(2^24)を超えて一部しか
//   描画されません(列全選択ハイライトの途中切れ)。可視域に映るのは窓の帯だけなので、選択の縦範囲を窓へ
//   クリップして小さな帯に畳めば、視覚的に完全かつペイント安全になります。
//   窓は overscan を含み viewport より広いため、帯の上下ボーダーは可視域の外へ落ち、横スクロール時に
//   中途半端な水平線は出ません(グリッド真上端/真下端でのみボーダーが見え、巨大 div 時代と一致)。
//   窓内に収まる通常の選択ではクリップは恒等で、出力は不変です(no-op 等価)。
//   ★スクロール非依存の rowTop/rowsHeight(RowMetrics)と組み合わせて使うため、auto-height の
//     prefix-sum 版 RowMetrics へ差し替えてもこのクリップはそのまま機能します。
// 返り値: クリップ後の行区間 [start, end](inclusive)。窓と交差しない / 空窓のときは null。
export const clipRowRangeToWindow = (
  selStartRow: number,
  selEndRow: number,
  windowFirstRow: number,
  windowLastRow: number,
): { start: number; end: number } | null => {
  // 空窓(描画行ゼロ)では末尾 < 先頭。描画しません。
  if (windowLastRow < windowFirstRow) {
    return null;
  }
  const start = Math.max(selStartRow, windowFirstRow);
  const end = Math.min(selEndRow, windowLastRow);
  // 選択が窓の完全に上 / 下(画面外)なら交差なし。
  if (start > end) {
    return null;
  }
  return { start, end };
};

// 物理 scrollTop → 論理 scrollTop です(active cell 自動スクロールの現在位置換算に使用)。
export const physicalToLogicalScrollTop = (
  physical: number,
  scaleFactor: number,
): number => physical * scaleFactor;

// 論理 scrollTop → 物理 scrollTop です(算出した論理スクロール目標を実 scrollTop へ戻す)。
export const logicalToPhysicalScrollTop = (
  logical: number,
  scaleFactor: number,
): number => (scaleFactor === 1 ? logical : logical / scaleFactor);

// ヒットテスト: ボディ content-top 基準の物理 y(= 旧来の y。moving rect 経由で物理
//   スクロール量 S_phys を含む)→ 行 index。
//   論理 y = y - D(D = S_phys * (1 - scaleFactor))で求めます。scaleFactor=1 のとき D=0 で
//   従来式(floor(y / rowHeight))と一致します。
//   変更(auto-height シーム): 物理→論理の d 補正はスクロール依存なのでここに残し、論理 content-y の
//   行解決のみ RowMetrics.rowAtContentY へ委譲します(uniform では従来式と一致)。
export const clientYToRowIndex = (
  yRelativeToBodyTop: number,
  scrollTop: number,
  scaleFactor: number,
  rowMetrics: RowMetrics,
): number => {
  const d = scrollTop * (1 - scaleFactor);
  return rowMetrics.rowAtContentY(yRelativeToBodyTop - d);
};

export const computeVerticalGeometry = ({
  rowCount,
  rowHeight,
  headerHeight,
  viewportHeight,
  scrollTop,
  overscan,
  maxBodyPx,
}: ComputeVerticalGeometryArgs): VerticalGeometry => {
  const logicalBodyHeight = rowCount * rowHeight;
  const physicalBodyHeight = Math.min(logicalBodyHeight, maxBodyPx);

  // 物理 / 論理それぞれのスクロール可動域です。両端(先頭・末尾)を一致させるため、
  // 「全高」ではなく「可動域(total - viewport)」を基準に倍率を取ります
  // (全高基準だと末尾でオーバーシュートし、最終行が下端に届きません)。
  const logicalMax = Math.max(headerHeight + logicalBodyHeight - viewportHeight, 0);
  const physicalMax = Math.max(headerHeight + physicalBodyHeight - viewportHeight, 0);

  // 圧縮不要 / スクロール不能時は scaleFactor=1(= 現状と数値一致・transform なし)。
  const scaleFactor =
    physicalMax > 0 && logicalBodyHeight > physicalBodyHeight
      ? logicalMax / physicalMax
      : 1;

  // 物理 scrollTop を論理オフセットへ写像します。
  const clampedScrollTop = Math.min(Math.max(scrollTop, 0), physicalMax);
  const logicalScrollTop = clampedScrollTop * scaleFactor;

  // 窓出し(uniform: 純粋な算術)。論理オフセット基準で firstVisible を求めます。
  //   firstVisible = floor(S_log / rowHeight) は、行 index の表示 y =
  //   headerHeight + index*rowHeight - S_log がボディ可視域に入る先頭行です
  //   (ヘッダー下に一部潜る行を含むため floor)。overscan が上方向の被覆行も賄います。
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + 1;
  const firstVisible = Math.floor(logicalScrollTop / rowHeight);
  const start = Math.max(firstVisible - overscan, 0);
  const end = Math.min(firstVisible + visibleCount + overscan, rowCount);

  // 描画ウィンドウの基準オフセット(px)。no-op(scaleFactor=1)では 0 にして従来と完全一致を保ちます
  //   (この経路では絶対論理 top <= physicalBodyHeight <= MAX_BODY_PX < 16.7M なので相対化は不要)。
  //   scaling 時のみ、ウィンドウ先頭(start)の論理 top を WINDOW_BASE_CHUNK_PX 境界へスナップして
  //   基準にします。スナップにより通常スクロールでは値が動かず、行/オーバーレイの transform が
  //   小さく保たれ、巨大 transform によるペイント不良(末尾行が描画されない問題)を回避します。
  const windowBaseOffsetPx =
    scaleFactor === 1
      ? 0
      : Math.floor((start * rowHeight) / WINDOW_BASE_CHUNK_PX) *
        WINDOW_BASE_CHUNK_PX;

  // overlay+body wrapper の translateY。基準 D = S_phys - S_log(<= 0)に基準オフセットを畳み込みます。
  //   行は論理 top(headerHeight + index*rowHeight - windowBaseOffsetPx)へ置き、この translateY で
  //   物理ウィンドウへ引き込むことで、行 index の表示位置は基準オフセットの有無に関わらず
  //   論理スクロール S_log のときと完全一致します(画面 y = headerHeight + index*rowHeight - S_log)。
  //   no-op では D=0 かつ windowBaseOffsetPx=0 ⇒ translateY=0(従来と一致)。
  //   scaling では translateY <= physicalBodyHeight(<16.7M)に有界になります。
  const translateY = clampedScrollTop - logicalScrollTop + windowBaseOffsetPx;

  const rows: VerticalRow[] = [];
  const rowIndexSet = new Set<number>();
  for (let index = start; index < end; index += 1) {
    // start は「絶対論理 top - 基準オフセット」。no-op では従来どおり headerHeight + index*rowHeight。
    rows.push({
      index,
      start: headerHeight + index * rowHeight - windowBaseOffsetPx,
    });
    rowIndexSet.add(index);
  }

  return {
    physicalBodyHeight,
    logicalBodyHeight,
    scaleFactor,
    translateY,
    windowBaseOffsetPx,
    rows,
    rowIndexSet,
  };
};

export type ComputeAutoHeightVerticalGeometryArgs = {
  headerHeight: number;
  // スクロールコンテナの可視高さ(clientHeight)。窓の行数に効きます。
  viewportHeight: number;
  // 物理 scrollTop。auto-height では sf=1 なので論理 scrollTop と一致します。
  scrollTop: number;
  // 窓の上下に先回りで描画する行数(uniform 経路と同じ overscan=20 を渡す想定)。
  overscan: number;
};

// auto-height 行の縦ジオメトリ(prefix-sum 版 RowMetrics を窓出し)。
//   ★gate(論理全高 < MAX_BODY_PX / 行数 <= AUTO_HEIGHT_MAX_ROWS)前提なので、scaleFactor=1 /
//     windowBaseOffsetPx=0 / translateY=0 に固定されます。scaling・float32 対策・基準オフセットは
//     休眠し、行/オーバーレイは絶対論理 top(headerHeight + rowTop(i))にそのまま置けます。
//   窓出しは uniform の純算術(floor(y/rowHeight))の代わりに RowMetrics.rowAtContentY
//     (prefix 二分探索)で可視域 [scrollTop, scrollTop+viewport] を覆う行を求め、両側に overscan を
//     足します。estimate 一様・measured 空の RowMetrics を渡すと、共通 index の start は
//     computeVerticalGeometry(sf=1)と一致し、窓は同じ可視域を被覆します(末尾 overscan の行数は
//     行高可変の窓計算原理が異なるため厳密一致は保証しません)。
//   各 row には start に加え size(= rowsHeight(i,i))を載せ、GridBodyLayer が行ごとの高さに使います。
export const computeAutoHeightVerticalGeometry = (
  {
    headerHeight,
    viewportHeight,
    scrollTop,
    overscan,
  }: ComputeAutoHeightVerticalGeometryArgs,
  rowMetrics: RowMetrics,
): VerticalGeometry => {
  const rowCount = rowMetrics.rowCount;
  const logicalBodyHeight = rowMetrics.totalBodyHeight;
  // gate により論理全高 <= MAX_BODY_PX。圧縮は不要で物理 = 論理です。
  const physicalBodyHeight = logicalBodyHeight;

  // スクロール可動域(uniform と同式)。sf=1 なので物理 = 論理です。
  const logicalMax = Math.max(
    headerHeight + logicalBodyHeight - viewportHeight,
    0,
  );
  const clampedScrollTop = Math.min(Math.max(scrollTop, 0), logicalMax);

  // 窓出し: 可視域 [clampedScrollTop, clampedScrollTop + viewportHeight] を覆う行 + 両側 overscan。
  //   rowAtContentY は content-top 基準(headerHeight 抜き)の論理 y を取るため、可視域の上端/下端を
  //   そのまま渡します(no-op で uniform の floor(y/rowHeight) と一致)。
  const firstVisible = rowMetrics.rowAtContentY(clampedScrollTop);
  const lastVisible = rowMetrics.rowAtContentY(clampedScrollTop + viewportHeight);
  const start = Math.max(firstVisible - overscan, 0);
  const end = Math.min(lastVisible + overscan + 1, rowCount);

  const rows: VerticalRow[] = [];
  const rowIndexSet = new Set<number>();
  for (let index = start; index < end; index += 1) {
    rows.push({
      index,
      // sf=1 / windowBaseOffsetPx=0 なので絶対論理 top をそのまま置きます。
      start: headerHeight + rowMetrics.rowTop(index),
      size: rowMetrics.rowsHeight(index, index),
    });
    rowIndexSet.add(index);
  }

  return {
    physicalBodyHeight,
    logicalBodyHeight,
    scaleFactor: 1,
    translateY: 0,
    windowBaseOffsetPx: 0,
    rows,
    rowIndexSet,
  };
};