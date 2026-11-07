// 追加(DevBI の報告 2026-11-07): document.body の直下に出すポップアップへ、表で決まった CSS トークン(--ssg-*)を写します
//   (中身は core utils/portalTokens の syncPortalTokens)。表の要素はシェルが PortalTokenSourceContext で渡します。
//   ポップアップが出たとき(active が true になったとき)とテーマ / モーションの修飾子が変わったときに写し直します。
//   開いたまま利用側の CSS を変えたときは、次に開いたときに合います。
import { createContext, useContext, type RefObject } from 'react';
import { syncPortalTokens } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/portalTokens';

import { useIsomorphicLayoutEffect } from './useController';

export const PortalTokenSourceContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function usePortalTokens(
  portalRef: RefObject<HTMLElement | null>,
  active: boolean,
  modifierClassName: string | undefined,
): void {
  const sourceRef = useContext(PortalTokenSourceContext);
  useIsomorphicLayoutEffect(() => {
    if (active) {
      syncPortalTokens(sourceRef?.current, portalRef.current);
    }
  }, [active, modifierClassName, sourceRef, portalRef]);
}