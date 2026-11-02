import './v2.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GlobalHostia — Web hosting, servers & domains from Dubai',
  description: 'Shared and WordPress hosting, VPS, dedicated and AI servers, SSL and domains — with real 24/7 support from Dubai.',
  robots: { index: false, follow: false }, // preview until approved
};

export default function V2Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body>{children}</body>
    </html>
  );
}
