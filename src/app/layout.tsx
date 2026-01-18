import type { Metadata } from 'next';
import './globals.css';
import { PreviewProvider } from '@/contexts/PreviewContext';

export const metadata: Metadata = {
  title: 'Karaoke Web App',
  description: 'Web-only karaoke system for house parties',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PreviewProvider>
          {children}
        </PreviewProvider>
      </body>
    </html>
  );
}

