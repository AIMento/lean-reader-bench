// readability+minimize counterfactual — answers the "1.40x is just your minimize post-pass" attack.
// Re-fetches each URL, runs the SAME Mozilla Readability baseline, then applies lean-core's exported minimize(),
// and compares read-min tokens to lean tokens already recorded in progress*.jsonl. Local-only (no jina).
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { countTokens } from '../src/metrics/tokens.js';
import { runReadability } from '../src/runners/readability.js';
import { minimize } from '../../lean-reader/lib/core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(__dirname, '..', 'results');
const short = (u) => u.replace(/^https?:\/\//, '').replace(/^www\./, '').slice(0, 48);
const readJsonl = (p) => existsSync(p) ? readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const corpus = readFileSync(join(__dirname, '..', 'corpus', 'urls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

const headRows = readJsonl(join(resultsDir, 'progress.jsonl'));
const tailRows = readJsonl(join(resultsDir, 'progress-tail.jsonl'));
const headShorts = new Set(corpus.slice(0, headRows.length).map((c) => short(c.url)));
headRows.forEach((r, i) => { r.full_url = corpus[i]?.url || ''; });
const tailFulls = corpus.slice(headRows.length).filter((c) => !headShorts.has(short(c.url)));
tailRows.forEach((r, i) => { r.full_url = tailFulls[i]?.url || ''; });
const rows = [...headRows, ...tailRows].filter((r) => r.full_url && r.lean);

const outPath = join(resultsDir, 'readmin.jsonl');
writeFileSync(outPath, '');
const ratios = [];
let i = 0;
for (const r of rows) {
  i++;
  try {
    const out = await runReadability(r.full_url);
    const md = typeof out === 'string' ? out : out.text;
    const readmin = countTokens(minimize(md));
    const ratio = readmin && r.lean ? +(readmin / r.lean).toFixed(2) : null;        // read-min vs lean (>1 = lean still smaller)
    const rawRatio = r.readability && r.lean ? +(r.readability / r.lean).toFixed(2) : null;  // un-minimized (the headline 1.40x)
    if (ratio) ratios.push({ ratio, cat: r.category, ext: r.lean_extractor });
    appendFileSync(outPath, JSON.stringify({ url: r.url, category: r.category, lean: r.lean, readability: r.readability, readmin, readmin_over_lean: ratio, read_over_lean: rawRatio, lean_extractor: r.lean_extractor }) + '\n');
    console.log(`[${i}/${rows.length}] ${r.url.padEnd(40)} read=${r.readability} read-min=${readmin} lean=${r.lean}  read-min/lean=${ratio ?? '-'}  (raw read/lean=${rawRatio ?? '-'})`);
  } catch (e) { console.log(`[${i}/${rows.length}] ${r.url}  ERR ${e.message.slice(0, 40)}`); }
}
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const all = ratios.map((x) => x.ratio);
const ro = ratios.filter((x) => x.ext === 'readability').map((x) => x.ratio);
const de = ratios.filter((x) => x.ext === 'defuddle').map((x) => x.ratio);
console.log(`\n=== read-min/lean median (n=${all.length}): ${median(all)}x  (vs un-minimized read/lean 1.40x headline) ===`);
console.log(`  readability-path rows (n=${ro.length}): ${median(ro)}x   defuddle-path rows (n=${de.length}): ${median(de)}x`);
console.log(`[saved] results/readmin.jsonl`);
