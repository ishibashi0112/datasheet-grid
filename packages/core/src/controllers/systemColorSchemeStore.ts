// 追加(非依存化 ③-2): OS / ブラウザの配色設定(prefers-color-scheme: dark)を購読する外部 store です
//   (React 非依存。旧 hooks/useResolvedGridTheme から分離)。subscribe / getSnapshot / getServerSnapshot の
//   3 つで、React は useSyncExternalStore にそのまま渡し、Solid は subscribe から signal を作ります。
//   - jsdom / 非対応環境では matchMedia ガードにより常に light(false)扱いです。
//   - SSR では配色設定を判定できないため getServerSnapshot は light(false)固定です(ハイドレーション後に
//     クライアント側で再解決)。
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

const hasMatchMedia = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function';

export const systemColorSchemeStore = {
  subscribe(onChange: () => void): () => void {
    if (!hasMatchMedia()) {
      return () => {};
    }
    const mediaQueryList = window.matchMedia(DARK_SCHEME_QUERY);
    mediaQueryList.addEventListener('change', onChange);
    return () => {
      mediaQueryList.removeEventListener('change', onChange);
    };
  },
  // 現在 dark 配色か(購読の有無に依らず同期で読める)。
  getSnapshot(): boolean {
    if (!hasMatchMedia()) {
      return false;
    }
    return window.matchMedia(DARK_SCHEME_QUERY).matches;
  },
  getServerSnapshot(): boolean {
    return false;
  },
};