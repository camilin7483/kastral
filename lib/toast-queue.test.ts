import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOAST_LIMIT,
  createToast,
  dismissToast,
  enqueueToast,
  type ToastItem,
} from './toast-queue';

function makeToast(title: string): ToastItem {
  return createToast({ title });
}

test('createToast usa 6000 ms por defecto y 10000 ms para errores', () => {
  assert.equal(createToast({ title: 'Ok' }).durationMs, 6000);
  assert.equal(createToast({ kind: 'info', title: 'Info' }).durationMs, 6000);
  assert.equal(createToast({ kind: 'success', title: 'Hecho' }).durationMs, 6000);
  assert.equal(createToast({ kind: 'error', title: 'Fallo' }).durationMs, 10000);
});

test('createToast respeta una duración explícita y el tipo por defecto es info', () => {
  const custom = createToast({ kind: 'error', title: 'Corto', durationMs: 1500 });
  assert.equal(custom.durationMs, 1500);
  assert.equal(createToast({ title: 'Sin tipo' }).kind, 'info');
});

test('createToast genera ids únicos no vacíos', () => {
  const ids = new Set([makeToast('a').id, makeToast('b').id, makeToast('c').id]);
  assert.equal(ids.size, 3);
  for (const id of ids) assert.ok(id.length > 0);
});

test('enqueueToast conserva como máximo TOAST_LIMIT y descarta el más antiguo', () => {
  assert.equal(TOAST_LIMIT, 4);
  let list: ToastItem[] = [];
  const added = ['primero', 'segundo', 'tercero', 'cuarto', 'quinto'].map((title) =>
    makeToast(title),
  );
  for (const toast of added) list = enqueueToast(list, toast);
  assert.equal(list.length, TOAST_LIMIT);
  assert.deepEqual(
    list.map((toast) => toast.title),
    ['segundo', 'tercero', 'cuarto', 'quinto'],
  );
});

test('enqueueToast no muta la lista original', () => {
  const list = [makeToast('a'), makeToast('b')];
  const next = enqueueToast(list, makeToast('c'));
  assert.equal(list.length, 2);
  assert.equal(next.length, 3);
});

test('dismissToast quita el id indicado y deja el resto intacto', () => {
  const first = makeToast('a');
  const second = makeToast('b');
  const list = enqueueToast(enqueueToast([], first), second);
  const next = dismissToast(list, first.id);
  assert.deepEqual(
    next.map((toast) => toast.id),
    [second.id],
  );
});

test('dismissToast con id desconocido devuelve la misma lista', () => {
  const list = [makeToast('a')];
  assert.deepEqual(dismissToast(list, 'toast-inexistente'), list);
});
