// 追加(本体分解 E-0): フレームワーク非依存のメモ化ヘルパーです。React の useMemo と同じ「依存値を
//   Object.is で比較し、すべて同一なら前回値を返す」意味論を、エンジン(engine/)の派生値計算に提供します。
//   - createMemo(compute) はインスタンスを 1 つ作り、compute の引数がそのまま依存値になります
//     (`const visible = memoVisible(effectiveColumns)` のように毎 update で呼ぶ)。
//   - エンジンはインスタンスごとに memo を生成するため、グリッド複数マウントでも共有されません。
//   - Solid 版では同じ compute を createMemo(Solid)へ載せ替えられます。
export type MemoFn<Args extends readonly unknown[], R> = (...args: Args) => R;

const sameArgs = (a: readonly unknown[], b: readonly unknown[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) {
      return false;
    }
  }
  return true;
};

export const createMemo = <Args extends readonly unknown[], R>(
  compute: (...args: Args) => R,
): MemoFn<Args, R> => {
  let last: { args: Args; value: R } | null = null;
  return (...args: Args): R => {
    if (last !== null && sameArgs(last.args, args)) {
      return last.value;
    }
    const value = compute(...args);
    last = { args, value };
    return value;
  };
};