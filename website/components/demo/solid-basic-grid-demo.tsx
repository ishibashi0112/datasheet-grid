'use client';

// Solid のクイックスタートのデモ。Solid 版のグリッドを、この要素の中に Solid で描く(./solid/basic-grid.ts)。
// サーバーでは描かず、ブラウザで Solid の部品を読み込んでから描く(読み込むまでは同じ高さの枠だけ)。
import { useEffect, useRef, useState } from 'react';

export function SolidBasicGridDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    import('./solid/basic-grid')
      .then(({ mountSolidBasicGrid }) => {
        if (!cancelled) dispose = mountSolidBasicGrid(element);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  if (failed) {
    return <p className="text-sm text-fd-muted-foreground">Solid 版のデモを読み込めませんでした。</p>;
  }
  // React はこの要素の中身に触れない(Solid が描く)
  return <div ref={ref} className="min-h-[280px]" data-framework="solid" />;
}