import { SiteProvider } from '@/components/site-provider';
import './global.css';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ja" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <SiteProvider>{children}</SiteProvider>
      </body>
    </html>
  );
}
