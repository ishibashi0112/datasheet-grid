// 追加(1.5.0 の後 / 2026-11-23): ブラウザごとの描画の上限です(React 非依存)。
//   Firefox は sticky の要素を約 8,947,848px より先へ追わないので、縮めたスクロール(scroll-space 仮想化)の物理ボディ高さの
//   上限を下げます(logic/verticalGeometry の FIREFOX_MAX_BODY_PX)。Firefox の判定は UA の `Firefox/`(Gecko の派生の
//   ブラウザも含む。iOS の Firefox は WebKit なので含まない)。サーバー(navigator が無い)では MAX_BODY_PX。
import { FIREFOX_MAX_BODY_PX, MAX_BODY_PX } from '../logic/verticalGeometry';

export const isFirefoxUserAgent = (userAgent: string): boolean => /\bFirefox\/\d/.test(userAgent);

export const resolveBrowserMaxBodyPx = (): number =>
  typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' && isFirefoxUserAgent(navigator.userAgent)
    ? FIREFOX_MAX_BODY_PX
    : MAX_BODY_PX;