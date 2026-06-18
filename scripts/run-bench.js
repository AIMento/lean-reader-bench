// Benchmark runner — runs the corpus × runner matrix, measuring tokens, content volume, and latency, then aggregates.
// Local (no key needed): raw / readability / lean.  External: jina (works keyless/anonymous), firecrawl (only when a key is provided).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { countTokens, countWords } from '../src/metrics/tokens.js';
import { runRaw } from '../src/runners/raw.js';
import { runReadability } from '../src/runners/readability.js';
import { runLean } from '../src/runners/lean.js';
import { runJina } from '../src/runners/jina.js';
import { runFirecrawl } from '../src/runners/firecrawl.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// jina works keyless/anonymous → always measured. firecrawl only when a key is present (no anonymous access).
const RUNNERS = { raw: runRaw, readability: runReadability, lean: runLean, jina: runJina };
if (process.env.FIRECRAWL_API_KEY) RUNNERS.firecrawl = runFirecrawl;
const usesJina = 'jina' in RUNNERS;
// Delay between URLs to stay under Jina's anonymous limit (~20 RPM). With a key the limit is higher, so no delay is needed.
const JINA_DELAY_MS = process.env.JINA_API_KEY ? 0 : 3500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const short = (u) => u.replace(/^https?:\/\//, '').replace(/^www\./, '').slice(0, 40);
const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

const corpus = readFileSync(join(__dirname, '..', 'corpus', 'urls.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));

const rows = [];
for (const { url, category } of corpus) {
  const rec = { url: short(url), category };
  for (const [name, fn] of Object.entries(RUNNERS)) {
    const t0 = Date.now();
    try {
      const text = await fn(url);
      rec[name] = countTokens(text);
      rec[`${name}_w`] = countWords(text);
      rec[`${name}_ms`] = Date.now() - t0;
    } catch (e) {
      rec[name] = null;
      rec[`${name}_err`] = e.message.slice(0, 24);
    }
  }
  rec['lean/raw'] = rec.lean && rec.raw ? +(rec.raw / rec.lean).toFixed(1) : null;
  rec['lean/read'] = rec.lean && rec.readability ? +(rec.readability / rec.lean).toFixed(2) : null;
  // vs Jina: token ratio (>1 = lean uses fewer) + content retention (lean words / jina words, near 1.0 = no content dropped).
  // Jina renders JS, Lean does a static fetch → on SPAs a token advantage may actually be 'missing content', so the retention column is mandatory (for honesty).
  rec['lean/jina'] = rec.lean && rec.jina ? +(rec.jina / rec.lean).toFixed(2) : null;
  rec['jina_keep'] = rec.lean_w && rec.jina_w ? +(rec.lean_w / rec.jina_w).toFixed(2) : null;
  // content retention proxy: lean word count / readability word count (near 1.0 = no content dropped)
  rec['word_keep'] = rec.lean_w && rec.readability_w ? +(rec.lean_w / rec.readability_w).toFixed(2) : null;
  rows.push(rec);
  if (usesJina && JINA_DELAY_MS) await sleep(JINA_DELAY_MS);
}

console.table(
  rows.map((r) => ({
    url: r.url,
    cat: r.category,
    raw: r.raw,
    read: r.readability,
    lean: r.lean,
    jina: r.jina,
    'lean/raw': r['lean/raw'],
    'lean/read': r['lean/read'],
    'lean/jina': r['lean/jina'],
    jina_keep: r['jina_keep'],
    word_keep: r.word_keep,
  }))
);

// Aggregation
const ok = rows.filter((r) => r.lean && r.raw && r.readability);
console.log(`\n=== Aggregate (raw/read/lean succeeded ${ok.length}/${rows.length}) ===`);
console.log('Median tokens  — raw:', median(ok.map((r) => r.raw)), '| readability:', median(ok.map((r) => r.readability)), '| lean:', median(ok.map((r) => r.lean)));
console.log('lean vs raw, median multiple:', median(ok.map((r) => r.raw / r.lean)).toFixed(1) + 'x');
console.log('lean vs readability token ratio (median):', median(ok.map((r) => r.readability / r.lean)).toFixed(2) + 'x  (>1 means lean uses fewer)');
console.log('content retention proxy lean_words/read_words (median):', median(ok.map((r) => r.lean_w / r.readability_w)).toFixed(2), '(near 1.0 = no content dropped)');

// Jina aggregation — report token advantage together with content retention (honesty: blocks a fake advantage caused by dropped content)
const jok = rows.filter((r) => r.lean && r.jina);
if (jok.length) {
  // fidelity gate: aggregate separately over only the 'fair comparison' pages where retention is 0.7-1.5 (both captured similar content)
  const fair = jok.filter((r) => r.jina_keep != null && r.jina_keep >= 0.7 && r.jina_keep <= 1.5);
  console.log(`\n=== Jina comparison (both lean & jina succeeded ${jok.length}/${rows.length}) ===`);
  console.log('lean vs jina token ratio (median, all):', median(jok.map((r) => r.jina / r.lean)).toFixed(2) + 'x  (>1 means lean uses fewer)');
  console.log('content retention lean_words/jina_words (median):', median(jok.map((r) => r.jina_keep)).toFixed(2), '(near 1.0 = equivalent content)');
  console.log(`median token ratio over only the ${fair.length}/${jok.length} pages passing the fidelity gate (retention 0.7-1.5):`, fair.length ? median(fair.map((r) => r.jina / r.lean)).toFixed(2) + 'x' : 'n/a');
  const drops = jok.filter((r) => r.jina_keep != null && r.jina_keep < 0.7).map((r) => `${r.url}(${r.jina_keep})`);
  if (drops.length) console.log('⚠ Suspected missing content (lean < 0.7×jina; the token advantage may be fake):', drops.join(', '));
}

// Save results (for auditing)
const header = 'url,category,raw_tokens,readability_tokens,lean_tokens,jina_tokens,lean_over_raw,lean_over_read,lean_over_jina,jina_keep,word_keep';
const csv = [header, ...rows.map((r) => [r.url, r.category, r.raw, r.readability, r.lean, r.jina, r['lean/raw'], r['lean/read'], r['lean/jina'], r['jina_keep'], r.word_keep].join(','))].join('\n');
writeFileSync(join(__dirname, '..', 'results', 'latest.csv'), csv);
console.log('\n[saved] results/latest.csv');
