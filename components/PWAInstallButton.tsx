'use client';

import React, { useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '@/hooks/use-pwa-install';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (isInstallable) {
            await install();
          } else {
            setShowModal(true);
          }
        }}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-300/80 dark:border-zinc-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5 text-[#C86D2D] shrink-0" />
        <span className="hidden sm:inline">App Local / Offline</span>
        <span className="sm:hidden">Offline</span>
      </button>

      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3
                  id="pwa-install-title"
                  className="text-base font-bold text-zinc-900 dark:text-zinc-100"
                >
                  Usar Kastral 100 % Local y Sin Internet
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Todas las herramientas ya están configuradas para ejecutarse en la memoria de tu navegador.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Cerrar guía de instalación local"
                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 space-y-2 bg-zinc-50 dark:bg-zinc-800/70 p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Instalación en iPhone / iPad (Safari):
                </p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Pulsa el botón <strong>Compartir</strong> en la barra de Safari.</li>
                  <li>Selecciona <strong>Añadir a pantalla de inicio</strong>.</li>
                  <li>Abre Kastral desde el icono incluso en modo avión.</li>
                </ol>
              </div>
            ) : (
              <div className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 space-y-2 bg-zinc-50 dark:bg-zinc-800/70 p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Instalación en Escritorio (Chrome / Edge / Brave) o Android:
                </p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Haz clic en el icono de <strong>Instalar aplicación</strong> en la barra de direcciones del navegador (o en el menú de tres puntos).</li>
                  <li>El Service Worker de Kastral guarda la interfaz en caché para que las herramientas de navegador sigan disponibles sin conexión a Internet.</li>
                </ol>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#C86D2D] hover:bg-[#AD581D] rounded-lg cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineStatusBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2.5 text-xs font-semibold shadow-lg border border-zinc-700 dark:border-zinc-300"
    >
      <WifiOff className="w-4 h-4 text-[#DF7B35] dark:text-[#C86D2D] shrink-0" />
      <span>Sin conexión a Internet — Las herramientas de navegador siguen activas; las de servidor necesitan conexión.</span>
    </div>
  );
}
