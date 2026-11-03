import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

const siteUrl = 'http://localhost:3000';

export const viewport: Viewport = {
  themeColor: '#0B0B0D',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl.startsWith('http') ? siteUrl : 'https://kastral.app'),
  title: {
    default: 'Kastral — Convierte, Comprime y Simplifica Archivos Gratis',
    template: '%s',
  },
  description:
    'Plataforma gratuita de conversión, compresión y optimización de archivos directamente en tu navegador sin necesidad de Internet. Imágenes, PDF, documentos, audio, vídeo y ZIP.',
  alternates: {
    canonical: '/',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kastral',
  },
  icons: {
    apple: '/apple-touch-icon.png',
    icon: '/pwa-192x192.png',
  },
  openGraph: {
    title: 'Kastral — Convierte, Comprime y Simplifica Archivos Gratis',
    description:
      'Herramientas de archivos gratuitas desde tu navegador sin instalar programas. Procesa imágenes, PDF, documentos, audio, vídeo y ZIP, la mayoría en tu dispositivo y el resto con motores de servidor.',
    type: 'website',
    siteName: 'Kastral',
    locale: 'es_ES',
    images: [
      {
        url: '/assets/brand/image_8099a79d.png',
        width: 512,
        height: 512,
        alt: 'Logo oficial de Kastral',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kastral — Convierte, Comprime y Simplifica Archivos Gratis',
    description:
      'Convierte y comprime imágenes, PDF, documentos, audio, vídeo y archivos ZIP directamente desde tu navegador sin registro.',
    images: ['/assets/brand/image_8099a79d.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Kastral',
    slogan: 'Convierte. Comprime. Simplifica.',
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'All',
    description:
      'Plataforma web gratuita de conversión, compresión y optimización de imágenes, PDF, documentos, audio, vídeo y archivos ZIP desde el navegador.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
    },
  };

  return (
    <html
      lang="es"
      className="dark"
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className="min-h-screen flex flex-col font-sans antialiased bg-[#F3EFEA] dark:bg-[#0B0B0D] text-[#141413] dark:text-[#F5F4F0] selection:bg-[#C86D2D]/25 selection:text-[#DF7B35]"
        suppressHydrationWarning
      >
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
