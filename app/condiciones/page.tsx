import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Condiciones de Uso y Límites del Servicio | Kastral',
  description:
    'Condiciones de uso de la plataforma gratuita Kastral: uso aceptable, propiedad intelectual de tus archivos y límites técnicos del alojamiento gratuito.',
  alternates: {
    canonical: '/condiciones',
  },
};

export default function CondicionesPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="space-y-3">
        <p className="text-xs font-mono tabular-nums text-zinc-500">Vigencia: Octubre 2026</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Condiciones de Uso del Servicio
        </h1>
        <p className="text-base text-zinc-600 dark:text-zinc-400">
          Al utilizar las herramientas de conversión y compresión de Kastral, aceptas las presentes condiciones pensadas para garantizar un servicio gratuito, seguro y estable para todos los usuarios.
        </p>
      </div>

      <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          1. Gratuidad del Servicio
        </h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Todas las herramientas ofrecidas en Kastral son de acceso gratuito. No existen suscripciones ocultas ni cobros por descarga.
        </p>
      </section>

      <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          2. Propiedad Intelectual y Responsabilidad de los Archivos
        </h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Tú conservas el 100 % de los derechos y la propiedad intelectual sobre los archivos que procesas en Kastral. Queda prohibido utilizar la plataforma para procesar malware, archivos maliciosos diseñados para explotar vulnerabilidades (como bombas de descompresión o ataques de recorrido de directorios) o material ilegal.
        </p>
      </section>

      <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          3. Límites Técnicos y Disponibilidad
        </h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Para proteger la estabilidad del servidor y permitir que el servicio opere dentro de infraestructuras eficientes:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Existe un límite máximo de tamaño por archivo (entre 25 MB y 100 MB según la herramienta) y un límite de tiempo de ejecución de 60 segundos por tarea en el servidor.</li>
          <li>Kastral no es un servicio de almacenamiento en la nube; descarga siempre tus archivos convertidos inmediatamente, ya que se eliminan de forma automática.</li>
          <li>El servicio se proporciona &ldquo;tal cual&rdquo;, recomendándose conservar siempre una copia de respaldo de tus documentos originales antes de realizar cualquier modificación.</li>
        </ul>
      </section>
    </div>
  );
}
