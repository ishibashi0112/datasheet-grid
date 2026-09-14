// serverSide(SSRM)のブロック算出ロジックです(React 非依存・純関数)。
//
// 役割と不変条件(SSRM の急所):
//   SSRM がメモリ有界である根拠は「1 リクエストの取得範囲を常に画面 + overscan ぶん
//   (= 定数サイズ)に縛る」ことです。総件数(1M / 10M …)に比例した範囲は決して要求しません。
//   本モジュールは可視レンジ [startIndex, endIndex)(end 排他)を blockSize 刻みのブロック index
//   集合へ写すだけの純写像で、この「定数サイズ」をコードレベルで保証する起点です。呼び出し側
//   (可視窓 + overscan=20)が定数サイズのレンジを渡す限り、戻り値のブロック数も定数に収まります。
//
//   view 空間: viewIndex は表示上の行 index(0 始まり)。ブロック b は
//   [b*blockSize, (b+1)*blockSize) の viewIndex 範囲を担当します(末端ブロックは部分長)。

// viewIndex が属するブロック index を返します。
export function blockIndexForRow(viewIndex: number, blockSize: number): number {
  return Math.floor(viewIndex / blockSize);
}

// 可視レンジ [startIndex, endIndex)(end 排他)に交差するブロック index を昇順で返します。
//   - rowCount で右端をクランプします(末端ブロックの取りすぎ防止)。
//   - startIndex が 0 未満なら 0 へクランプします。
//   - レンジ空 / rowCount<=0 / blockSize<=0 は [] を返します。
export function computeBlockIndexes(
  startIndex: number,
  endIndex: number,
  blockSize: number,
  rowCount: number,
): number[] {
  if (blockSize <= 0 || rowCount <= 0) {
    return [];
  }
  // view 空間で [0, rowCount) にクランプします(end は排他)。
  const start = Math.max(0, Math.floor(startIndex));
  const end = Math.min(rowCount, Math.floor(endIndex));
  if (end <= start) {
    return [];
  }
  // end は排他なので、最後に含む行は end-1。そこから所属ブロックを求めます。
  const firstBlock = blockIndexForRow(start, blockSize);
  const lastBlock = blockIndexForRow(end - 1, blockSize);
  const result: number[] = [];
  for (let block = firstBlock; block <= lastBlock; block += 1) {
    result.push(block);
  }
  return result;
}