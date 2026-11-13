import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KASTRAL_TOOLS } from './tools-catalog';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_VERSION = '0.2.0';

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function cargoTomlPackageVersion(src: string): string {
  const m = /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(src);
  assert.ok(m, 'Cargo.toml [package] version not found');
  return m[1];
}

function cargoLockKastralVersion(src: string): string {
  const m = /\[\[package\]\]\s*\nname\s*=\s*"kastral"\s*\nversion\s*=\s*"([^"]+)"/.exec(src);
  assert.ok(m, 'Cargo.lock kastral package version not found');
  return m[1];
}

function swAppVersion(src: string): string {
  const m = /const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(src);
  assert.ok(m, 'sw.js APP_VERSION not found');
  return m[1];
}

function swToolRoutes(src: string): string[] {
  const block = /CORE_ROUTES\s*=\s*\[([\s\S]*?)\]/.exec(src);
  assert.ok(block, 'sw.js CORE_ROUTES not found');
  const routes: string[] = [];
  for (const m of block[1].matchAll(/['"](\/herramientas\/[a-z0-9-]+)['"]/g)) {
    routes.push(m[1]);
  }
  return routes;
}

test('version sync: all five version declarations equal 0.2.0', () => {
  const pkg = JSON.parse(read('package.json')) as { version: string };
  const tauri = JSON.parse(read('src-tauri/tauri.conf.json')) as { version: string };
  const cargoToml = cargoTomlPackageVersion(read('src-tauri/Cargo.toml'));
  const cargoLock = cargoLockKastralVersion(read('src-tauri/Cargo.lock'));
  const sw = swAppVersion(read('public/sw.js'));

  for (const v of [pkg.version, tauri.version, cargoToml, cargoLock, sw]) {
    assert.equal(v, EXPECTED_VERSION);
  }
});

test('version sync: sw.js CORE_ROUTES covers every catalog slug', () => {
  const routes = new Set(swToolRoutes(read('public/sw.js')));
  for (const tool of KASTRAL_TOOLS) {
    assert.ok(routes.has(`/herramientas/${tool.slug}`), `missing route for ${tool.slug}`);
  }
});

test('version sync: every sw.js tool route matches a real catalog slug', () => {
  const slugs = new Set(KASTRAL_TOOLS.map((t) => t.slug));
  for (const route of swToolRoutes(read('public/sw.js'))) {
    const slug = route.replace('/herramientas/', '');
    assert.ok(slugs.has(slug), `orphan sw.js route ${route}`);
  }
});
