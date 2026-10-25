// デザインシステムのデモ(guides/design-systems)の iframe の中身。デザインシステムの CSS をこのページだけに閉じ込める。
import type { Metadata } from 'next';
import { HeroUIFrame } from '@/components/demo/design-systems/heroui-frame';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Page() {
  return <HeroUIFrame />;
}