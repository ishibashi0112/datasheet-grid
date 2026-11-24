// 追加(1.5.0 の後): ブラウザごとの描画の上限(Firefox だけ縮めたスクロールの上限を下げる)。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFirefoxUserAgent, resolveBrowserMaxBodyPx } from './browserLimits';
import { FIREFOX_MAX_BODY_PX, MAX_BODY_PX } from '../logic/verticalGeometry';

const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:161.0) Gecko/20100101 Firefox/161.0';
const CHROME =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36';
const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15';
// iOS の Firefox は WebKit(sticky の上限は Safari と同じ)。
const FIREFOX_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/161.0 Mobile/15E148 Safari/605.1.15';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isFirefoxUserAgent', () => {
  it('Gecko の Firefox だけ true', () => {
    expect(isFirefoxUserAgent(FIREFOX)).toBe(true);
    expect(isFirefoxUserAgent(CHROME)).toBe(false);
    expect(isFirefoxUserAgent(SAFARI)).toBe(false);
    expect(isFirefoxUserAgent(FIREFOX_IOS)).toBe(false);
    expect(isFirefoxUserAgent('')).toBe(false);
  });
});

describe('resolveBrowserMaxBodyPx', () => {
  it('Firefox は FIREFOX_MAX_BODY_PX、ほかは MAX_BODY_PX', () => {
    vi.stubGlobal('navigator', { userAgent: FIREFOX });
    expect(resolveBrowserMaxBodyPx()).toBe(FIREFOX_MAX_BODY_PX);
    vi.stubGlobal('navigator', { userAgent: CHROME });
    expect(resolveBrowserMaxBodyPx()).toBe(MAX_BODY_PX);
  });

  it('navigator の無い所(サーバー)では MAX_BODY_PX', () => {
    vi.stubGlobal('navigator', undefined);
    expect(resolveBrowserMaxBodyPx()).toBe(MAX_BODY_PX);
  });

  it('Firefox の上限は sticky を追える約 8,947,848px より小さい', () => {
    expect(FIREFOX_MAX_BODY_PX).toBeLessThan(2 ** 29 / 60);
    expect(FIREFOX_MAX_BODY_PX).toBeLessThan(MAX_BODY_PX);
  });
});