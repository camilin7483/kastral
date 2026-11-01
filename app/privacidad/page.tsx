import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidad y Uso de Cookies | Kastral',
  description:
    'Política de privacidad de Kastral: tratamiento de archivos temporales, ausencia de cuentas obligatorias e información sobre cookies publicitarias de Google AdSense.',
  alternates: {
    canonical: '/privacidad',
  },
};

export default function PrivacidadPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="space-y-3">
        <p className="text-xs font-mono tabular-nums text-zinc-500">Última actualización: Octubre 2026</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Política de Privacidad y Cookies
        </h1>
        <p className="text-base text-zinc-600 dark:text-zinc-400">
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
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Los archivos se almacenan en un directorio temporal aislado con un nombre interno aleatorio.</li>
          <li>No leemos, indexamos, vendemos ni compartimos el contenido de tus archivos con terceros.</li>
          <li>El archivo original subido se elimina tras finalizar la tarea de conversión, y el archivo de salida se purga automáticamente tras el periodo técnico de descarga (15 minutos por defecto).</li>
        </ul>
      </section>

      <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          2. Publicidad y Cookies de Google AdSense
        </h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Kastral es una plataforma gratuita financiada mediante publicidad de <strong>Google AdSense</strong> cuando el servicio publicitario se encuentra activo:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Proveedores terceros, incluido Google, utilizan cookies para mostrar anuncios relevantes basados en las visitas anteriores del usuario a este u otros sitios web.</li>
          <li>El uso de cookies publicitarias permite a Google y a sus socios mostrar anuncios basados en las visitas realizadas a Kastral o a otros sitios de Internet.</li>
          <li>Los usuarios pueden inhabilitar la publicidad personalizada accediendo a la <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer" className="text-[#C86D2D] underline">Configuración de anuncios de Google</a>.</li>
        </ul>
      </section>

      <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          3. Almacenamiento Local del Navegador
        </h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Utilizamos el almacenamiento local (<code>localStorage</code>) de tu navegador únicamente para recordar tu preferencia visual entre el modo claro y el modo oscuro (<code>kastral-theme</code>).
        </p>
      </section>
    </div>
  );
}
