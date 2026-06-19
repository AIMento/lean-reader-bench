// Ground-truth fidelity scorer (pure recompute, NO network — like seal.js). Reads the committed hand-verified ground truth
// (corpus/groundtruth/<sha>.txt) and the frozen extractor outputs (results/rouge-cache/<sha>.{lean,read}.txt), and reports
// ROUGE-1 and ROUGE-L recall / precision / F1 of Lean (and, as an independent cross-check, Mozilla Readability) vs GT.
//
//   RECALL is primary: it answers the open question — did Lean DROP article body? (the failure mode of "cut tokens by
//   dropping content"). PRECISION is secondary (noise admitted); note GT excludes citation/reference apparatus by
//   definition, so a reference page's lower precision is mostly Lean carrying the reference list, NOT navigation chrome —
//   the missed-token diagnostic separates the two. Running Readability vs the SAME GT de-circularizes the reference bucket:
//   if Lean and Readability have ~equal recall but Lean ships fewer words (word_keep<1), the gap is noise, not body.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const gtDir = join(root, 'corpus', 'groundtruth');
const cacheDir = join(root, 'results', 'rouge-cache');
const manifest = JSON.parse(readFileSync(join(cacheDir, 'manifest.json'), 'utf8'));

// --- normalize → unicode word tokens (lowercased; markdown links/images reduced to their visible text) ---
function tokens(s) {
  if (!s) return [];
  s = s.toLowerCase();
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');   // images → drop
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');  // links → visible text
  return s.match(/[\p{L}\p{N}]+/gu) || [];
}
const freq = (arr) => { const m = new Map(); for (const t of arr) m.set(t, (m.get(t) || 0) + 1); return m; };

function rouge1(gt, cand) {
  const cg = freq(gt), cc = freq(cand);
  let overlap = 0;
  for (const [t, n] of cg) overlap += Math.min(n, cc.get(t) || 0);
  const r = gt.length ? overlap / gt.length : 0;
  const p = cand.length ? overlap / cand.length : 0;
  return { r, p, f: r + p ? (2 * r * p) / (r + p) : 0 };
}

// LCS length over integer-encoded token sequences: common prefix/suffix trim + two-row Int32 DP. O(n·m), few-M cells here.
function lcsLen(a, b) {
  const d = new Map();
  const enc = (s) => { let v = d.get(s); if (v === undefined) { v = d.size; d.set(s, v); } return v; };
  let A = a.map(enc), B = b.map(enc);
  let pre = 0; while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let sa = A.length, sb = B.length, suf = 0; while (sa > pre && sb > pre && A[sa - 1] === B[sb - 1]) { sa--; sb--; suf++; }
  A = A.slice(pre, sa); B = B.slice(pre, sb);
  if (B.length > A.length) { const t = A; A = B; B = t; }
  const m = A.length, n = B.length;
  if (n === 0) return pre + suf;
  const prev = new Int32Array(n + 1), cur = new Int32Array(n + 1);
  for (let i = 1; i <= m; i++) {
    const ai = A[i - 1];
    for (let j = 1; j <= n; j++) cur[j] = ai === B[j - 1] ? prev[j - 1] + 1 : (prev[j] >= cur[j - 1] ? prev[j] : cur[j - 1]);
    prev.set(cur);
  }
  return pre + suf + prev[n];
}
function rougeL(gt, cand) {
  const l = lcsLen(gt, cand);
  const r = gt.length ? l / gt.length : 0;
  const p = cand.length ? l / cand.length : 0;
  return { r, p, f: r + p ? (2 * r * p) / (r + p) : 0 };
}

// Diagnostic: which GT body tokens did Lean fail to keep, and are they content or apparatus/structure?
function missed(gt, cand) {
  const cg = freq(gt), cc = freq(cand);
  let digit = 0, short = 0, other = 0; const otherMap = new Map();
  for (const [t, n] of cg) {
    const def = n - (cc.get(t) || 0);
    if (def <= 0) continue;
    if (/^\d+$/.test(t)) digit += def;
    else if (t.length <= 2) short += def;
    else { other += def; otherMap.set(t, def); }
  }
  const top = [...otherMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, n]) => `${t}×${n}`);
  return { digit, short, other, top };
}

const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const f2 = (x) => x == null ? '-' : x.toFixed(2);

