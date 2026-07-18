import type { Metadata } from 'next';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { Playground } from '@/components/playground/playground';

export const metadata: Metadata = {
  title: 'プレイグラウンド | SpreadsheetGrid',
  description:
    'SpreadsheetGrid の主要 props をその場で切り替えて挙動を試せるプレイグラウンド。設定を再現する JSX スニペット付き。',
};

export default function PlaygroundPage() {
  return (
    <HomeLayout {...baseOptions()}>
      <Playground />
    </HomeLayout>
  );
}