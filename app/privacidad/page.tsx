import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidad y Uso de Cookies | Kastral',
  description:
    'Política de privacidad de Kastral: tratamiento de archivos temporales, ausencia de cuentas obligatorias y uso mínimo de almacenamiento local.',
  alternates: {
    canonical: '/privacidad',
  },
};

export default function PrivacidadPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="space-y-3">
        <p className="text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-300">Última actualización: Octubre 2026</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Política de Privacidad y Cookies
        </h1>
        <p className="text-base text-zinc-700 dark:text-zinc-300">
          En Kastral respetamos tu privacidad y aplicamos un modelo de retención mínima de datos. No exigimos crear cuentas ni recopilamos datos personales para utilizar nuestras herramientas.
        </p>
      </div>

      <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          1. Tratamiento de los Archivos Procesados
        </h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Muchas de nuestras herramientas (como combinar o dividir PDF, crear o extraer archivos ZIP y convertir hojas de cálculo) procesan los archivos localmente dentro de tu propio navegador web. En dichas operaciones, tus archivos nunca abandonan tu dispositivo.
        </p>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Cuando utilizas una herramienta que requiere procesamiento en el servidor (como comprimir PDF con Ghostscript, convertir audio/vídeo con FFmpeg o codificar imágenes AVIF), el archivo se transfiere al servidor exclusivamente para ejecutar la operación técnica solicitada:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>Los archivos se almacenan en un directorio temporal aislado con un nombre interno aleatorio.</li>
          <li>No leemos, indexamos, vendemos ni compartimos el contenido de tus archivos con terceros.</li>
          <li>El archivo original subido se elimina tras finalizar la tarea de conversión, y el archivo de salida se purga automáticamente tras el periodo técnico de descarga (15 minutos por defecto).</li>
        </ul>
      </section>

      <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          2. Almacenamiento Local del Navegador
        </h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Utilizamos el almacenamiento local (<code>localStorage</code>) de tu navegador únicamente para recordar tu preferencia visual entre el modo claro y el modo oscuro (<code>kastral-theme</code>).
        </p>
      </section>
    </div>
  );
}
