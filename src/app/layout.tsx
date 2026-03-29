import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PreviewProvider } from '@/contexts/PreviewContext';
import { PWASetup } from '@/components/PWASetup';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: 'Kara - Karaoke Queue Manager',
  description: 'YouTube Karaoke Queue Manager for parties and events',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Kara',
  },
  icons: {
    icon: [
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-180x180.png', sizes: '180x180', type: 'image/png' },
      { url: '/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#667eea',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* PWA Meta Tags */}
        <meta name="application-name" content="Kara" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Kara" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        
        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/icon-180x180.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-180x180.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192x192.png" />
        
        {/* Splash Screens (iOS) - Basic support */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        <PreviewProvider>
          {children}
        </PreviewProvider>
        
        {/* PWA Setup (Service Worker Registration) */}
        <PWASetup />
        <Analytics />
      </body>
    </html>
  );
}

