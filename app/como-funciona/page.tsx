import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Cómo Funciona Kastral — Arquitectura, Motores y Seguridad de Archivos',
  description:
    'Conoce cómo procesa Kastral tus archivos: ejecución local en navegador mediante WebAssembly y Canvas, y procesamiento aislado en servidor con Ghostscript, FFmpeg y Sharp.',
  alternates: {
    canonical: '/como-funciona',
  },
};

export default function ComoFuncionaPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <div className="space-y-4">
        <div className="text-xs font-semibold text-[#C86D2D]">Transparencia Técnica</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Cómo funciona Kastral y cómo protegemos tus archivos
        </h1>
        <p className="text-base text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Kastral está diseñado bajo un principio de mínima exposición: todo lo que tu navegador puede procesar con fiabilidad se ejecuta directamente en tu equipo, y lo que requiere motores nativos se procesa en directorios aislados y temporales.
        </p>
      </div>

      <section className="space-y-4 border-t border-zinc-200 dark:border-zinc-800 pt-8">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          01. Procesamiento Local en el Navegador (Privacidad Directa)
        </h2>
        <p className="text-sm sm:text-base text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Para reducir costes operativos y mejorar tu privacidad, las siguientes herramientas se ejecutan al 100 % dentro de la memoria de tu navegador web mediante APIs estándar (HTML5 Canvas, ArrayBuffer) y bibliotecas compiladas:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          <li>
            <strong>Combinar, Dividir y Extraer páginas PDF:</strong> Se procesan en tu navegador mediante <code>pdf-lib</code> sin subir el documento a Internet.
          </li>
          <li>
            <strong>Crear y Extraer archivos ZIP:</strong> Se empaquetan y descomprimen localmente con validación contra rutas fuera de directorio (protección Zip Slip).
          </li>
          <li>
            <strong>Conversión de Hojas de Cálculo (XLSX, CSV, JSON, HTML):</strong> Se transforman localmente respetando la codificación UTF-8.
          </li>
          <li>
            <strong>Conversión y Redimensionado de Imágenes (PNG, JPG, WebP):</strong> Se renderizan en el motor gráfico 2D de tu navegador.
          </li>
        </ul>
      </section>

      <section className="space-y-4 border-t border-zinc-200 dark:border-zinc-800 pt-8">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          02. Procesamiento en el Servidor para Motores Nativos
        </h2>
        <p className="text-sm sm:text-base text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Algunas operaciones técnicas requieren motores de consola especializados que los navegadores no incluyen de forma nativa. En estos casos, el archivo se sube mediante conexión segura al servidor:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          <li>
            <strong>Compresión real de PDF y PDF a Imágenes:</strong> Ejecutado mediante <strong>Ghostscript</strong> con la bandera de seguridad <code>-dSAFER</code> activa para impedir accesos al sistema de archivos.
          </li>
          <li>
            <strong>Conversión y Compresión de Audio y Vídeo:</strong> Ejecutado mediante <strong>FFmpeg</strong> con argumentos parametrizados sin interpolación de comandos de shell.
          </li>
          <li>
            <strong>Codificación AVIF y Optimización Avanzada de Imagen:</strong> Ejecutado mediante <strong>Sharp / Pillow</strong>.
          </li>
          <li>
            <strong>Documentos DOCX a PDF / HTML:</strong> Procesado mediante extracción semántica con <strong>Mammoth</strong> y maquetación vectorial limpia.
          </li>
        </ul>
      </section>

      <section className="space-y-4 border-t border-zinc-200 dark:border-zinc-800 pt-8">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          03. Medidas de Seguridad y Ciclo de Vida Temporal
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-1.5">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Verificación de Cabeceras Binarias (Magic Bytes)
            </h3>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
              No confiamos únicamente en la extensión del archivo. Antes de invocar cualquier motor, comprobamos la firma binaria real del archivo y rechazamos archivos vacíos o falsificados.
            </p>
          </div>
          <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-1.5">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Aislamiento por Tarea y Limpieza Automática
            </h3>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
              Cada tarea en el servidor crea un directorio temporal aislado con un UUID aleatorio. El archivo de entrada se borra inmediatamente tras generar la salida, y el resultado expira automáticamente pasados 15 minutos.
            </p>
          </div>
        </div>
      </section>

      <div className="pt-6">
        <Link
          href="/"
          className="inline-flex items-center px-5 py-2.5 text-sm font-semibold text-white bg-[#C86D2D] hover:bg-[#B05B1E] rounded-lg transition-colors"
        >
          Volver a las herramientas
        </Link>
      </div>
    </div>
  );
}
