// 型のテストの道具です(type-tests/src/expect.ts と同じ。Solid 版の検査は type-tests/solid だけを見るので複製しています)。
export type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
export const assertType = <T extends true>(): T | undefined => undefined;
export const expectAssignable = <T>(value: T): T => value;