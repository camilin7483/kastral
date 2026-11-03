import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Por qué Kastral — Comparativa honesta con ILovePDF, SmallPDF y Convertio',
  description:
    'Qué hace Kastral de forma distinta: procesamiento en tu navegador cuando es posible, app de escritorio sin cuentas, sin marcas de agua y límites publicados. Tabla comparativa y limitaciones reconocidas.',
  alternates: {
    canonical: '/por-que-kastral',
  },
};

export default function PorQueKastralPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <div className="space-y-4">
        <div className="text-xs font-semibold text-[#C86D2D]">Transparencia</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Por qué usar Kastral
        </h1>
        <p className="text-base text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Kastral es una plataforma gratuita de 17 herramientas para convertir, comprimir y
          simplificar archivos. Esta página explica qué hace de forma distinta, con datos
          verificables en este mismo sitio, y también en qué queda por detrás de otras
          plataformas.
        </p>
      </div>

      <section className="space-y-4 border-t border-zinc-200 dark:border-zinc-800 pt-8">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Lo que Kastral sí ofrece
        </h2>
        <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <li>
            <strong>11 herramientas con modo 100 % en el navegador:</strong> combinar, dividir
            y extraer páginas de PDF, imágenes a PDF, crear y extraer ZIP, XLSX a CSV/JSON y
            conversión de imagen (PNG/JPG/WebP) se ejecutan en tu equipo sin subir nada.
          </li>
          <li>
            <strong>6 herramientas pesadas en servidor temporal:</strong> comprimir PDF, PDF a
            imágenes, convertir y comprimir vídeo, convertir audio y extraer audio usan
            Ghostscript, FFmpeg y Sharp. El archivo original se elimina al terminar la tarea
            y el resultado expira tras 15 minutos.
          </li>
          <li>
            <strong>App de escritorio Tauri sin cuentas ni telemetría:</strong> las mismas
            herramientas pesadas corren como comandos locales; no se exige registro.
          </li>
          <li>
            <strong>Sin marcas de agua</strong> en los archivos de salida.
          </li>
          <li>
            <strong>Límites publicados por herramienta (25–100 MB según herramienta):</strong>{' '}
            documentados en las condiciones y en la ficha de cada herramienta.
          </li>
          <li>
            <strong>Contacto que abre tu correo:</strong> el formulario prepara el mensaje en
            tu propio cliente de correo; nada se envía solo.
          </li>
        </ul>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Detalle técnico en <Link href="/como-funciona" className="underline underline-offset-4 hover:text-[#C86D2D]">Cómo funciona</Link>,
          tratamiento de datos en <Link href="/privacidad" className="underline underline-offset-4 hover:text-[#C86D2D]">Privacidad</Link>,
          límites en <Link href="/condiciones" className="underline underline-offset-4 hover:text-[#C86D2D]">Condiciones</Link> y
          soporte en <Link href="/contacto" className="underline underline-offset-4 hover:text-[#C86D2D]">Contacto</Link>.
        </p>
      </section>

      <section className="space-y-4 border-t border-zinc-200 dark:border-zinc-800 pt-8">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Tabla comparativa honesta
        </h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Los datos de Kastral están verificados en este repositorio. Los de terceros pueden
          cambiar según plan y fecha; donde no hay dato estable se indica ≈/varía.
        </p>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-100 dark:bg-zinc-900">
              <tr>
                <th scope="col" className="px-4 py-3 font-bold text-zinc-900 dark:text-zinc-100">Aspecto</th>
                <th scope="col" className="px-4 py-3 font-bold text-zinc-900 dark:text-zinc-100">Kastral</th>
                <th scope="col" className="px-4 py-3 font-bold text-zinc-900 dark:text-zinc-100">ILovePDF</th>
                <th scope="col" className="px-4 py-3 font-bold text-zinc-900 dark:text-zinc-100">SmallPDF</th>
                <th scope="col" className="px-4 py-3 font-bold text-zinc-900 dark:text-zinc-100">Convertio</th>
              </tr>
            </thead>
            <tbody className="text-zinc-700 dark:text-zinc-300">
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-4 py-3">Procesamiento en tu dispositivo cuando es posible</td>
                <td className="px-4 py-3">✔ 11 herramientas con modo navegador</td>
                <td className="px-4 py-3">≈/varía (centrado en servidor)</td>
                <td className="px-4 py-3">≈/varía (centrado en servidor)</td>
                <td className="px-4 py-3">≈/varía (centrado en servidor)</td>
              </tr>
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-4 py-3">Registro para uso básico</td>
                <td className="px-4 py-3">✔ Sin registro</td>
                <td className="px-4 py-3">≈/varía según plan</td>
                <td className="px-4 py-3">≈/varía según plan</td>
                <td className="px-4 py-3">≈/varía según plan</td>
              </tr>
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-4 py-3">App de escritorio que funciona sin conexión</td>
                <td className="px-4 py-3">✔ Tauri, sin cuentas ni telemetría</td>
                <td className="px-4 py-3">≈/varía</td>
                <td className="px-4 py-3">≈/varía</td>
                <td className="px-4 py-3">≈/varía</td>
              </tr>
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-4 py-3">Límites de tamaño publicados por herramienta</td>
                <td className="px-4 py-3">✔ 25–100 MB documentados</td>
                <td className="px-4 py-3">≈/varía según plan</td>
                <td className="px-4 py-3">≈/varía según plan</td>
                <td className="px-4 py-3">≈/varía según plan</td>
              </tr>
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-4 py-3">Marcas de agua en la salida gratuita</td>
                <td className="px-4 py-3">✔ Sin marcas de agua</td>
                <td className="px-4 py-3">≈/varía según plan</td>
                <td className="px-4 py-3">≈/varía según plan</td>
                <td className="px-4 py-3">≈/varía según plan</td>
              </tr>
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-4 py-3">Amplitud de formatos soportados</td>
                <td className="px-4 py-3">≈ 17 herramientas de uso común</td>
                <td className="px-4 py-3">≈/varía (foco PDF)</td>
                <td className="px-4 py-3">≈/varía (foco PDF)</td>
                <td className="px-4 py-3">✔ Catálogo más amplio</td>
              </tr>
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-4 py-3">OCR sobre documentos escaneados</td>
                <td className="px-4 py-3">✘ No disponible</td>
                <td className="px-4 py-3">≈/varía según plan</td>
                <td className="px-4 py-3">≈/varía según plan</td>
                <td className="px-4 py-3">≈/varía según plan</td>
              </tr>
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-4 py-3">Firma electrónica de PDF</td>
                <td className="px-4 py-3">✘ No disponible</td>
                <td className="px-4 py-3">≈/varía según plan</td>
                <td className="px-4 py-3">≈/varía según plan</td>
                <td className="px-4 py-3">≈/varía</td>
              </tr>
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-4 py-3">API pública para desarrolladores</td>
                <td className="px-4 py-3">✘ No disponible</td>
                <td className="px-4 py-3">≈/varía según plan</td>
                <td className="px-4 py-3">≈/varía según plan</td>
                <td className="px-4 py-3">≈/varía según plan</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4 border-t border-zinc-200 dark:border-zinc-800 pt-8">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Limitaciones reconocidas
        </h2>
        <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <li>Catálogo más reducido que Convertio en formatos poco comunes.</li>
          <li>Sin OCR: los PDF escaneados como imagen no se convierten a texto.</li>
          <li>Sin firma electrónica de documentos.</li>
          <li>Sin API pública para integraciones de terceros.</li>
          <li>
            Las 6 herramientas de servidor tienen límites de tamaño (25–50 MB) y 60 segundos
            de tiempo máximo por tarea.
          </li>
        </ul>
        <div className="pt-2 flex flex-wrap gap-3">
          <Link
            href="/#explorar-herramientas"
            className="inline-flex items-center px-5 py-2.5 text-sm font-semibold text-white bg-[#C86D2D] hover:bg-[#B05B1E] rounded-lg transition-colors"
          >
            Ver las herramientas
          </Link>
          <Link
            href="/contacto"
            className="inline-flex items-center px-5 py-2.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:border-[#C86D2D] transition-colors"
          >
            Proponer una mejora
          </Link>
        </div>
      </section>
    </div>
  );
}
