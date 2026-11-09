// 型のテストの道具です(依存を増やさないため自前)。どれも実行はしません(tsc で型だけを見る)。
// A と B が同じ型のときだけ true(any / unknown / never も区別する)。
export type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
// 型引数が true でなければ型エラー。
export const assertType = <T extends true>(): T | undefined => undefined;
// 値が T に代入できなければ型エラー。
export const expectAssignable = <T>(value: T): T => value;