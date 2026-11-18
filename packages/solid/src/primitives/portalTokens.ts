// body の直下(や囲むダイアログの中)に描くポップアップへ、表で決まった CSS トークン(--ssg-*)を写し、描く場所の祖先に transform が
//   あるときの fixed の基準のずれを打ち消します(core utils/portalTokens / utils/popupContainer)。React 版の hooks/usePortalTokens.ts
//   の usePortalTokens にあたります。ポップアップが出たとき(portal が入ったとき)とテーマ / モーションの修飾子が変わったときに写し、
//   開いている間は <html> / <body> の属性・表の root の class / style・OS の配色の変化でも写し直します。打ち消しは位置(layout)が
//   変わるたびに測り直します。どちらも描画の effect(createRenderEffect)の後に動く createEffect で測ります(ポップアップの中身は
//   後から作られるので、その class の描き直しより先に測ると、開いたままテーマを変えたときに古いテーマのまま写していた。
//   React 版はコミット後のレイアウト effect)。
import { createEffect } from 'solid-js';
import { watchPortalTokens } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/portalTokens';
import { syncPopupOrigin } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/popupContainer';
import { useGridPortal } from '../context/portal';

export function createPortalTokens(
  portal: () => HTMLElement | undefined,
  modifierClassName: () => string | undefined,
  layout: () => unknown,
): void {
  const { source } = useGridPortal();
  createEffect(
    () => [portal(), modifierClassName()] as const,
    ([element]) => (element ? watchPortalTokens(source, element) : undefined),
  );
  createEffect(
    () => [portal(), layout()] as const,
    ([element]) => {
      if (element) {
        syncPopupOrigin(element);
      }
    },
  );
}
