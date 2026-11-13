// Cola de notificaciones: helpers puros sin dependencias de framework.
// El límite y las duraciones viven aquí para que proveedor y tests compartan la misma fuente.

export const TOAST_LIMIT = 4;

export const TOAST_DEFAULT_DURATION_MS = 6000;
export const TOAST_ERROR_DURATION_MS = 10000;

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  detail?: string;
  durationMs: number;
  actionLabel?: string;
}

export interface CreateToastInput {
  kind?: ToastKind;
  title: string;
  message?: string;
  detail?: string;
  durationMs?: number;
  actionLabel?: string;
}

// Contador de módulo para ids únicos sin depender de APIs del navegador.
let toastCounter = 0;

function defaultDurationFor(kind: ToastKind): number {
  return kind === 'error' ? TOAST_ERROR_DURATION_MS : TOAST_DEFAULT_DURATION_MS;
}

export function createToast(input: CreateToastInput): ToastItem {
  const kind: ToastKind = input.kind ?? 'info';
  toastCounter += 1;
  return {
    id: `toast-${Date.now().toString(36)}-${toastCounter.toString(36)}`,
    kind,
    title: input.title,
    message: input.message,
    detail: input.detail,
    durationMs: input.durationMs ?? defaultDurationFor(kind),
    actionLabel: input.actionLabel,
  };
}

// Añade un toast y descarta los más antiguos cuando se supera el límite.
export function enqueueToast(list: ToastItem[], toast: ToastItem): ToastItem[] {
  return [...list, toast].slice(-TOAST_LIMIT);
}

// Quita un toast por id; con id desconocido devuelve la lista intacta.
export function dismissToast(list: ToastItem[], id: string): ToastItem[] {
  return list.filter((toast) => toast.id !== id);
}
