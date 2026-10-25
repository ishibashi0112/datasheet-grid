// デザインシステムのデモ(guides/design-systems)の iframe の中身。デザインシステムの CSS をこのページだけに閉じ込める。
import type { Metadata } from 'next';
import { MantineFrame } from '@/components/demo/design-systems/mantine-frame';

export const metadata: Metadata = { title: 'Mantine の中に置いたグリッド', robots: { index: false, follow: false } };

export default function Page() {
  return <MantineFrame />;
}