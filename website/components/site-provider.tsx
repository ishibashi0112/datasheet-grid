'use client';

// サイト全体のプロバイダ(fumadocs の RootProvider)。デザインシステムのデモの iframe の中身(/ds-frame/*)では
// ドキュメントの検索を切る(iframe の中で Ctrl+K を押すと、枠の中に二つ目の検索ダイアログが開くため)。
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RootProvider } from 'fumadocs-ui/provider/next';

export function SiteProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const inFrame = pathname.startsWith('/ds-frame/');
  return <RootProvider search={{ enabled: !inFrame }}>{children}</RootProvider>;
}