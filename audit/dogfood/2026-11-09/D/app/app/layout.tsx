import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { ModeToggle } from '@/components/mode-toggle';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Acme Admin',
  description: 'SaaS admin console',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <header className="flex h-12 items-center gap-4 border-b px-4">
            <span className="font-semibold">Acme Admin</span>
            <nav className="flex gap-3 text-sm text-muted-foreground">
              <Link href="/users" className="hover:text-foreground" data-testid="nav-users">Users</Link>
              <Link href="/settings" className="hover:text-foreground" data-testid="nav-settings">Settings</Link>
            </nav>
            <div className="ml-auto">
              <ModeToggle />
            </div>
          </header>
          <main className="flex flex-1 flex-col">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
