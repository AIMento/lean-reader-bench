// Ground-truth fidelity capture (network, one-off). Produces, per sampled URL:
//   corpus/groundtruth/<sha>.txt        — CANDIDATE article-body text (DOM-structure-targeted, apparatus removed).
//                                          Hand-verified/corrected after this run; that file is the ground truth.
//   results/rouge-cache/<sha>.lean.txt  — Lean Reader's committed output at capture time (so scoring is reproducible offline).
//   results/rouge-cache/<sha>.read.txt  — Mozilla Readability+Turndown output (diagnostic second extractor vs the SAME GT).
//   results/rouge-cache/manifest.json   — sha -> {url, category, word counts}. Drives scripts/rouge.js (pure recompute, no net).
//
// GT independence: the body is the page's own semantic DOM text (block elements inside the main container, serialized with
// boundaries preserved), NOT Readability's content-scoring output. Wikipedia apparatus (citation sups, reflists, navboxes,
// infoboxes, and the trailing See also / References / External links sections) is removed so GT = the readable article body
// a human would call "the article" — the exact target the word_keep proxy cannot referee on the reference bucket.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { countWords } from '../src/metrics/tokens.js';
import { leanRead } from '../../lean-reader/lib/core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const gtDir = join(root, 'corpus', 'groundtruth');
const cacheDir = join(root, 'results', 'rouge-cache');
mkdirSync(gtDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

export const sha = (u) => createHash('sha1').update(u).digest('hex').slice(0, 12);
const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Stratified sample (14). Weighted toward low-retention / suspected-drop pages. Sizes kept hand-verifiable except the two
// reference giants (structure-verified: head/tail/section hierarchy checked vs live, not full-read).
// ref(7): resolve the reference bucket — span the FULL word_keep range 0.84-0.91, incl. both lowest-wk giants (WWII, Evolution).
// tech(3): incl. MDN flex (wk 0.69, biggest drop). mkt(3): the word_keep<1 marketing pages (lean emitted FEWER words than
// readability). blog(1): clean-prose scorer control.
export const SAMPLE = [
  { url: 'https://en.wikipedia.org/wiki/Model_Context_Protocol', category: 'reference' },     // wk0.87 jk0.18
  { url: 'https://en.wikipedia.org/wiki/Docker_(software)', category: 'reference' },           // wk0.91 jk0.46
  { url: 'https://en.wikipedia.org/wiki/Application_programming_interface', category: 'reference' }, // wk0.91 jk0.57
  { url: 'https://en.wikipedia.org/wiki/Object-oriented_programming', category: 'reference' }, // wk0.86 jk0.48
  { url: 'https://en.wikipedia.org/wiki/Functional_programming', category: 'reference' },      // wk0.87 jk0.57
  { url: 'https://en.wikipedia.org/wiki/World_War_II', category: 'reference' },                 // wk0.84 jk0.71 — lowest-wk giant
  { url: 'https://en.wikipedia.org/wiki/Evolution', category: 'reference' },                    // wk0.84 jk0.59 — lowest-wk giant
  { url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/flex', category: 'techdocs' },      // wk0.69 jk0.17 (top suspect)
  { url: 'https://docs.github.com/en/get-started/start-your-journey/hello-world', category: 'techdocs' }, // wk0.92 jk0.53
  { url: 'https://nodejs.org/api/path.html', category: 'techdocs' },                           // wk0.93 jk0.61
  { url: 'https://www.python.org', category: 'marketing' },                                     // wk0.89 jk0.08
  { url: 'https://redis.io', category: 'marketing' },                                           // wk0.84 jk0.12
  { url: 'https://www.netlify.com', category: 'marketing' },                                    // wk0.97 jk0.16
  { url: 'https://www.paulgraham.com/avg.html', category: 'blog' },                             // wk1.00 jk0.98 (control)
];

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return await res.text();
}

// Apparatus selectors stripped from EVERY page before body extraction (chrome, not body).
const STRIP = [
  'script', 'style', 'noscript', 'template', 'svg', 'nav', 'header', 'footer', 'aside', 'form', 'button',
  '[role=navigation]', '[role=banner]', '[role=contentinfo]', '[role=search]', '[aria-hidden=true]', '[hidden]',
  // Wikipedia/MediaWiki apparatus
  'sup.reference', '.reference', '.reflist', '.mw-references-wrap', 'ol.references', '.refbegin', '.refn',
  '.navbox', '.vertical-navbox', '.sidebar', '.infobox', '.metadata', '.mw-editsection', '.mw-jump-link',
  '.toc', '#toc', '.hatnote', '.shortdescription', '.noprint', '.mw-empty-elt', '.ambox', '.mbox-small',
  '.thumbcaption', 'table.sidebar', '.portal', '.navigation-not-searchable', '.sistersitebox', '.side-box',
  '.gallery', '.plainlinks', 'figure', '.mw-jump-link', 'link', 'figcaption',
  // MDN / docs apparatus
  '.document-toc', '.metadata', '.prev-next', '.breadcrumbs', '.bc-data', '.on-github', '.section-content > .notecard.experimental',
];

// Wikipedia: trailing apparatus sections that are not article body (link/citation apparatus).
const WIKI_TRAILING = new Set(['see_also', 'references', 'notes', 'citations', 'sources', 'footnotes',
  'external_links', 'further_reading', 'bibliography', 'works_cited', 'explanatory_notes', 'general_references', 'gallery']);

function trimWikiTrailing(container) {
  const kids = [...container.children];
  let cut = -1;
  for (let i = 0; i < kids.length; i++) {
    const el = kids[i];
    const h = el.matches('h2,h3') ? el : el.querySelector(':scope > h2, :scope > h3');
    if (!h) continue;
    const id = (h.id || el.id || h.textContent || '').trim().toLowerCase().replace(/\[edit\]/g, '').replace(/\s+/g, '_');
    if (WIKI_TRAILING.has(id)) { cut = i; break; }
  }
  if (cut >= 0) for (let i = kids.length - 1; i >= cut; i--) kids[i].remove();
}

// Minimal strip set — fallback for SPA/marketing pages whose hero lives inside <header>/<aside> that the full set removes.
const MIN_STRIP = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'nav', 'link'];

