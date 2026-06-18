// dev 計測(DS-4 ①-(3b) 着手判断用・本番非搭載): autosize の collect 相のコストを
//   「値抽出 / estimate+TOP_K / encode」へ ablation(差分)分解する計測ハーネスです。
//   shipping の logic/columnAutosize.ts は無改修のまま、ここから実 collect を呼び出します。
//
// 計測方針(per-cell タイマーを使わない理由):
//   collect は 30万行×29列のタイトループで、内部に performance.now() を挿すと計測器自体が
//   支配項になり、測りたい値が歪みます。そこで「全行をモード違いで複数回フル走査し、各走査を
//   開始/終了の performance.now() 1 組だけで測る」差分方式にします。各モードは前モードの
//   上位互換(superset)で、差を取ると 1 層ぶんのコストが出ます。
//
//   - Mode A(full)   : 実 createColumnWidthAccumulator().collect。①-(3a) 込みの現在の
//                       collect 総コスト(= autosize 実行時のメイン busy 総量の代理)。
//                       finalize(measureText)は collect 相ではないため含めません。
//   - Mode B(extract): 値抽出のみ。String(getCellValue(row, col) ?? "") + 空判定。
//                       worker 化しても getValue クロージャ / 文字列 materialize はメインに
//                       残るため、これが「メインから外せない不可避コスト」の下限です。
//   - Mode C(encode) : 値抽出 + columnar UTF-16 encode(各 code unit を Uint16Array へ複写 +
//                       Int32Array offset 表)。①-(3b) worker 経路が「メインに追加で」払う
//                       コストの代理です。
//
// 判定の読み方:
//   - offload 可能量 ≈ A − B(estimate 残 + TOP_K 入替。worker へ寄せられる相)。
//   - worker 経路のメインコスト ≈ C(抽出 + encode)+ TOP_K materialize(極小)+ transfer。
//   - worker 計算は別スレッド並列のため、メイン時間の比較は概ね C vs A:
//       C ≧ A          → worker でメイン時間は減らない(encode が offload 分を相殺)→ 見送り。
//       A − B が小       → そもそも offload 対象が小さい(抽出支配)→ 見送り。
//       C < A かつ A−B 大 → メイン削減余地あり → ①-(3b) 実測続行候補。
//   注記: transfer/postMessage コストは本ハーネス対象外です(通常 encode より小さいですが、
//         続行判定後に Worker 試作で別途実測します)。
//
// Mode C のメモリ方針:
//   encode の正味コストは「code unit 単位の charCodeAt + typed array 書き込み」の線形和で、
//   バッファを列ごとに保持するか否かで時間は実質変わりません。本ハーネスは 174MB 級の
//   transferable を保持せず、行ごとに書き込みカーソルを 0 へ戻す再利用バッファへ複写します
//   (複写回数・offset 書き込み回数は実経路と同オーダー。保持しないだけ)。これで複写スループット
//   を軽量に測れます。DCE 抑止のためチェックサムを集計します。

import { createColumnWidthAccumulator } from "./columnAutosize";
import type { GridColumn } from "../model/gridTypes";
import { getCellValue } from "../utils/permissions";

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const round2 = (x: number): number => Math.round(x * 100) / 100;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const minOf = (xs: number[]): number =>
  xs.reduce((a, b) => (b < a ? b : a), Number.POSITIVE_INFINITY);

// 1 回フル走査の結果。checksum は dead-code elimination 抑止用です。
type PassResult = { ms: number; checksum: number };

// Mode A: 実 collect(①-(3a) 込み)。finalize は呼ばず collect 相のみ測ります。
const runModeA = <T,>(
  columns: GridColumn<T>[],
  getRow: (viewIndex: number) => T,
  viewRowCount: number,
): PassResult => {
  const accumulator = createColumnWidthAccumulator(columns);
  const start = now();
  for (let i = 0; i < viewRowCount; i += 1) {
    const row = getRow(i);
    if (row) {
      accumulator.collect(row);
    }
  }
  const ms = now() - start;
  // collect は accumulator 内部配列を変異させるため DCE されません。checksum は形式的な値です。
  return { ms, checksum: viewRowCount };
};

// Mode B: 値抽出のみ(String(getCellValue ?? "") + 空判定)。
const runModeB = <T,>(
  columns: GridColumn<T>[],
  getRow: (viewIndex: number) => T,
  viewRowCount: number,
): PassResult => {
  const colCount = columns.length;
  let checksum = 0;
  const start = now();
  for (let i = 0; i < viewRowCount; i += 1) {
    const row = getRow(i);
    if (!row) {
      continue;
    }
    for (let ci = 0; ci < colCount; ci += 1) {
      const text = String(getCellValue(row, columns[ci]) ?? "");
      if (text === "") {
        continue;
      }
      checksum += text.length;
    }
  }
  const ms = now() - start;
  return { ms, checksum };
};

