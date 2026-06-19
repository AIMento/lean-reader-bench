// Benchmark runner — runs the corpus × runner matrix, measuring tokens, content volume, and latency, then aggregates.
// Local (no key needed): raw / readability / lean.  External: jina (works keyless/anonymous), firecrawl (only when a key is provided).
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { countTokens, countWords } from '../src/metrics/tokens.js';
import { runRaw } from '../src/runners/raw.js';
import { runReadability } from '../src/runners/readability.js';
import { runLean } from '../src/runners/lean.js';
import { runJina } from '../src/runners/jina.js';
import { runFirecrawl } from '../src/runners/firecrawl.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(__dirname, '..', 'results');

// jina works keyless/anonymous → always measured. firecrawl only when a key is present (no anonymous access).
const RUNNERS = { raw: runRaw, readability: runReadability, lean: runLean, jina: runJina };
if (process.env.FIRECRAWL_API_KEY) RUNNERS.firecrawl = runFirecrawl;
const usesJina = 'jina' in RUNNERS;
// Delay between URLs to stay under Jina's anonymous limit (~20 RPM). With a key the limit is higher, so no delay is needed.
const JINA_DELAY_MS = process.env.JINA_API_KEY ? 0 : 3500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const short = (u) => u.replace(/^https?:\/\//, '').replace(/^www\./, '').slice(0, 48);
const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const pct = (xs, p) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null;
};

const corpus = readFileSync(join(__dirname, '..', 'corpus', 'urls.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));

// Crash-safe / monitorable: append each completed row to a progress log as we go.
const progressPath = join(resultsDir, 'progress.jsonl');
writeFileSync(progressPath, ''); // reset

const rows = [];
let i = 0;
for (const { url, category } of corpus) {
  i++;
  const rec = { url: short(url), category };
  for (const [name, fn] of Object.entries(RUNNERS)) {
    const t0 = Date.now();
    try {
      const out = await fn(url);
      const text = typeof out === 'string' ? out : out.text;
      rec[name] = countTokens(text);
      rec[`${name}_w`] = countWords(text);
      rec[`${name}_ms`] = Date.now() - t0;
      if (name === 'lean' && typeof out === 'object') {
        rec.lean_partial = out.partial ? 1 : 0;
        rec.lean_extractor = out.extractor || '';
      }
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
  appendFileSync(progressPath, JSON.stringify(rec) + '\n');
  console.log(
    `[${i}/${corpus.length}] ${rec.url}  raw=${rec.raw ?? 'x'} read=${rec.readability ?? 'x'} lean=${rec.lean ?? 'x'}${rec.lean_partial ? '(partial)' : ''} jina=${rec.jina ?? 'x'}  l/raw=${rec['lean/raw'] ?? '-'} l/jina=${rec['lean/jina'] ?? '-'} keep=${rec.jina_keep ?? '-'}`
  );
  if (usesJina && JINA_DELAY_MS) await sleep(JINA_DELAY_MS);
}

// ===== Aggregation =====
const ok = rows.filter((r) => r.lean && r.raw && r.readability);
console.log(`\n=== Aggregate (raw/read/lean succeeded ${ok.length}/${rows.length}) ===`);
console.log('Median tokens  — raw:', median(ok.map((r) => r.raw)), '| readability:', median(ok.map((r) => r.readability)), '| lean:', median(ok.map((r) => r.lean)));
console.log('lean vs raw, median multiple:', median(ok.map((r) => r.raw / r.lean))?.toFixed(1) + 'x', `(range ${pct(ok.map((r) => r.raw / r.lean), 5)?.toFixed(1)}x–${pct(ok.map((r) => r.raw / r.lean), 95)?.toFixed(1)}x p5–p95)`);
console.log('lean vs readability token ratio (median):', median(ok.map((r) => r.readability / r.lean))?.toFixed(2) + 'x  (>1 means lean uses fewer)');
console.log('content retention proxy lean_words/read_words (median):', median(ok.map((r) => r.lean_w / r.readability_w))?.toFixed(2), '(near 1.0 = no content dropped)');

// Jina aggregation — report token advantage together with content retention (honesty: blocks a fake advantage caused by dropped content)
const jok = rows.filter((r) => r.lean && r.jina);
if (jok.length) {
  // fidelity gate: aggregate separately over only the 'fair comparison' pages where retention is 0.7-1.5 (both captured similar content)
  const fair = jok.filter((r) => r.jina_keep != null && r.jina_keep >= 0.7 && r.jina_keep <= 1.5);
  console.log(`\n=== Jina comparison (both lean & jina succeeded ${jok.length}/${rows.length}) ===`);
  console.log('lean vs jina token ratio (median, all):', median(jok.map((r) => r.jina / r.lean))?.toFixed(2) + 'x  (>1 means lean uses fewer)');
  console.log('content retention lean_words/jina_words (median):', median(jok.map((r) => r.jina_keep))?.toFixed(2), '(near 1.0 = equivalent content)');
  console.log(`median token ratio over only the ${fair.length}/${jok.length} pages passing the fidelity gate (retention 0.7-1.5):`, fair.length ? median(fair.map((r) => r.jina / r.lean))?.toFixed(2) + 'x' : 'n/a');
  const drops = jok.filter((r) => r.jina_keep != null && r.jina_keep < 0.7).map((r) => `${r.url}(${r.jina_keep})`);
  if (drops.length) console.log('⚠ Suspected missing content (lean < 0.7×jina; the token advantage may be fake):', drops.join(', '));
}

// Honesty: how often does the static fetch come back partial (SPA / JS-rendered)?
const partials = rows.filter((r) => r.lean_partial === 1);
console.log(`\nLean partial (static fetch thin body, e.g. SPA): ${partials.length}/${rows.length}${partials.length ? ' → ' + partials.map((r) => r.url).join(', ') : ''}`);

// Per-category lean-vs-raw medians
const cats = [...new Set(rows.map((r) => r.category))];
console.log('\n=== Per-category lean vs raw (median multiple) ===');
for (const c of cats) {
  const cr = ok.filter((r) => r.category === c);
  console.log(`  ${c}: ${cr.length} pages, median lean/raw ${median(cr.map((r) => r.raw / r.lean))?.toFixed(1)}x, median lean tokens ${median(cr.map((r) => r.lean))}`);
}

// ===== Save results (for auditing) =====
const header = 'url,category,raw_tokens,readability_tokens,lean_tokens,jina_tokens,lean_over_raw,lean_over_read,lean_over_jina,jina_keep,word_keep,lean_partial,lean_extractor';
const csv = [
  header,
  ...rows.map((r) =>
    [r.url, r.category, r.raw, r.readability, r.lean, r.jina, r['lean/raw'], r['lean/read'], r['lean/jina'], r['jina_keep'], r.word_keep, r.lean_partial ?? '', r.lean_extractor ?? ''].join(',')
  ),
].join('\n');
writeFileSync(join(resultsDir, 'latest.csv'), csv);
console.log('\n[saved] results/latest.csv  &  results/progress.jsonl');
