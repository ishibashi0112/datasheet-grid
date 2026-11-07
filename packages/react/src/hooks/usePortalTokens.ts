// 追加(DevBI の報告 2026-11-07): document.body の直下に出すポップアップへ、表で決まった CSS トークン(--ssg-*)を写します
//   (中身は core utils/portalTokens の watchPortalTokens)。表の要素はシェルが PortalTokenSourceContext で渡します。
//   ポップアップが出たとき(active が true になったとき)とテーマ / モーションの修飾子が変わったときに写し、開いている間は
//   <html> / <body> の属性・表の root の class / style・OS の配色の変化でも写し直します。
import { createContext, useContext, type RefObject } from 'react';
import { watchPortalTokens } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/portalTokens';

import { useIsomorphicLayoutEffect } from './useController';

export const PortalTokenSourceContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function usePortalTokens(
  portalRef: RefObject<HTMLElement | null>,
  active: boolean,
  modifierClassName: string | undefined,
): void {
  const sourceRef = useContext(PortalTokenSourceContext);
  useIsomorphicLayoutEffect(() => {
    const portal = portalRef.current;
    if (!active || !portal) {
      return undefined;
    }
    return watchPortalTokens(() => sourceRef?.current, portal);
  }, [active, modifierClassName, sourceRef, portalRef]);
}