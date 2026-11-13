import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_LABELS, KASTRAL_TOOLS } from './tools-catalog';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

test('catalog: slugs, titles and shortTitles are unique and slugs are kebab-case', () => {
  const slugs = KASTRAL_TOOLS.map((t) => t.slug);
  const titles = KASTRAL_TOOLS.map((t) => t.title);
  const shortTitles = KASTRAL_TOOLS.map((t) => t.shortTitle);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(new Set(titles).size, titles.length);
  assert.equal(new Set(shortTitles).size, shortTitles.length);
  for (const slug of slugs) assert.match(slug, SLUG_RE);
});

test('catalog: every category has at least 1 tool and every tool category is labeled', () => {
  const counts: Record<string, number> = {};
  for (const tool of KASTRAL_TOOLS) {
    assert.ok(tool.category in CATEGORY_LABELS, `unknown category ${tool.category}`);
    counts[tool.category] = (counts[tool.category] ?? 0) + 1;
  }
  for (const key of Object.keys(CATEGORY_LABELS)) {
    assert.ok((counts[key] ?? 0) >= 1, `category ${key} has no tools`);
  }
});

test('catalog: required string fields are non-empty', () => {
  const fields = [
    'title',
    'shortTitle',
    'description',
    'metaTitle',
    'metaDescription',
    'engineBadge',
    'engineNotice',
  ] as const;
  for (const tool of KASTRAL_TOOLS) {
    for (const f of fields) {
      assert.equal(typeof tool[f], 'string');
      assert.ok(tool[f].trim().length > 0, `${tool.slug}.${f} is empty`);
    }
  }
});

test('catalog: engine is valid and server/hybrid tools carry an engineNotice', () => {
  for (const tool of KASTRAL_TOOLS) {
    assert.ok(['browser', 'server', 'hybrid'].includes(tool.engine), tool.slug);
    if (tool.engine === 'server' || tool.engine === 'hybrid') {
      assert.ok(tool.engineNotice.trim().length > 0, `${tool.slug} missing engineNotice`);
    }
  }
});

test('catalog: formats and extensions are consistent', () => {
  for (const tool of KASTRAL_TOOLS) {
    assert.ok(tool.outputFormats.length > 0, `${tool.slug} has no outputFormats`);
    assert.equal(new Set(tool.outputFormats).size, tool.outputFormats.length);
    assert.ok(tool.outputFormats.includes(tool.defaultOutputFormat), `${tool.slug} bad default`);
    assert.ok(tool.acceptedExtensions.length > 0, `${tool.slug} has no acceptedExtensions`);
    for (const ext of tool.acceptedExtensions) {
      assert.ok(ext === '*' || (ext.startsWith('.') && ext === ext.toLowerCase()), `${tool.slug}: ${ext}`);
    }
  }
});

test('catalog: size and batch limits are coherent', () => {
  for (const tool of KASTRAL_TOOLS) {
    assert.ok(tool.maxFileSizeMB >= 1 && tool.maxFileSizeMB <= 500, tool.slug);
    assert.ok(tool.maxBatchFiles >= 1 && tool.maxBatchFiles <= 100, tool.slug);
    if (!tool.supportsMultiple) assert.equal(tool.maxBatchFiles, 1);
    if (tool.mergesIntoSingleOutput) assert.equal(tool.supportsMultiple, true);
  }
});

test('catalog: parameters are valid', () => {
  for (const tool of KASTRAL_TOOLS) {
    const ids = tool.parameters.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const p of tool.parameters) {
      if (p.type === 'select') {
        assert.ok((p.options ?? []).length >= 2, `${tool.slug}.${p.id}`);
        assert.ok(p.options!.map((o) => o.value).includes(p.defaultValue as string), `${tool.slug}.${p.id}`);
      } else if (p.type === 'range' || p.type === 'number') {
        assert.equal(typeof p.defaultValue, 'number');
        if (p.min !== undefined && p.max !== undefined) assert.ok(p.min <= p.max);
        if (p.min !== undefined) assert.ok((p.defaultValue as number) >= p.min);
        if (p.max !== undefined) assert.ok((p.defaultValue as number) <= p.max);
        if (p.step !== undefined) assert.ok(p.step > 0);
        if (p.type === 'range') assert.equal(typeof p.unit, 'string');
      } else if (p.type === 'text') {
        assert.ok(['string', 'number'].includes(typeof p.defaultValue));
      }
    }
  }
});

test('catalog: content blocks and relations are complete', () => {
  const slugs = new Set(KASTRAL_TOOLS.map((t) => t.slug));
  for (const tool of KASTRAL_TOOLS) {
    assert.ok(tool.steps.length >= 2, `${tool.slug} steps`);
    assert.ok(tool.limitations.length >= 1, `${tool.slug} limitations`);
    assert.ok(tool.faqs.length >= 1, `${tool.slug} faqs`);
    for (const faq of tool.faqs) {
      assert.ok(faq.question.trim().length > 0, `${tool.slug} faq question`);
      assert.ok(faq.answer.trim().length > 0, `${tool.slug} faq answer`);
    }
    assert.ok(tool.relatedSlugs.length > 0, `${tool.slug} relatedSlugs`);
    for (const rel of tool.relatedSlugs) {
      assert.notEqual(rel, tool.slug);
      assert.ok(slugs.has(rel), `${tool.slug} -> unknown ${rel}`);
    }
  }
});

test('catalog: at least one popular tool overall', () => {
  assert.ok(KASTRAL_TOOLS.some((t) => t.popular));
});

test('catalog: PDF-page tools accept .pdf and every tool has a sensible output', () => {
  for (const tool of KASTRAL_TOOLS) {
    // `imagenes-a-pdf` consume imágenes y produce un PDF: no debe aceptar .pdf.
    const consumesPdf = tool.slug.includes('pdf') && tool.slug !== 'imagenes-a-pdf';
    if (consumesPdf) {
      assert.ok(tool.acceptedExtensions.includes('.pdf'), `${tool.slug} accepts no .pdf`);
    }
    const ok = tool.outputFormats.some((f) => f === 'keep' || f === 'extract' || /^[a-z0-9]+$/.test(f));
    assert.ok(ok, `${tool.slug} has no sensible output`);
  }
});
