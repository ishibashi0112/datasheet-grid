// 追加(slot-props): 命令的に生成する DOM 要素(ツールチップ / ドラッグゴースト)へ解決済みスロット
//   (className / style)を反映するヘルパーです。React の style prop と違い数値へ単位は付けません
//   (px が必要な値は文字列で渡す規約。GridSlotProps のコメント参照)。前回適用分を記録して返し、
//   次回はそれを外してから当て直します(ツールチップは body 直下のシングルトンのため)。
export type AppliedSlot = { classNames: string[]; styleKeys: string[] };

const toKebabCase = (key: string): string =>
  key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export function applySlotToElement(
  el: HTMLElement,
  slot: { className?: string; style?: object } | undefined,
  previous?: AppliedSlot,
): AppliedSlot {
  if (previous) {
    for (const name of previous.classNames) {
      el.classList.remove(name);
    }
    for (const key of previous.styleKeys) {
      el.style.removeProperty(key);
    }
  }
  const classNames = slot?.className
    ? slot.className.split(/\s+/).filter(Boolean)
    : [];
  if (classNames.length > 0) {
    el.classList.add(...classNames);
  }
  const styleKeys: string[] = [];
  if (slot?.style) {
    for (const [key, value] of Object.entries(slot.style)) {
      if (value === undefined || value === null) {
        continue;
      }
      const property = key.startsWith('--') ? key : toKebabCase(key);
      el.style.setProperty(property, String(value));
      styleKeys.push(property);
    }
  }
  return { classNames, styleKeys };
}