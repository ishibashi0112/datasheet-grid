// 追加(UI CSS移行): className 合成ヘルパーです。falsy(undefined / false / null / '')を除外して
//   空白区切りで結合します。clsx の最小版で、基底クラス + 状態クラス + 利用側スロット className
//   を合成する用途に使います。外部依存は増やしません。
export function cx(
  ...classNames: Array<string | false | null | undefined>
): string {
  return classNames.filter(Boolean).join(' ');
}