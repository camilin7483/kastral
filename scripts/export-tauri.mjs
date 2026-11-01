#!/usr/bin/env node
// Mirror of scripts/export-tauri.sh in pure Node (no shell, no deps) so the
// static export also runs on Windows. Moves app/api aside, builds with
// KASTRAL_EXPORT=1, verifies out/index.html plus one HTML page per tool slug
// (counted dynamically from lib/tools-catalog.ts), and always restores app/api.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(ROOT, 'app', 'api');
const OUT_DIR = join(ROOT, 'out');

function countCatalogSlugs() {
  const src = readFileSync(join(ROOT, 'lib', 'tools-catalog.ts'), 'utf8');
  const slugs = new Set();
  for (const m of src.matchAll(/slug:\s*['"]([^'"]+)['"]/g)) slugs.add(m[1]);
  return slugs.size;
}

function hasCommand(cmd) {
  const r = spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: true });
  return r.status === 0;
}

function main() {
  const backupDir = mkdtempSync(join(tmpdir(), 'kastral-api-backup-'));
  const backupApi = join(backupDir, 'api');
  let moved = false;

  const restoreApi = () => {
    if (moved && existsSync(backupApi)) {
      renameSync(backupApi, API_DIR);
      moved = false;
    }
    rmSync(backupDir, { recursive: true, force: true });
  };

  try {
    if (existsSync(API_DIR)) {
      renameSync(API_DIR, backupApi);
      moved = true;
    }

    const buildCmd = hasCommand('next') ? 'next build' : 'bun run build';
    const build = spawnSync(buildCmd, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, KASTRAL_EXPORT: '1' },
    });
    if (build.status !== 0) throw new Error(`export build failed (${buildCmd})`);

    if (!existsSync(join(OUT_DIR, 'index.html'))) {
      throw new Error('ERROR: out/index.html missing');
    }

    const expected = countCatalogSlugs();
    const pagesDir = join(OUT_DIR, 'herramientas');
    const found = existsSync(pagesDir)
      ? readdirSync(pagesDir).filter((f) => f.endsWith('.html')).length
      : 0;
    if (found !== expected) {
      throw new Error(`ERROR: expected ${expected} tool slugs in out/herramientas, found ${found}`);
    }

    restoreApi();

    try {
      const git = spawnSync('git', ['status', '--porcelain', '--', 'app/api'], {
        cwd: ROOT,
        encoding: 'utf8',
        shell: true,
      });
      if (git.status === 0 && git.stdout.trim() !== '') {
        throw new Error(`ERROR: app/api not fully restored\n${git.stdout}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('ERROR: app/api')) throw e;
      console.warn('warning: could not verify git status of app/api:', e?.message ?? e);
    }

    console.log(`Tauri static export OK: out/index.html + ${found} tool pages.`);
  } finally {
    restoreApi();
  }
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
