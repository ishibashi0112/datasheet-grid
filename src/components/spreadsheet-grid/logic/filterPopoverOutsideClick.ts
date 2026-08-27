// 追加(date-input): 列フィルター popover の「外側クリックで閉じる」対象判定(純ロジック)です。
//   従来は popover 要素の contains だけでしたが、日付入力スロット(renderFilterDateInput)で
//   注入された外部ピッカーのカレンダーは body 直下ポータルに出るため、popover の外と誤判定
//   されて閉じてしまいます。ポップアップ要素(またはその祖先)に本属性を付与することで
//   「内側扱い」にオプトアウトできます(withinPortal 無効化で popover 内へ描画する方法でも可)。

// 利用側がポータル UI へ付与する属性名です(値は不要。存在だけを見ます)。
export const FILTER_POPOVER_KEEP_OPEN_ATTRIBUTE = 'data-ssg-filter-keep-open';

// pointerdown 対象が「popover の外側」かを判定します(true = 閉じてよい)。
//   - popover 要素の内側 → false
//   - keep-open 属性を持つ要素の内側 → false(外部ピッカーのカレンダー等)
//   - テキストノードは親要素基準で closest を引きます。
export const isFilterPopoverOutsideTarget = (
  target: Node | null,
  popoverElement: Element | null,
): boolean => {
  if (!target) {
    return false;
  }
  if (popoverElement?.contains(target)) {
    return false;
  }
  const element =
    target instanceof Element ? target : target.parentElement;
  if (element?.closest(`[${FILTER_POPOVER_KEEP_OPEN_ATTRIBUTE}]`)) {
    return false;
  }
  return true;
};