// Mode C: 値抽出 + columnar UTF-16 encode(code unit 複写 + offset 書き込み)。
//   行ごとに書き込みカーソル w を 0 へ戻して再利用バッファへ複写します(保持しない)。
const runModeC = <T,>(
  columns: GridColumn<T>[],
  getRow: (viewIndex: number) => T,
  viewRowCount: number,
): PassResult => {
  const colCount = columns.length;
  let unitBuf = new Uint16Array(1024);
  const offsetBuf = new Int32Array(colCount + 1);
  let checksum = 0;
  const start = now();
  for (let i = 0; i < viewRowCount; i += 1) {
    const row = getRow(i);
    if (!row) {
      continue;
    }
    let w = 0; // 行内 code unit 書き込みカーソル(行ごとにリセット)。
    for (let ci = 0; ci < colCount; ci += 1) {
      offsetBuf[ci] = w;
      const text = String(getCellValue(row, columns[ci]) ?? "");
      const len = text.length;
      if (len === 0) {
        continue;
      }
      if (w + len > unitBuf.length) {
        let cap = unitBuf.length * 2;
        while (cap < w + len) {
          cap *= 2;
        }
        const next = new Uint16Array(cap);
        next.set(unitBuf);
        unitBuf = next;
      }
      for (let k = 0; k < len; k += 1) {
        unitBuf[w] = text.charCodeAt(k);
        w += 1;
      }
    }
    offsetBuf[colCount] = w;
    checksum += w + offsetBuf[0];
  }
  const ms = now() - start;
  return { ms, checksum };
};

const verdict = (cVsA: number, offloadablePct: number): string => {
  if (cVsA >= 1) {
    return "見送り推奨: C ≧ A。encode が offload 分を相殺し、worker でメイン時間は減りません。";
  }
  if (offloadablePct < 0.3) {
    return "見送り推奨: A-B が小さく抽出支配。worker の正味利得が薄いです。";
  }
  return "続行候補: C < A かつ offload 大。①-(3b) の worker 試作でメイン削減余地があります。";
};

export type AutosizeCollectBenchParams<T> = {
  columns: GridColumn<T>[];
  getRow: (viewIndex: number) => T;
  viewRowCount: number;
  // 各モードの反復回数(median / min 用)。既定 5。
  repeats?: number;
};

// collect 相の ablation 計測を実行し、結果を console へ出力します(戻り値なし)。
//   ?stress&bench のページで DevTools console から window.__autosizeCollectBench() を実行します。
export function runAutosizeCollectBench<T>({
  columns,
  getRow,
  viewRowCount,
  repeats = 5,
}: AutosizeCollectBenchParams<T>): void {
  if (columns.length === 0 || viewRowCount === 0) {
    console.warn("[autosize-bench] 列 0 または行 0 のため計測をスキップしました。");
    return;
  }

  const modes: {
    key: "A_full" | "B_extract" | "C_encode";
    label: string;
    run: () => PassResult;
  }[] = [
    {
      key: "A_full",
      label: "A 実collect(3a込)",
      run: () => runModeA(columns, getRow, viewRowCount),
    },
    {
      key: "B_extract",
      label: "B 値抽出のみ",
      run: () => runModeB(columns, getRow, viewRowCount),
    },
    {
      key: "C_encode",
      label: "C 抽出+UTF16encode",
      run: () => runModeC(columns, getRow, viewRowCount),
    },
  ];

  let sink = 0;
  const samples: Record<string, number[]> = {};

  // warmup(JIT 暖機。計測対象外)。各モード 1 回。
  for (let mi = 0; mi < modes.length; mi += 1) {
    sink += modes[mi].run().checksum;
  }

  // 本計測。
  for (let mi = 0; mi < modes.length; mi += 1) {
    const xs: number[] = [];
    for (let r = 0; r < repeats; r += 1) {
      const res = modes[mi].run();
      xs.push(res.ms);
      sink += res.checksum;
    }
    samples[modes[mi].key] = xs;
  }

  const aMin = minOf(samples.A_full);
  const bMin = minOf(samples.B_extract);
  const cMin = minOf(samples.C_encode);
  const offloadable = aMin - bMin; // estimate 残 + TOP_K
  const encodeCost = cMin - bMin; // encode 追加分
  const offloadablePct = aMin > 0 ? offloadable / aMin : 0;
  const cVsA = aMin > 0 ? cMin / aMin : 0;

  const table = modes.map((m) => ({
    mode: m.label,
    "median(ms)": round2(median(samples[m.key])),
    "min(ms)": round2(minOf(samples[m.key])),
  }));
  console.table(table);
  console.log(
    [
      "[autosize-bench] rows=" +
        viewRowCount +
        " cols=" +
        columns.length +
        " repeats=" +
        repeats,
      "  A(full)=" +
        round2(aMin) +
        "ms  B(extract)=" +
        round2(bMin) +
        "ms  C(encode)=" +
        round2(cMin) +
        "ms  (各 min)",
      "  offload可能量 A-B = " +
        round2(offloadable) +
        "ms (" +
        (offloadablePct * 100).toFixed(1) +
        "% of A)  [estimate残+TOP_K]",
      "  encode 追加分 C-B = " +
        round2(encodeCost) +
        "ms   worker経路メインコスト C/A = " +
        (cVsA * 100).toFixed(1) +
        "%",
      "  → " + verdict(cVsA, offloadablePct),
    ].join("\n"),
  );

  // DCE 抑止: sink を到達可能な形で参照します(実際には出力されません)。
  if (sink === Number.NEGATIVE_INFINITY) {
    console.log("unreachable", sink);
  }
}