'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const INSTALL_STATE_EVENT = 'kastral-install-state';
let installedDuringSession = false;

function readInstalledState(): boolean {
  if (typeof window === 'undefined') return false;
  if (installedDuringSession) return true;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return standalone;
}

function markInstalled(): void {
  installedDuringSession = true;
  window.dispatchEvent(new Event(INSTALL_STATE_EVENT));
}

function subscribeToInstallState(callback: () => void) {
  window.addEventListener(INSTALL_STATE_EVENT, callback);
  return () => window.removeEventListener(INSTALL_STATE_EVENT, callback);
}

function subscribeToNothing() {
  return () => {};
}

function readIsIOS(): boolean {
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const isInstalled = useSyncExternalStore(
    subscribeToInstallState,
    readInstalledState,
    () => false
  );
  const isIOS = useSyncExternalStore(subscribeToNothing, readIsIOS, () => false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Registrar Service Worker para funcionamiento offline sin conexión a Internet
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Silencioso en caso de restricción de iframe
      });
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      markInstalled();
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      markInstalled();
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

function subscribeToNetworkState(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useOnlineStatus() {
  return useSyncExternalStore(
    subscribeToNetworkState,
    () => navigator.onLine,
    () => true
  );
}