// Serialize a container to body text. Boundaries preserved by replacing <br>/<hr> with newlines and appending a newline to
// every block element before reading textContent — so content is NEVER dropped (unlike a leaf-only heuristic).
function serialize(container, doc) {
  container.querySelectorAll('br').forEach((b) => b.replaceWith(doc.createTextNode('\n')));
  container.querySelectorAll('hr').forEach((b) => b.replaceWith(doc.createTextNode('\n')));
  const SEP = 'p,div,section,li,ul,ol,dl,dt,dd,blockquote,pre,h1,h2,h3,h4,h5,h6,table,thead,tbody,tr,article,details,summary,main';
  for (const el of container.querySelectorAll(SEP)) el.appendChild(doc.createTextNode('\n'));
  const lines = (container.textContent || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  for (const l of lines) if (out[out.length - 1] !== l) out.push(l); // collapse consecutive dupes (repeated nav-ish leaves)
  return out.join('\n');
}

function extractBody(html, url) {
  const host = new URL(url).hostname;
  const build = (stripList) => {
    const doc = new JSDOM(html, { url }).window.document;
    for (const sel of stripList) { try { doc.querySelectorAll(sel).forEach((el) => el.remove()); } catch {} }
    let container = null;
    if (host.endsWith('wikipedia.org')) {
      // Several .mw-parser-output nodes can exist (infobox stubs etc.) — take the largest (the real article body).
      const cands = [...doc.querySelectorAll('.mw-parser-output')];
      container = cands.sort((a, b) => (b.textContent || '').length - (a.textContent || '').length)[0] || doc.querySelector('#mw-content-text');
      if (container) trimWikiTrailing(container);
    }
    if (!container) {
      // First semantic container with substantial text; else the largest; else body. (Guards against empty <main> shells.)
      const order = ['main', 'article', '[role=main]', '#content', '#apicontent'].map((s) => doc.querySelector(s)).filter(Boolean);
      container = order.find((el) => countWords(el.textContent || '') >= 80) || order.sort((a, b) => (b.textContent || '').length - (a.textContent || '').length)[0] || doc.body;
      if (countWords(container.textContent || '') < 80) container = doc.body;
    }
    return serialize(container, doc);
  };
  let txt = build(STRIP);
  if (countWords(txt) < 40) txt = build(MIN_STRIP); // SPA/marketing hero lived inside stripped chrome → retry minimally
  return txt;
}

const manifest = [];
for (const { url, category } of SAMPLE) {
  const id = sha(url);
  const rec = { sha: id, url, category };
  // Idempotency guard: once a page is captured, its GT may be HAND-CORRECTED. Never clobber committed ground truth or the
  // frozen lean/read caches (the scoring inputs). To re-capture a page, delete its corpus/groundtruth/<sha>.txt first.
  if (existsSync(join(gtDir, `${id}.txt`))) {
    rec.skipped = 'exists (hand-verified GT preserved)';
    manifest.push(rec);
    console.log(`[${id}] ${category.padEnd(9)} ${url}  — SKIP (committed GT preserved)`);
    continue;
  }
  let html = null;
  try { html = await fetchHtml(url); } catch (e) { rec.fetch_err = e.message.slice(0, 40); }
  if (html) {
    try { const gt = extractBody(html, url); writeFileSync(join(gtDir, `${id}.txt`), gt); rec.gt_words = countWords(gt); }
    catch (e) { rec.gt_err = e.message.slice(0, 40); }
    try {
      const dom = new JSDOM(html, { url });
      const art = new Readability(dom.window.document).parse();
      const readMd = art && art.content ? td.turndown(art.content) : '';
      writeFileSync(join(cacheDir, `${id}.read.txt`), readMd); rec.read_words = countWords(readMd);
    } catch (e) { rec.read_err = e.message.slice(0, 40); }
  }
  try {
    const r = await leanRead(url, { format: 'markdown' });
    writeFileSync(join(cacheDir, `${id}.lean.txt`), r.content || '');
    rec.lean_words = countWords(r.content || ''); rec.lean_extractor = r.extractor; rec.lean_partial = r.partial ? 1 : 0;
  } catch (e) { rec.lean_err = e.message.slice(0, 40); }
  manifest.push(rec);
  console.log(`[${id}] ${category.padEnd(9)} ${url}`);
  console.log(`        gt_w=${rec.gt_words ?? 'x'} lean_w=${rec.lean_words ?? 'x'}(${rec.lean_extractor ?? '-'}${rec.lean_partial ? ',partial' : ''}) read_w=${rec.read_words ?? 'x'}` + (rec.fetch_err || rec.gt_err || rec.lean_err || rec.read_err ? `  ERR fetch=${rec.fetch_err ?? '-'} gt=${rec.gt_err ?? '-'} lean=${rec.lean_err ?? '-'} read=${rec.read_err ?? '-'}` : ''));
}
writeFileSync(join(cacheDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n[saved] ${manifest.length} pages → corpus/groundtruth/ + results/rouge-cache/`);
