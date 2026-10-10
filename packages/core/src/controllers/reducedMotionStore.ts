// 追加(motion-0): OS / ブラウザの「視差効果を減らす」設定(prefers-reduced-motion: reduce)を購読する外部 store です
//   (React 非依存。systemColorSchemeStore と同型)。subscribe / getSnapshot / getServerSnapshot の 3 つで、
//   React は useSyncExternalStore にそのまま渡し、Solid は subscribe から signal を作ります。
//   - jsdom / 非対応環境では matchMedia ガードにより常に「低減なし(false)」扱いです。
//   - SSR では判定できないため getServerSnapshot は false 固定です(ハイドレーション後にクライアント側で再解決)。
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const hasMatchMedia = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function';

export const reducedMotionStore = {
  subscribe(onChange: () => void): () => void {
    if (!hasMatchMedia()) {
      return () => {};
    }
    const mediaQueryList = window.matchMedia(REDUCED_MOTION_QUERY);
    mediaQueryList.addEventListener('change', onChange);
    return () => {
      mediaQueryList.removeEventListener('change', onChange);
    };
  },
  // 現在「視差効果を減らす」が有効か(購読の有無に依らず同期で読める)。
  getSnapshot(): boolean {
    if (!hasMatchMedia()) {
      return false;
    }
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  },
  getServerSnapshot(): boolean {
    return false;
  },
};
