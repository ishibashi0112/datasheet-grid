import type { GridAggFuncName } from '../model/gridTypes';

// 追加(grouping ①): 行グルーピングの組み込み集計です。グループツリー構築(logic/grouping.ts)が
//   leaf を 1 行ずつ流し込みながら加算できるよう、「アキュムレータ生成 → 逐次加算 → 確定」の
//   3 段 API にしています(leaf 値の全量配列を各階層ノードへ持たせないため。カスタム集計関数は
//   全量が必要なので grouping.ts 側で別途 values / rows を収集します)。
//
//   数値の扱いはソート(logic/sorting.ts)と同じ「値駆動」です: filterType 等の宣言には依存せず、
//   Number() 変換で有限になる値だけを数値集計(sum / avg / min / max)の対象にします。
//   空値(null / undefined / '')は数値集計の対象外です(Number(null) / Number('') が 0 に
//   化けるのを防ぐため明示ガード)。count のみ「配下 leaf 行数」で、値の有無に依存しません。

// 組み込み集計名の一覧です(型ガード用)。
export const BUILTIN_AGG_FUNC_NAMES: readonly GridAggFuncName[] = [
  'sum',
  'min',
  'max',
  'avg',
  'count',
];

// GridColumn.aggFunc の文字列指定が組み込み集計名かを判定します(不正文字列は呼び出し側で
//   集計スキップに倒します)。
export const isBuiltinAggFuncName = (value: unknown): value is GridAggFuncName =>
  typeof value === 'string' &&
  (BUILTIN_AGG_FUNC_NAMES as readonly string[]).includes(value);

// 組み込み集計の中間状態です。min / max は番兵(±Infinity)で初期化し、numericCount === 0 の
//   確定時に undefined(= 表示は空セル)へ倒します。
export type BuiltinAggAccumulator = {
  // 配下 leaf 行数(値の有無に関係なく数えます)。count の確定値。
  count: number;
  // 数値集計の対象になった値の個数です(sum / avg / min / max の分母・有効判定)。
  numericCount: number;
  sum: number;
  min: number;
  max: number;
};

export const createBuiltinAggAccumulator = (): BuiltinAggAccumulator => ({
  count: 0,
  numericCount: 0,
  sum: 0,
  min: Infinity,
  max: -Infinity,
});

// leaf 1 行ぶんのセル値をアキュムレータへ加算します(グループツリー構築のホットパスから
//   祖先階層ぶん呼ばれるため、割り当てなしの in-place 更新です)。
export const accumulateBuiltinAgg = (
  accumulator: BuiltinAggAccumulator,
  value: unknown,
): void => {
  accumulator.count += 1;
  if (value == null || value === '') {
    return;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return;
  }
  accumulator.numericCount += 1;
  accumulator.sum += numeric;
  if (numeric < accumulator.min) {
    accumulator.min = numeric;
  }
  if (numeric > accumulator.max) {
    accumulator.max = numeric;
  }
};

// 集計値を確定します。数値対象が 1 件もないグループの sum / avg / min / max は undefined
//   (グループ行では空セル表示)です。0 を返さないのは「値なし」と「合計 0」を区別するためです。
export const finalizeBuiltinAgg = (
  name: GridAggFuncName,
  accumulator: BuiltinAggAccumulator,
): unknown => {
  switch (name) {
    case 'count':
      return accumulator.count;
    case 'sum':
      return accumulator.numericCount > 0 ? accumulator.sum : undefined;
    case 'avg':
      return accumulator.numericCount > 0
        ? accumulator.sum / accumulator.numericCount
        : undefined;
    case 'min':
      return accumulator.numericCount > 0 ? accumulator.min : undefined;
    case 'max':
      return accumulator.numericCount > 0 ? accumulator.max : undefined;
  }
};