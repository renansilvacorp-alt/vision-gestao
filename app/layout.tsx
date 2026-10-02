import type { Metadata, Viewport } from 'next';
import '@/src/index.css';

export const metadata: Metadata = {
  title: 'Vision - Gestão Integrada',
  description: 'Gestão integrada multiempresa, modular e configurável.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/vision-icon.svg',
    apple: '/vision-icon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f766e',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