const rows = [];
for (const m of manifest) {
  const gtP = join(gtDir, `${m.sha}.txt`), leanP = join(cacheDir, `${m.sha}.lean.txt`), readP = join(cacheDir, `${m.sha}.read.txt`);
  if (!existsSync(gtP) || !existsSync(leanP)) { console.log(`! missing files for ${m.sha} ${m.url}`); continue; }
  const gt = tokens(readFileSync(gtP, 'utf8'));
  const lean = tokens(readFileSync(leanP, 'utf8'));
  const read = existsSync(readP) ? tokens(readFileSync(readP, 'utf8')) : [];
  const l1 = rouge1(gt, lean), lL = rougeL(gt, lean);
  const r1 = read.length ? rouge1(gt, read) : null, rL = read.length ? rougeL(gt, read) : null;
  const miss = missed(gt, lean);
  rows.push({
    sha: m.sha, url: m.url, category: m.category, gt_w: gt.length, lean_w: lean.length, read_w: read.length,
    lean_r1_recall: +l1.r.toFixed(3), lean_r1_prec: +l1.p.toFixed(3),
    lean_rougeL_recall: +lL.r.toFixed(3), lean_rougeL_prec: +lL.p.toFixed(3), lean_rougeL_f1: +lL.f.toFixed(3),
    read_rougeL_recall: rL ? +rL.r.toFixed(3) : null, read_rougeL_prec: rL ? +rL.p.toFixed(3) : null,
    missed_content_unigrams: miss.other, missed_digit: miss.digit, missed_short: miss.short, missed_top: miss.top,
  });
}
writeFileSync(join(root, 'results', 'rouge.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

// ===== report =====
const cats = ['reference', 'techdocs', 'marketing', 'blog'];
console.log('ROUGE fidelity vs hand-verified ground-truth body (recall = body preserved; precision vs prose-only GT)\n');
console.log('cat        | page                                   | gt_w | lean_w | R1-rec  RL-rec  RL-prec | readRL-rec | missed-content');
console.log('-----------|----------------------------------------|------|--------|-------------------------|------------|---------------');
for (const c of cats) for (const r of rows.filter((x) => x.category === c)) {
  const u = r.url.replace(/^https?:\/\//, '').replace(/^www\./, '').slice(0, 38);
  console.log(`${c.padEnd(10)} | ${u.padEnd(38)} | ${String(r.gt_w).padStart(4)} | ${String(r.lean_w).padStart(6)} | ${f2(r.lean_r1_recall)}    ${f2(r.lean_rougeL_recall)}    ${f2(r.lean_rougeL_prec)}    | ${f2(r.read_rougeL_recall)}       | ${r.missed_content_unigrams} (${r.missed_top.slice(0, 4).join(' ') || '—'})`);
}
console.log('\n=== MEDIANS by category (Lean) ===');
console.log('cat        | n | R1-recall | RougeL-recall | RougeL-prec | Readability RougeL-recall');
for (const c of cats) {
  const cr = rows.filter((x) => x.category === c); if (!cr.length) continue;
  console.log(`${c.padEnd(10)} | ${cr.length} |   ${f2(median(cr.map((r) => r.lean_r1_recall)))}    |     ${f2(median(cr.map((r) => r.lean_rougeL_recall)))}      |    ${f2(median(cr.map((r) => r.lean_rougeL_prec)))}     |       ${f2(median(cr.map((r) => r.read_rougeL_recall)))}`);
}
const all = rows;
console.log(`\nOVERALL (n=${all.length}): RougeL recall median ${f2(median(all.map((r) => r.lean_rougeL_recall)))}  |  R1 recall median ${f2(median(all.map((r) => r.lean_r1_recall)))}  |  RougeL prec median ${f2(median(all.map((r) => r.lean_rougeL_prec)))}`);
const ref = rows.filter((r) => r.category === 'reference');
console.log(`REFERENCE bucket (the open question): RougeL recall median ${f2(median(ref.map((r) => r.lean_rougeL_recall)))} | R1 recall median ${f2(median(ref.map((r) => r.lean_r1_recall)))} | Lean vs Readability recall: ${f2(median(ref.map((r) => r.lean_rougeL_recall)))} vs ${f2(median(ref.map((r) => r.read_rougeL_recall)))}`);
console.log('[saved] results/rouge.jsonl');
