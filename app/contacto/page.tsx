'use client';

import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Copy, Mail } from 'lucide-react';
import { CustomSelect } from '@/components/CustomSelect';
import { isTauri } from '@/lib/tauri-engine';

// Contact address can be overridden at build time via NEXT_PUBLIC_CONTACT_EMAIL.
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'cuentacamilo48@gmail.com';

const TOPIC_OPTIONS = [
  { value: 'sugerencia', label: 'Sugerir una nueva herramienta o formato' },
  { value: 'error', label: 'Reportar un error al convertir un archivo' },
  { value: 'privacidad', label: 'Consulta sobre privacidad o seguridad' },
  { value: 'otro', label: 'Otro asunto' },
];

export default function ContactoPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState('sugerencia');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);

  const buildMessageText = () => {
    const topicLabel = TOPIC_OPTIONS.find((option) => option.value === topic)?.label || 'Consulta';
    return `Nombre: ${name.trim()}\nCorreo: ${email.trim()}\nMotivo: ${topicLabel}\n\n${message.trim()}`;
  };

  const buildMailto = () => {
    const topicLabel = TOPIC_OPTIONS.find((option) => option.value === topic)?.label || 'Consulta';
    return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`[Kastral] ${topicLabel}`)}&body=${encodeURIComponent(buildMessageText())}`;
  };

  // En desktop (Tauri) `window.location.href = mailto:` abre una pestaña vacía
  // en vez del cliente de correo: se usa openUrl del plugin-opener.
  const openInMailClient = async (mailto: string): Promise<boolean> => {
    if (!isTauri()) {
      window.location.href = mailto;
      return true;
    }
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(mailto);
      return true;
    } catch {
      return false;
    }
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(buildMessageText());
      setCopied(true);
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona el texto del mensaje a mano.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || name.trim().length < 2) {
      setError('Por favor, indica tu nombre.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Introduce una dirección de correo electrónico válida.');
      return;
    }
    if (!message.trim() || message.trim().length < 10) {
      setError('Escribe un mensaje de al menos 10 caracteres explicando tu consulta.');
      return;
    }

    setCopied(false);
    if (isTauri()) {
      const opened = await openInMailClient(buildMailto());
      if (!opened) {
        // Fallback: deja el mensaje listo en el portapapeles para enviarlo a mano.
        await copyMessage();
      }
    } else {
      window.location.href = buildMailto();
    }
    setSubmitted(true);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="space-y-3">
        <div className="text-xs font-semibold text-[#C86D2D]">Soporte y Sugerencias</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Contacto con el equipo de Kastral
        </h1>
        <p className="text-base text-zinc-700 dark:text-zinc-300">
          ¿Encontraste un archivo que no pudo convertirse correctamente o quieres proponer un nuevo formato para el catálogo? Rellena el formulario y se abrirá tu programa de correo con el mensaje listo para enviar a <strong>{CONTACT_EMAIL}</strong>.
        </p>
      </div>

      {submitted ? (
        <div className="p-6 bg-white dark:bg-[#141417] border border-[#DCD5CB] dark:border-[#27272D] rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-base">
            <CheckCircle2 className="w-5 h-5" />
            <span>Mensaje preparado en tu programa de correo</span>
          </div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Se ha abierto tu cliente de correo con el mensaje dirigido a <strong>{CONTACT_EMAIL}</strong>. Envíalo desde ahí para que nos llegue; el formulario no transmite nada por sí solo.
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Si no se abrió nada, copia el mensaje y envíalo a mano a esa misma dirección.
          </p>
          {error && (
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <a
              href={buildMailto()}
              onClick={async (e) => {
                if (isTauri()) {
                  e.preventDefault();
                  const opened = await openInMailClient(buildMailto());
                  if (!opened) {
                    setError('No se pudo abrir el cliente de correo. Usa «Copiar mensaje» y envíalo a mano.');
                  }
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#C86D2D] hover:bg-[#B05B1E] rounded-lg transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              Abrir de nuevo el correo
            </a>
            <button
              type="button"
              onClick={copyMessage}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100 bg-[#F8F5F0] dark:bg-[#1C1C21] border border-[#D5CEC4] dark:border-[#2E2E36] rounded-lg cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'Mensaje copiado' : 'Copiar mensaje'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setName('');
                setEmail('');
                setMessage('');
                setCopied(false);
              }}
              className="px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 border border-[#D5CEC4] dark:border-[#2E2E36] rounded-lg cursor-pointer"
            >
              Enviar otra consulta
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="p-6 sm:p-8 bg-white dark:bg-[#141417] border border-[#DCD5CB] dark:border-[#27272D] rounded-xl space-y-5"
        >
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center gap-2 text-xs sm:text-sm text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="contact-name" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Nombre
              </label>
              <input
                id="contact-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                className="w-full px-3.5 py-2.5 text-sm bg-[#F8F5F0] dark:bg-[#1C1C21] border border-[#D5CEC4] dark:border-[#2E2E36] rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C86D2D]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="contact-email" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Correo electrónico
              </label>
              <input
                id="contact-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@ejemplo.com"
                className="w-full px-3.5 py-2.5 text-sm bg-[#F8F5F0] dark:bg-[#1C1C21] border border-[#D5CEC4] dark:border-[#2E2E36] rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C86D2D]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="contact-topic" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Motivo de la consulta
            </label>
            <CustomSelect
              id="contact-topic"
              value={topic}
              onChange={setTopic}
              options={TOPIC_OPTIONS}
              ariaLabel="Motivo de la consulta"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="contact-message" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Mensaje detallado
            </label>
            <textarea
              id="contact-message"
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Indica el formato de entrada, el formato de salida y cualquier detalle relevante..."
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8F5F0] dark:bg-[#1C1C21] border border-[#D5CEC4] dark:border-[#2E2E36] rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C86D2D]"
            />
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 text-sm font-semibold text-white bg-[#C86D2D] hover:bg-[#B05B1E] rounded-lg transition-colors cursor-pointer"
          >
            Enviar mensaje
          </button>
        </form>
      )}
    </div>
  );
}
