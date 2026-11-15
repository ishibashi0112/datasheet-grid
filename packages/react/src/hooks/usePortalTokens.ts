// 追加(DevBI の報告 2026-11-07): document.body の直下に出すポップアップへ、表で決まった CSS トークン(--ssg-*)を写します
//   (中身は core utils/portalTokens の watchPortalTokens)。表の要素はシェルが PortalTokenSourceContext で渡します。
//   ポップアップが出たとき(active が true になったとき)とテーマ / モーションの修飾子が変わったときに写し、開いている間は
//   <html> / <body> の属性・表の root の class / style・OS の配色の変化でも写し直します。
import { createContext, useContext, type RefObject } from 'react';
import { watchPortalTokens } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/portalTokens';
import { syncPopupOrigin } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/popupContainer';

import { useIsomorphicLayoutEffect } from './useController';

export const PortalTokenSourceContext = createContext<RefObject<HTMLElement | null> | null>(null);

// 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-07): ポップアップを描く場所(core utils/popupContainer)。シェルが
//   `popupContainer` から決める関数を渡します。ポップアップは開いている間の描画ごとに呼び、createPortal の先にします
//   (ダイアログを後から開いた(`showModal()`)ときも開いた時点の場所になる)。閉じている間は呼ばず null。
export const PopupContainerContext = createContext<(() => HTMLElement | null) | null>(null);

export function usePopupContainer(active: boolean): HTMLElement | null {
  const getContainer = useContext(PopupContainerContext);
  if (!active || typeof document === 'undefined') {
    return null;
  }
  return getContainer?.() ?? document.body;
}

// options.origin: false で位置のずれの打ち消しをしません(ポップアップの中に absolute で置く小メニューなど、描く場所の
//   直下に無い要素。打ち消すとパネル自身の打ち消しと二重になり、パネルの画面の位置ぶん飛んでいた)。
// options.layout: ポップアップの位置(controller が測り直した値)。変わるたびに打ち消しを測り直します(ウィンドウの大きさや
//   ダイアログの中のスクロールでダイアログが動くと、開いたときの値のままではずれていた)。
export function usePortalTokens(
  portalRef: RefObject<HTMLElement | null>,
  active: boolean,
  modifierClassName: string | undefined,
  options?: { origin?: boolean | undefined; layout?: unknown },
): void {
  const sourceRef = useContext(PortalTokenSourceContext);
  const syncOrigin = options?.origin !== false;
  const layout = options?.layout;
  useIsomorphicLayoutEffect(() => {
    const portal = portalRef.current;
    if (!active || !portal) {
      return undefined;
    }
    return watchPortalTokens(() => sourceRef?.current, portal);
  }, [active, modifierClassName, sourceRef, portalRef]);
  // 追加(1.1.0 / AP-07): 描く場所の祖先に transform があるときの fixed の基準のずれを打ち消します(開いたときと位置が
  //   変わるたび)。
  useIsomorphicLayoutEffect(() => {
    const portal = portalRef.current;
    if (active && portal && syncOrigin) {
      syncPopupOrigin(portal);
    }
  }, [active, syncOrigin, layout, portalRef]);
}