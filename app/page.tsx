import { Suspense } from 'react';
import { KASTRAL_TOOLS } from '@/lib/tools-catalog';
import { FileWorkbench } from '@/components/FileWorkbench';
import { HomeCatalog } from './HomeCatalog';
import { AdSenseSlot } from '@/components/AdSenseSlot';

export default function HomePage() {
  const defaultTool = KASTRAL_TOOLS[0]; // convertir-imagen

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-16">
      {/* Sección Principal / Hero + Mesa de Trabajo Directa */}
      <section className="space-y-8">
        <div className="max-w-3xl space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold text-[#C86D2D]">Kastral</span>
            <span aria-hidden="true">·</span>
            <span>Convierte. Comprime. Simplifica.</span>
            <span aria-hidden="true">·</span>
            <span>100 % Gratuito y sin registro</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 leading-[1.12] [text-wrap:balance]">
            Herramientas de archivos precisas y rápidas desde tu navegador.
          </h1>

          <p className="text-base sm:text-lg text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-2xl">
            Transforma y optimiza imágenes, documentos PDF, hojas de cálculo, audio, vídeo y archivos ZIP sin instalar programas ni crear cuentas.
          </p>
        </div>

        {/* Mesa de trabajo interactiva en primera pantalla */}
        <FileWorkbench initialTool={defaultTool} allowToolSwitch={true} />
      </section>

      {/* Ubicación publicitaria discreta (solo se activa si AdSense está aprobado y configurado) */}
      <AdSenseSlot slotId="home-below-workbench" format="horizontal" />

      {/* Catálogo completo con buscador y filtros por categoría */}
      <Suspense fallback={null}>
        <HomeCatalog />
      </Suspense>

      {/* Explicación técnica transparente de arquitectura y seguridad */}
      <section className="pt-8 border-t border-[#DCD5CB] dark:border-[#27272D] space-y-8">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Privacidad y Rendimiento Real: Navegador Primero, Servidor Solo Cuando Hace Falta
          </h2>
          <p className="text-sm sm:text-base text-zinc-700 dark:text-zinc-300">
            La mayoría de las herramientas se ejecutan directamente en la memoria de tu navegador. Las que dependen de motores de alta precisión (Ghostscript y FFmpeg) usan un directorio temporal aislado que se elimina automáticamente al terminar.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-xl bg-white dark:bg-[#141417] border border-[#DCD5CB] dark:border-[#27272D] space-y-2">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              01. Procesamiento en tu Dispositivo Siempre que es Posible
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              La mayoría de las 17 herramientas (imagen, documentos, hojas de cálculo y ZIP) se ejecutan en la memoria de tu navegador. Solo audio, vídeo, la compresión PDF con Ghostscript y la salida AVIF usan el servidor, que borra cada archivo al terminar.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-[#141417] border border-[#DCD5CB] dark:border-[#27272D] space-y-2">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              02. Las Herramientas Locales Funcionan Sin Conexión
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              Una vez abierta la aplicación, nuestro Service Worker almacena en caché los motores locales para que sigas usando las herramientas de navegador (imágenes, combinación de PDF, documentos y ZIP) incluso sin conexión Wi-Fi o datos móviles.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-[#141417] border border-[#DCD5CB] dark:border-[#27272D] space-y-2">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              03. Sin Suscripciones ni Costes Ocultos
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              Todas las herramientas son gratuitas, no imponen marcas de agua ni exigen cuentas o tarjetas. El servicio se sostiene mediante espacios publicitarios discretos que nunca interfieren con tus descargas.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
