import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex', display: 'swap' });

export const metadata: Metadata = { title: 'Takenbord', description: 'Takenbord voor de garage' };
export const viewport: Viewport = { themeColor: '#0b0f14', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" className={plex.variable}>
      <body className="min-h-dvh bg-achtergrond font-sans text-tekst antialiased">{children}</body>
    </html>
  );
}
