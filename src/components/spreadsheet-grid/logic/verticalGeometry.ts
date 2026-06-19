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

// 描画する 1 行の窓エントリです(旧 @tanstack/react-virtual の VirtualItem 互換)。
export type VerticalRow = {
  index: number;
  // 行の論理 top(headerHeight 込み)。GridBodyLayer の translateY 基準(virtualRow.start 互換)。
  start: number;
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
  // overlay+body wrapper に掛ける translateY(<= 0)。scaleFactor=1 のとき 0(現状と一致)。
  translateY: number;
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
export const clientYToRowIndex = (
  yRelativeToBodyTop: number,
  scrollTop: number,
  scaleFactor: number,
  rowHeight: number,
  rowCount: number,
): number => {
  const d = scrollTop * (1 - scaleFactor);
  const row = Math.floor((yRelativeToBodyTop - d) / rowHeight);
  return Math.min(Math.max(row, 0), Math.max(rowCount - 1, 0));
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

  // overlay+body wrapper の translateY。D = S_phys - S_log(<= 0)。
  //   行は論理 top(headerHeight + index*rowHeight)へ置き、この D で物理ウィンドウへ
  //   引き込むことで、行 index の表示位置は論理スクロール S_log のときと完全一致します。
  const translateY = clampedScrollTop - logicalScrollTop;

  // 窓出し(uniform: 純粋な算術)。論理オフセット基準で firstVisible を求めます。
  //   firstVisible = floor(S_log / rowHeight) は、行 index の表示 y =
  //   headerHeight + index*rowHeight - S_log がボディ可視域に入る先頭行です
  //   (ヘッダー下に一部潜る行を含むため floor)。overscan が上方向の被覆行も賄います。
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + 1;
  const firstVisible = Math.floor(logicalScrollTop / rowHeight);
  const start = Math.max(firstVisible - overscan, 0);
  const end = Math.min(firstVisible + visibleCount + overscan, rowCount);

  const rows: VerticalRow[] = [];
  const rowIndexSet = new Set<number>();
  for (let index = start; index < end; index += 1) {
    rows.push({ index, start: headerHeight + index * rowHeight });
    rowIndexSet.add(index);
  }

  return {
    physicalBodyHeight,
    logicalBodyHeight,
    scaleFactor,
    translateY,
    rows,
    rowIndexSet,
  };
};