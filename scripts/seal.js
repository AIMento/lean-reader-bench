// Seal pass — reconstruct latest.csv from progress.jsonl (corpus[0..N-1], in order) + progress-tail.jsonl
// (the resumable remainder), and print a fully segmented, HN-tear-apart-proof aggregation. Does NOT hit the network.
// Full URLs are reconstructed from corpus order (run-bench writes rows in corpus order; run-tail replays the same
// short-key dedup) so every CSV row is individually identifiable despite the 48-char short label collisions.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(__dirname, '..', 'results');
const corpusPath = join(__dirname, '..', 'corpus', 'urls.jsonl');
const short = (u) => u.replace(/^https?:\/\//, '').replace(/^www\./, '').slice(0, 48);

const readJsonl = (p) => existsSync(p) ? readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const corpus = readFileSync(corpusPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const headRows = readJsonl(join(resultsDir, 'progress.jsonl'));     // = corpus[0 .. headRows.length-1], in order
const tailRows = readJsonl(join(resultsDir, 'progress-tail.jsonl')); // = corpus[head..] minus short-key collisions, in order
// reconstruct full URLs: head rows map 1:1 to corpus prefix; tail rows replay run-tail's dedup filter
const headShorts = new Set(corpus.slice(0, headRows.length).map((c) => short(c.url)));
headRows.forEach((r, i) => { r.full_url = corpus[i] ? corpus[i].url : ''; });
const tailFulls = corpus.slice(headRows.length).filter((c) => !headShorts.has(short(c.url)));
tailRows.forEach((r, i) => { r.full_url = tailFulls[i] ? tailFulls[i].url : ''; });
const rows = [...headRows, ...tailRows];

const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (xs, p) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null; };
const mean = (xs) => { const s = xs.filter((x) => x != null); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };
const f1 = (x) => x == null ? '-' : x.toFixed(1);
const f2 = (x) => x == null ? '-' : x.toFixed(2);

// ===== 1. Reconstruct latest.csv (13-col schema, matches run-bench.js) =====
const header = 'full_url,short,category,raw_tokens,readability_tokens,lean_tokens,jina_tokens,lean_over_raw,lean_over_read,lean_over_jina,jina_keep,word_keep,lean_partial,lean_extractor';
const csv = [header, ...rows.map((r) =>
  [r.full_url, r.url, r.category, r.raw, r.readability, r.lean, r.jina, r['lean/raw'], r['lean/read'], r['lean/jina'], r['jina_keep'], r.word_keep, r.lean_partial ?? '', r.lean_extractor ?? ''].join(','))].join('\n');
writeFileSync(join(resultsDir, 'latest.csv'), csv);
const collisions = rows.length - new Set(rows.map((r) => r.url)).size;
console.log(`[saved] results/latest.csv from ${rows.length} rows (14-col; full_url makes ${collisions} short-label collisions individually identifiable)\n`);

// ===== 2. Coverage =====
const catCount = (arr) => { const c = {}; for (const x of arr) c[x.category] = (c[x.category] || 0) + 1; return c; };
const doneCats = catCount(rows);
const allCats = catCount(corpus);
const missing = corpus.slice(rows.length);
const missCats = catCount(missing);
console.log('=== COVERAGE ===');
console.log(`corpus total: ${corpus.length} | done: ${rows.length} | missing: ${missing.length}`);
console.log('done by category :', JSON.stringify(doneCats));
console.log('corpus by category:', JSON.stringify(allCats));
console.log('MISSING by category:', JSON.stringify(missCats));

// ===== 3. Segments =====
const localOk = rows.filter((r) => r.lean && r.raw && r.readability);
const partials = rows.filter((r) => r.lean_partial === 1);
const articles = localOk.filter((r) => r.lean_partial !== 1);            // honest core: real content, static fetch succeeded
const jok = rows.filter((r) => r.lean && r.jina);
const jfair = jok.filter((r) => r.jina_keep != null && r.jina_keep >= 0.7 && r.jina_keep <= 1.5);  // fidelity gate
const jdrop = jok.filter((r) => r.jina_keep != null && r.jina_keep < 0.7);                          // lean may have dropped content

const ratioRaw = (arr) => arr.map((r) => r.raw / r.lean);
const ratioRead = (arr) => arr.map((r) => r.readability / r.lean);
const ratioJina = (arr) => arr.map((r) => r.jina / r.lean);

console.log('\n=== LEAN vs RAW (token tax of feeding raw HTML) ===');
console.log(`ALL local-complete (n=${localOk.length}):  median ${f1(median(ratioRaw(localOk)))}x  [p5 ${f1(pct(ratioRaw(localOk),5))}x – p95 ${f1(pct(ratioRaw(localOk),95))}x]  mean ${f1(mean(ratioRaw(localOk)))}x`);
console.log(`ARTICLES only, partials excluded (n=${articles.length}):  median ${f1(median(ratioRaw(articles)))}x  [p5 ${f1(pct(ratioRaw(articles),5))}x – p95 ${f1(pct(ratioRaw(articles),95))}x]  mean ${f1(mean(ratioRaw(articles)))}x`);

console.log('\n=== LEAN vs READABILITY (apples-to-apples; both are extractors) ===');
console.log(`token ratio median (n=${localOk.length}): ${f2(median(ratioRead(localOk)))}x  (>1 = lean uses fewer)`);
console.log(`token ratio median, articles only (n=${articles.length}): ${f2(median(ratioRead(articles)))}x`);
console.log(`content retention word_keep lean_w/read_w median: ${f2(median(localOk.map((r) => r.word_keep)))}  (near 1.0 = no content dropped)`);
console.log(`  word_keep p5–p95: ${f2(pct(localOk.map((r)=>r.word_keep),5))} – ${f2(pct(localOk.map((r)=>r.word_keep),95))}`);

console.log('\n=== LEAN vs JINA (vs the popular hosted reader) ===');
console.log(`token ratio median ALL (n=${jok.length}): ${f2(median(ratioJina(jok)))}x`);
console.log(`token ratio median, FIDELITY-GATED jina_keep 0.7-1.5 (n=${jfair.length}): ${f2(median(ratioJina(jfair)))}x`);
console.log(`content retention jina_keep lean_w/jina_w median (n=${jok.length}): ${f2(median(jok.map((r) => r.jina_keep)))}`);

// ===== 4. Honesty callouts =====
console.log('\n=== HONESTY CALLOUTS ===');
console.log(`Lean partial (SPA/thin static fetch) ${partials.length}/${rows.length}:`);
for (const r of partials) console.log(`   ${r.url}  l/raw=${f1(r['lean/raw'])} extractor=${r.lean_extractor} word_keep=${f2(r.word_keep)} jina_keep=${f2(r.jina_keep)}`);
console.log(`\nSuspected dropped content (jina_keep < 0.7), ${jdrop.length} pages — token win may be partly fake:`);
for (const r of jdrop.sort((a,b)=>a.jina_keep-b.jina_keep).slice(0,15)) console.log(`   ${r.url}  jina_keep=${f2(r.jina_keep)}  l/jina=${f2(r['lean/jina'])}`);
const jinaFail = rows.filter((r) => !r.jina);
console.log(`\nJina failed/absent on ${jinaFail.length} rows: ${jinaFail.map((r) => r.url).join(', ')}`);

// extractor distribution
const ext = {}; for (const r of rows) ext[r.lean_extractor || '(none)'] = (ext[r.lean_extractor || '(none)'] || 0) + 1;
console.log('\nlean extractor distribution:', JSON.stringify(ext));

// ===== 5. Per-category =====
console.log('\n=== PER-CATEGORY (lean vs raw) ===');
for (const c of [...new Set(rows.map((r) => r.category))].sort()) {
  const cr = localOk.filter((r) => r.category === c);
  const cp = rows.filter((r) => r.category === c && r.lean_partial === 1).length;
  console.log(`  ${c.padEnd(12)} n=${String(cr.length).padStart(2)}  median l/raw ${f1(median(ratioRaw(cr)))}x  median lean_tok ${median(cr.map((r) => r.lean))}  partials ${cp}`);
}

// ===== 5b. Adversarial-review verification: per-cat word_keep, extractor split, composition robustness, SPA shells =====
console.log('\n=== PER-CATEGORY word_keep (lean_w/read_w) + extractor split ===');
for (const c of [...new Set(rows.map((r) => r.category))].sort()) {
  const cr = localOk.filter((r) => r.category === c);
  const wk = cr.map((r) => r.word_keep).filter((x) => x != null);
  const below1 = wk.filter((x) => x < 1).length;
  const exts = {}; for (const r of cr) exts[r.lean_extractor || '(none)'] = (exts[r.lean_extractor || '(none)'] || 0) + 1;
  console.log(`  ${c.padEnd(12)} n=${cr.length}  word_keep median ${f2(median(wk))}  (<1.0: ${below1}/${wk.length})  extractor ${JSON.stringify(exts)}`);
}
console.log('\n=== COMPOSITION ROBUSTNESS (median lean/raw under reweighting) ===');
const medRaw = (arr) => median(arr.map((r) => r.raw / r.lean));
console.log(`  all local-complete (n=${localOk.length}): ${f1(medRaw(localOk))}x`);
console.log(`  exclude marketing: ${f1(medRaw(localOk.filter((r) => r.category !== 'marketing')))}x`);
console.log(`  techdocs+reference+blog only: ${f1(medRaw(localOk.filter((r) => ['techdocs','reference','blog'].includes(r.category))))}x`);
console.log(`  blog+reference (clean-prose mix): ${f1(medRaw(localOk.filter((r) => ['blog','reference'].includes(r.category))))}x`);
const catMeds = [...new Set(localOk.map((r) => r.category))].map((c) => median(localOk.filter((r) => r.category === c).map((r) => r.raw / r.lean)));
console.log(`  equal-weight of category medians: ${f1(median(catMeds))}x`);
console.log(`  blog-only floor: ${f1(medRaw(localOk.filter((r) => r.category === 'blog')))}x`);
console.log('\n=== SPA-SHELL CANDIDATES (word_keep > 3 = lean emitted >3x readability words = likely app shell) ===');
const shells = rows.filter((r) => r.word_keep != null && r.word_keep > 3);
for (const r of shells.sort((a,b)=>b.word_keep-a.word_keep)) console.log(`  ${r.url.padEnd(40)} word_keep=${f1(r.word_keep)} lean=${r.lean} read=${r.readability} partial=${r.lean_partial}`);
console.log(`  → ${shells.length} pages; lean_partial flagged ${shells.filter((r)=>r.lean_partial===1).length}/${shells.length} of them`);
// jina<0.7 split by extractor
const jlow = rows.filter((r) => r.lean && r.jina && r.jina_keep != null && r.jina_keep < 0.7);
const jlowCat = {}, jlowExt = {}; for (const r of jlow) { jlowCat[r.category]=(jlowCat[r.category]||0)+1; jlowExt[r.lean_extractor||'(none)']=(jlowExt[r.lean_extractor||'(none)']||0)+1; }
console.log(`\n=== jina_keep<0.7 (${jlow.length}) split — category ${JSON.stringify(jlowCat)}  extractor ${JSON.stringify(jlowExt)} ===`);

// ===== 6. Token-tax dollar framing (o200k_base; GPT-4o input ~ $2.50 / 1M tok as illustration) =====
console.log('\n=== TOKEN-TAX $ FRAMING (articles only, illustrative @ $2.50/1M input tok) ===');
const rawTok = articles.map((r) => r.raw), leanTok = articles.map((r) => r.lean);
const sumRaw = rawTok.reduce((a, b) => a + b, 0), sumLean = leanTok.reduce((a, b) => a + b, 0);
console.log(`sum raw tokens ${sumRaw} vs lean ${sumLean} over ${articles.length} pages → ${f1(sumRaw / sumLean)}x aggregate`);
console.log(`per-page median: raw ${median(rawTok)} tok ($${(median(rawTok)*2.5/1e6).toFixed(5)}) → lean ${median(leanTok)} tok ($${(median(leanTok)*2.5/1e6).toFixed(5)})`);
