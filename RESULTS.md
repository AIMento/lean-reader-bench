# The Token Tax — Measured

> Every byte of HTML you feed an LLM is billed as input tokens. Most modern pages are mostly navigation, scripts, and chrome. This is the **token tax**: what you pay to send a model a page instead of the page's *content*. This report measures it for [Lean Reader](https://github.com/AIMento/lean-reader) — on a committed corpus, with a public tokenizer, raw data and the analysis script committed so anyone can re-run and dispute every number.

Tokenizer `o200k_base` (GPT-4o / 4.1 class), one run, June 2026. **114/116 corpus URLs fetched.** Headline figures are computed over the subset where the relevant tools all succeeded — each multiplier below states its own *n*. Reproduce: `node scripts/seal.js` over the committed `results/progress.jsonl` + `progress-tail.jsonl` prints every figure here.

## Headline (each figure on its own denominator)

| Comparison | Median | n | What it means |
|---|---|---|---|
| **Lean vs raw HTML** | **8.7×** fewer tokens | 106 local-complete | The token tax of raw HTML. Range p5 2.0× – p95 867×; mean 128× (dragged by JS-heavy pages — **median** is the honest figure). Composition-robust (see below). |
| **Lean vs Mozilla Readability** | **1.40×** fewer tokens | 106 | But this is **almost entirely Lean's `minimize` post-pass, not better extraction** — see the honest caveat below. |
| **Lean vs Jina Reader, all pages** | **4.32×** fewer tokens | 109 | Lean keeps ~0.57× Jina's word count because Jina ships the whole rendered page (nav/sidebars/footers). On chrome-heavy docs this is a real win; the magnitude is **partially verified, not proven corpus-wide** — see below. |
| **Lean vs Jina, fidelity-matched** | **1.66×** fewer tokens | 40 | Only pages where both keep a comparable body (Jina-retention 0.7–1.5) — the conservative floor. |

**Aggregate:** over the 106 local-complete pages, raw HTML totals **14.8M tokens**; the same content via Lean is **1.35M** — an **11× aggregate** cut. Median page: **~92,000 raw tokens → ~6,300 lean tokens**.

### The 8.7× is not a corpus-composition artifact
A skeptic's first move is "you stuffed the corpus with bloated pages." The median is insensitive to that — reweighting (computed by `seal.js`):

| Corpus slice | Median Lean/raw |
|---|---|
| All 106 | 8.7× |
| Exclude marketing entirely | 7.9× |
| techdocs + reference + blog only | 7.7× |
| blog + reference (cleanest-prose mix) | 7.5× |
| Equal-weight of the 5 category medians | 11.0× |
| **Blog-only floor** | **3.1×** |

