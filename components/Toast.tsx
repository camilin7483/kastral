'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import {
  createToast,
  dismissToast,
  enqueueToast,
  type ToastItem,
  type ToastKind,
} from '@/lib/toast-queue';

export interface ToastOptions {
  kind?: ToastKind;
  title: string;
  message?: string;
  detail?: string;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast debe usarse dentro de ToastProvider');
  return value;
}

const KIND_ICONS: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const KIND_STYLES: Record<ToastKind, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-red-600 dark:text-red-400',
  info: 'text-[#C86D2D] dark:text-[#DF7B35]',
};

// La salida animada necesita retener el toast unos ms tras pedir el cierre.
const EXIT_MS = 180;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [leavingIds, setLeavingIds] = useState<string[]>([]);
  // Mapas en refs: los temporizadores no se reinician con cada render del padre.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const leavingRef = useRef(new Set<string>());
  // Los manejadores del botón de acción viven en estado: leer un ref
  // durante el render rompe la regla react-hooks/refs.
  const [actionHandlers, setActionHandlers] = useState<Record<string, () => void>>({});

  // Espejo de la cola para calcular descartes por límite fuera del render.
  const toastsRef = useRef<ToastItem[]>([]);

  const clearTimer = (id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  };

  const forget = useCallback((id: string) => {
    clearTimer(id);
    clearTimer(`${id}:salida`);
    leavingRef.current.delete(id);
    setActionHandlers((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setLeavingIds((prev) => (prev.includes(id) ? prev.filter((leavingId) => leavingId !== id) : prev));
  }, []);

  const remove = useCallback(
    (id: string) => {
      toastsRef.current = dismissToast(toastsRef.current, id);
      setToasts(toastsRef.current);
      forget(id);
    },
    [forget],
  );

  const dismiss = useCallback(
    (id: string) => {
      // Guarda en ref para no programar dos salidas para el mismo toast.
      if (leavingRef.current.has(id)) return;
      leavingRef.current.add(id);
      setLeavingIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      const timer = setTimeout(() => remove(id), EXIT_MS);
      timers.current.set(`${id}:salida`, timer);
    },
    [remove],
  );

  const toast = useCallback(
    (options: ToastOptions): string => {
      const item = createToast(options);
      const next = enqueueToast(toastsRef.current, item);
      // Limpia los descartados por límite de cola (temporizador, acción y salida).
      for (const current of toastsRef.current) {
        if (!next.some((kept) => kept.id === current.id)) forget(current.id);
      }
      toastsRef.current = next;
      setToasts(next);
      if (options.onAction && options.actionLabel) {
        const handler = options.onAction;
        setActionHandlers((prev) => ({ ...prev, [item.id]: handler }));
      }
      return item.id;
    },
    [forget],
  );

  // Un temporizador por toast, creado una sola vez por id.
  useEffect(() => {
    for (const item of toasts) {
      if (leavingIds.includes(item.id) || timers.current.has(item.id)) continue;
      const timer = setTimeout(() => dismiss(item.id), item.durationMs);
      timers.current.set(item.id, timer);
    }
  }, [toasts, leavingIds, dismiss]);

  // Limpieza total al desmontar.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96"
      >
        {toasts.map((item) => {
          const Icon = KIND_ICONS[item.kind];
          const leaving = leavingIds.includes(item.id);
          const action = actionHandlers[item.id];
          return (
            <article
              key={item.id}
              role={item.kind === 'error' ? 'alert' : undefined}
              className={`kastral-toast pointer-events-auto flex items-start gap-3 rounded-2xl border border-[#DCD5CB] bg-white p-4 shadow-lg dark:border-[#27272D] dark:bg-[#141417] ${
                leaving ? 'kastral-toast-salida' : ''
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${KIND_STYLES[item.kind]}`} aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{item.title}</p>
                {item.message && (
                  <p className="text-sm text-zinc-700 break-words dark:text-zinc-300">{item.message}</p>
                )}
                {item.detail && (
                  <p className="text-xs text-zinc-600 break-words dark:text-zinc-400">{item.detail}</p>
                )}
                {item.actionLabel && action && (
                  <button
                    type="button"
                    onClick={() => {
                      action();
                      dismiss(item.id);
                    }}
                    className="mt-1.5 text-xs font-bold text-[#C86D2D] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C86D2D] dark:text-[#DF7B35]"
                  >
                    {item.actionLabel}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Cerrar notificación"
                className="shrink-0 rounded-lg p-1 text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C86D2D] dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
