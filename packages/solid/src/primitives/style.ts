// core の一部(logic/gridHeight の resolveGridHeightLayout など)は React の書き方の style オブジェクト(camelCase の
//   プロパティ・単位の無い数値)を返します。Solid の style はケバブケースで、数値に px を足さないので写し替えます。
import type { JSX } from '@solidjs/web';

const UNITLESS = new Set(['opacity', 'z-index', 'flex', 'flex-grow', 'flex-shrink', 'line-height', 'order', 'font-weight']);

const toKebab = (key: string): string =>
  key.startsWith('--') ? key : key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

export const toSolidStyle = (
  style: Readonly<Record<string, unknown>> | null | undefined,
): JSX.CSSProperties | undefined => {
  if (!style) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || value === null || value === false) {
      continue;
    }
    const name = toKebab(key);
    result[name] = typeof value === 'number' && !UNITLESS.has(name) ? `${value}px` : String(value);
  }
  return result as JSX.CSSProperties;
};

export const px = (value: number): string => `${value}px`;