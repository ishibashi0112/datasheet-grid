// ポップアップ(select エディタの候補の一覧など)へ渡す文脈。React 版の hooks/usePortalTokens.ts の PortalTokenSourceContext
//   (表の要素 = トークンを写す元)と PopupContainerContext(描く場所を決める関数)にあたります。
import { createContext, useContext } from 'solid-js';

export type GridPortalContextValue = {
  // 表で決まった CSS トークン(--ssg-*)を写す元の要素(シェル)。
  source: () => HTMLElement | null;
  // ポップアップを描く場所(既定はグリッドを囲むダイアログの中、無ければ body。core utils/popupContainer)。開いている間だけ呼ぶ。
  container: () => HTMLElement | null;
};

export const GridPortalContext = createContext<GridPortalContextValue>({
  source: () => null,
  container: () => (typeof document === 'undefined' ? null : document.body),
});

export const useGridPortal = (): GridPortalContextValue => useContext(GridPortalContext);
