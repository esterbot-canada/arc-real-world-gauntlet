import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agent Review Control MVP',
  description: 'Local review-first control layer for coding-agent work.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="brand" href="/" aria-label="Agent Review Control home">
            Agent Review Control
          </Link>
          <nav className="site-nav" aria-label="Primary navigation">
            <Link href="/inbox">Inbox</Link>
            <Link href="/">Review Queue</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
