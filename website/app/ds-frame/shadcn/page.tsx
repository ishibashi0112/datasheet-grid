// デザインシステムのデモ(guides/design-systems)の iframe の中身。デザインシステムの CSS をこのページだけに閉じ込める。
import type { Metadata } from 'next';
import { ShadcnFrame } from '@/components/demo/design-systems/shadcn-frame';

export const metadata: Metadata = { title: 'shadcn/ui の中に置いたグリッド', robots: { index: false, follow: false } };

export default function Page() {
  return <ShadcnFrame />;
}