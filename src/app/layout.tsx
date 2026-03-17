import type { Metadata } from 'next';
import { Instrument_Serif, Space_Mono } from 'next/font/google';
import DevProdBanner from '@/app/components/DevProdBanner';
import UpdateBanner from '@/app/components/UpdateBanner';
import Grain from '@/app/components/Grain';

import './global.css';
import './animations.css';

const instrumentSerif = Instrument_Serif({
  weight: '400',
  variable: '--font-instrument-serif',
  subsets: ['latin'],
});
const spaceMono = Space_Mono({
  weight: ['400', '700'],
  variable: '--font-space-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'down to',
  description: "Save events. See who's going.",
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'down to',
  },
  openGraph: {
    title: 'down to',
    description: "Save events. See who's going.",
    siteName: 'downto.xyz',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${spaceMono.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap"
          rel="stylesheet"
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#0a0a0a" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <style>{`
          input, textarea, select { font-size: 16px !important; }
        `}</style>
      </head>
      <body className="h-full bg-neutral-950 font-mono font-normal text-neutral-500 antialiased">
        <Grain />
        <DevProdBanner />
        <UpdateBanner />
        <div className="mx-auto flex h-dvh w-full max-w-105 flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
