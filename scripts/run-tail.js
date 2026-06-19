// Resumable tail runner — completes the corpus WITHOUT redoing the 84 done rows.
// Skips any short-url already present in progress.jsonl OR progress-tail.jsonl, appends remainder to progress-tail.jsonl.
// Re-run safely after any stall: it continues where it left off (no reset, no collision with progress.jsonl).
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { countTokens, countWords } from '../src/metrics/tokens.js';
import { runRaw } from '../src/runners/raw.js';
import { runReadability } from '../src/runners/readability.js';
import { runLean } from '../src/runners/lean.js';
import { runJina } from '../src/runners/jina.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(__dirname, '..', 'results');
const RUNNERS = { raw: runRaw, readability: runReadability, lean: runLean, jina: runJina };
const JINA_DELAY_MS = 3500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (u) => u.replace(/^https?:\/\//, '').replace(/^www\./, '').slice(0, 48);

const corpus = readFileSync(join(__dirname, '..', 'corpus', 'urls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

// build done-set from BOTH files
const doneSet = new Set();
const loadDone = (p) => { if (existsSync(p)) for (const l of readFileSync(p, 'utf8').trim().split('\n').filter(Boolean)) doneSet.add(JSON.parse(l).url); };
loadDone(join(resultsDir, 'progress.jsonl'));
const tailPath = join(resultsDir, 'progress-tail.jsonl');
loadDone(tailPath);
if (!existsSync(tailPath)) writeFileSync(tailPath, '');

const todo = corpus.filter(({ url }) => !doneSet.has(short(url)));
console.log(`corpus ${corpus.length} | already done ${doneSet.size} | TODO ${todo.length}`);

let i = 0;
for (const { url, category } of todo) {
  i++;
  const rec = { url: short(url), category };
  for (const [name, fn] of Object.entries(RUNNERS)) {
    try {
      const out = await fn(url);
      const text = typeof out === 'string' ? out : out.text;
      rec[name] = countTokens(text);
      rec[`${name}_w`] = countWords(text);
      if (name === 'lean' && typeof out === 'object') { rec.lean_partial = out.partial ? 1 : 0; rec.lean_extractor = out.extractor || ''; }
    } catch (e) { rec[name] = null; rec[`${name}_err`] = e.message.slice(0, 24); }
  }
  rec['lean/raw'] = rec.lean && rec.raw ? +(rec.raw / rec.lean).toFixed(1) : null;
  rec['lean/read'] = rec.lean && rec.readability ? +(rec.readability / rec.lean).toFixed(2) : null;
  rec['lean/jina'] = rec.lean && rec.jina ? +(rec.jina / rec.lean).toFixed(2) : null;
  rec['jina_keep'] = rec.lean_w && rec.jina_w ? +(rec.lean_w / rec.jina_w).toFixed(2) : null;
  rec['word_keep'] = rec.lean_w && rec.readability_w ? +(rec.lean_w / rec.readability_w).toFixed(2) : null;
  appendFileSync(tailPath, JSON.stringify(rec) + '\n');
  console.log(`[tail ${i}/${todo.length}] ${rec.url}  raw=${rec.raw ?? 'x'} read=${rec.readability ?? 'x'} lean=${rec.lean ?? 'x'}${rec.lean_partial ? '(partial)' : ''} jina=${rec.jina ?? 'x'}  l/raw=${rec['lean/raw'] ?? '-'} l/jina=${rec['lean/jina'] ?? '-'} keep=${rec.jina_keep ?? '-'}`);
  if (JINA_DELAY_MS) await sleep(JINA_DELAY_MS);
}
console.log(`\n[tail done] appended ${i} rows to results/progress-tail.jsonl`);
