import type { Metadata } from 'next';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { ThemeBuilderLoader } from '@/components/theme-builder/theme-builder-loader';

export const metadata: Metadata = {
  title: 'テーマビルダー | SpreadsheetGrid',
  description:
    'SpreadsheetGrid のデザイントークン(アクセント / 背景 / 罫線 / 角丸 / 密度 / 文字サイズ)を実物のグリッドで調整し、CSS 変数として書き出すテーマビルダー。状態は URL で共有できます。',
};

export default function ThemeBuilderPage() {
  return (
    <HomeLayout {...baseOptions()}>
      <ThemeBuilderLoader />
    </HomeLayout>
  );
}