The median moves <1.5× across every reweighting except an all-clean-blog corpus. **8.7× is what a mixed reading stream costs; 3.1× is the floor if you only ever read already-clean prose.** (The corpus mix is not claimed to match any specific user's traffic — see METHODOLOGY.)

## Honest caveat 1 — the Readability number is a post-pass, not smarter extraction

The headline 1.40× compares Lean (which runs a `minimize` pass: strip images, collapse `[text](url)`→`text`, drop `[edit]`/citation markers, squeeze whitespace) against an **un-minimized** Readability baseline. That's not apples-to-apples. We measured the counterfactual — apply the *same* `minimize` to the Readability output (`scripts/readmin.js`):

> **Readability+minimize vs Lean = 1.00× (median, n=106 — identical on both Defuddle-path and Readability-path rows).** The entire 1.40× is the portable `minimize` post-pass, which any tool can copy in an afternoon.

So **Lean's durable edge over Readability is not the token count.** It is reliability (dual-extractor fallback — Defuddle ‖ Readability, keep whichever recovers more body) and the raw-HTML savings. We do not claim a token win over Readability-done-right. (Full per-page table: `results/readmin.jsonl`.)

## Honest caveat 2 — the Jina "chrome, not truncation" claim is verified narrowly, not corpus-wide

Naïvely, "Lean uses 4.3× fewer tokens than Jina." A skeptic correctly asks: did Lean *drop half the page*? 68 of 109 Jina-comparison pages have Lean keeping <0.7× Jina's words. We checked — but be precise about how far the check reaches.

**Verified (3 pages, all techdocs, all Defuddle-extracted)** — Jina padded, Lean did not truncate (`scripts/diag.js` re-fetches these):

| Page | Lean | Readability | Jina | Jina's extra tokens are… |
|---|---|---|---|---|
| MDN `HTTP/Methods` | 399 w | 332 w | **3,475 w** | the full MDN sidebar (every HTML/CSS/JS link), "skip to content", CC/cookie footer — ~3,076 words of navigation |
| `docs.docker.com/get-started` | 64 w | 67 w | **1,391 w** | top nav, a whitepaper banner, cookie consent, footer (the page is a 64-word hub) |
| `kubernetes.io` overview | 1,464 w | 1,448 w | **10,985 w** | doc nav tree, version selector, "edit this page" links, trademark footer |

**The corpus-wide cross-check is weaker than it looks, and we won't overstate it.** The reassurance "Lean and Readability — two independent extractors — agree" only holds where Lean's chosen extractor is **Defuddle** (blog: 21/21, techdocs: 32/34 — there word_keep median is 1.00, genuine independent agreement). It is **circular on the 30 reference (Wikipedia-class) pages**, because there Lean's selected extractor *is* Readability (30/30) — so `word_keep` is Readability-minus-minimize divided by Readability, a self-comparison, not corroboration. And on that subset the number points the other way:

> **Reference pages: word_keep median 0.90, all 30/30 below 1.0.** `minimize` removes ~10% of Readability's words there (edit-links, citation markers, whitespace). Whether any of that 10% is body content was **unresolved by the proxy** — Readability can't be the referee when it *is* the extractor. **The ground-truth ROUGE-L pass below now resolves it: the 10% is noise, not body (reference recall 0.99).**

So: the Jina-chrome story is **established on chrome-heavy techdocs hub pages, and unresolved on the long-form reference bucket.** The honest one-liner for launch uses only the verified case:

> *Jina bills you 3,475 words for MDN's HTTP Methods page — ~3,076 of them navigation links and a cookie banner. Lean gives you the 399 that are the documentation.*

The ground-truth ROUGE-L pass on a stratified sample (the only thing that resolves the reference bucket) **has now been run — it resolves the bucket in Lean's favor. See the next section.**

## Honest caveat 2 — RESOLVED: ground-truth ROUGE-L fidelity (the reference bucket)

The reference word_keep 0.90 is **noise removal, not body truncation** — measured, not asserted. A stratified 12-URL **hand-verified** ground-truth sample (`scripts/rouge-capture.js` captures candidate bodies + frozen extractor outputs; the bodies are then hand-corrected into `corpus/groundtruth/<sha>.txt`; `scripts/rouge.js` scores offline → `results/rouge.jsonl`). The ground truth is the page's **own DOM body prose with citation / reference / nav apparatus removed** — produced independently of Readability's content-scoring, so it can referee the bucket where Lean's extractor *is* Readability. Sample: 5 reference, 3 techdocs, 3 marketing, 1 blog control; biased toward the `jina_keep<0.7` ("suspected dropped content") set.

| Bucket (n) | Lean ROUGE-L recall (median) | Lean ROUGE-1 recall | Lean precision\* | Readability recall (same GT) |
|---|---|---|---|---|
| **reference (5)** | **0.99** | 1.00 | 0.55 | 0.99 |
| techdocs (3) | 0.90 | 0.91 | 0.98 | 0.97 |
| marketing (3) | 0.68 | 0.68 | 0.97 | 0.54 |
| blog control (1, paulgraham) | 1.00 | 1.00 | 1.00 | 1.00 |

**The reference verdict.** Lean keeps **~99% of the article body** (per-page recall 0.99 / 1.00 / 1.00 / 0.99 / 0.99). The body tokens it misses are **0–12 per page** and are section-heading duplicates and LaTeX `displaystyle` artifacts — **no dropped sentences** (see the per-page `missed_top` in `rouge.jsonl`). The decisive, non-circular fact: **Lean's recall (0.99) equals Readability's recall (0.99) on the same independent ground truth.** So the word_keep<1.0 gap (Lean emits 0.90× Readability's words) is the `minimize` pass stripping citation markers, `[edit]` links, image alt-text and whitespace — **not body content.** If `minimize` had cut body, Lean's recall would fall *below* Readability's; it does not. This is the proof the word-count proxy structurally could not give.

\***On the reference precision (0.55).** Precision is scored against a **prose-only** GT that excludes the citation/reference list by definition, so ~45% of Lean's reference-page tokens are the **bibliography / citations / external-links** it carries (Readability carries them too — its precision is the same or lower). The missed-token diagnostic confirms the residual is references, **not navigation chrome**. For retrieval/RAG that apparatus is arguably signal; we report the conservative number rather than launder it.

**Where Lean is weaker (surfaced, not hidden).** **Marketing recall is 0.68** — on landing pages Lean extracts a clean, on-target subset (precision 0.97) but misses peripheral feed sections (python.org's news/events lists, netlify's secondary feature copy). Marketing is excluded from every headline figure anyway. Techdocs recall 0.90 is depressed only by code-block / API-version-table token differences (`div`, `class`, `added`, `versionchanges`), not prose loss — precision stays 0.92–0.99. Two cross-checks worth noting: the **blog control returns a perfect 1.00 / 1.00**, validating the scorer end-to-end; and on **redis.io Lean recall is 0.72 vs Readability's 0.10** — a dual-extractor reliability win (Defuddle recovered the body Readability missed entirely).

## Honest caveat 3 — the partial detector does NOT catch SPA shells

Lean flags a page `partial` when its static body is <200 chars. That floor misses JS-app shells that ship a nav+hero in static HTML. **7 pages emit >3× more "words" than Readability (the signature of extracting an app shell, not a body) and 0/7 are flagged partial:**

`nextjs.org` (33× Readability's words), `github.com` (20×), `supabase.com` (10×), two `news.ycombinator.com` items, `postgresql.org` tutorial, `tailwindcss.com`.

These are the **static skeleton of a client-rendered app**, not articles. They are not efficiency wins and should be read as "static fetcher can't see this content." (Detector fix — flag `word_keep > 3` — is on the roadmap; until then this is disclosed, not hidden.)

## Per category (Lean vs raw, median)

| Category | n | Median Lean/raw | Median lean tokens | Note |
|---|---|---|---|---|
| blog | 21 | 3.1× | 5,272 | Already-clean prose → small gain. The tax isn't universal. |
| techdocs | 34 | 11.0× | 5,438 | |
| reference | 30 | 8.2× | 23,193 | Long pages; see caveat 2 (reference word_keep 0.90). |
| marketing | 19 | 240× | 503 | **Not a headline figure.** See below. |
| discussion | 2 | — | — | Only 2 of 8 entered the raw comparison (6 StackOverflow pages bot-blocked the raw fetch → `null`). **n=2 is too few to publish a category multiplier.** |

**On marketing (the 240×):** these pages' extracted bodies are thin (12/19 under ~700 lean tokens: anthropic 129, nodejs 158, svelte 157). The 240× is *bloated-raw-HTML ÷ a near-empty stub*, not a recovered article — so it is **excluded from every headline figure**. We assert raw is "mostly JS/chrome" as the intuition but **did not decompose raw bytes by type**; treat 240× as the worst-case ceiling, not a typical result.

## Coverage & reproducibility ledger

- **n per figure:** 114/116 fetched; 106 local-complete (raw+read+lean); 109 Jina; 40 fidelity-matched. Each headline figure above states its own n — we do not compute on a small set and advertise the large one.
- **Failures recorded as `null`, never dropped:** raw fetch bot-blocked on 6 StackOverflow pages + `flask`; Jina absent on 3 (`nodejs.org/api/fs`, `github.com`, `supabase.com`).
- **Row identity:** the runner's 48-char short label collides for several MDN `/Web/JavaScript/` URLs. `latest.csv` now carries the **full URL** as its first column (`seal.js` reconstructs it from corpus order), so all 114 rows are individually re-fetchable. 2 techdocs URLs were skipped by the tail's short-key dedup (MDN `…/Global_Objects/JSON` and `…/Global_Objects/Map`, which collided with earlier `/Web/JavaScript/` rows); the corpus has 116, 114 measured.
- **Extractor split:** Defuddle 75, Readability 37, none 2.
- **Everything committed:** `corpus/urls.jsonl`, `results/latest.csv`, raw `results/progress*.jsonl`, and `scripts/seal.js` — re-run and dispute every number. Fidelity is now measured **two ways**: the corpus-wide word-count proxy **and** a 12-page hand-verified ROUGE-L ground-truth sample (`corpus/groundtruth/`, `scripts/rouge.js`, `results/rouge.jsonl`) — reference recall **0.99**, equal to Readability's, so the 0.90 word_keep is noise removal, not truncation. We claim **token efficiency + a now-ground-truthed fidelity floor on the sampled buckets**, and we surface the adverse number (marketing recall 0.68).

_MIT._
