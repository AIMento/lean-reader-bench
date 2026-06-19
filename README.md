# lean-reader-bench

A fair, reproducible benchmark of **token efficiency × fidelity** for web readers that feed LLMs — [Lean Reader](https://github.com/AIMento/lean-reader) vs Mozilla Readability vs raw HTML vs Jina Reader (Firecrawl pending API key).

> **Why this exists.** Most "X is N× cheaper" claims about web scrapers are vendor marketing with no measured data. This repo measures it: same corpus, same tokenizer, all raw outputs committed, every tool run at its best-case settings. If a tool wins by deleting the article body, the fidelity column shows it.

## Headline results (114/116 URLs, o200k_base)

> Full write-up with per-page receipts, per-category tables, and the honesty ledger: **[RESULTS.md](RESULTS.md)**.

| Comparison | Median | Note |
|---|---|---|
| Lean vs raw HTML | **8.7×** fewer tokens (median) | range p5 2.0×–p95 867×; mean 128× is dragged up by JS-heavy marketing pages, so the **median** is the honest figure |
| Lean vs Readability+Turndown | **1.40×** fewer tokens | **but this is the `minimize` post-pass, not extraction:** apply the same `minimize` to Readability and it's **1.00×** (measured, `scripts/readmin.js`). Lean's real edge over Readability is reliability + the raw-HTML savings, not tokens. |
| Body retention (Lean words / Readability words) | **1.00** | Lean keeps ~100% of the body Readability keeps (0.85 at p5) — no silent content drop |
| Lean vs Jina Reader (all pages) | **4.32×** fewer tokens | Lean has ~0.57× Jina's word count: Jina keeps nav/edit-links/reference dumps Lean drops. Verified as Jina chrome (not Lean truncation) on techdocs hub pages; **unresolved on the reference bucket** (see RESULTS.md) |
| Lean vs Jina, fidelity-matched pages | **1.66×** fewer tokens | pages where both keep a comparable body (retention 0.7–1.5) — the conservative apples-to-apples number |

Honest caveats up front:
- The "1.40× vs Readability" is **not** the extractor being smarter — it's the `minimize` post-pass stripping link/markup tokens. The real value over Readability is reliability + the raw-HTML savings, not beating Readability on content.
- The Jina "4.32×" looks inflated but is real on chrome-heavy docs: Jina ships the whole rendered page (nav, "edit" links, cookie banners, full reference lists), Lean ships the article body. On MDN's HTTP Methods page Jina returns 3,475 words to Lean's 399 — ~3,076 of them navigation. Verified on 3 techdocs hub pages; the long-form reference bucket is unresolved pending a ground-truth pass. The fidelity-gated **1.66×** is the conservative floor. Jina also renders JavaScript; Lean is a static fetcher (see SPA caveat below).
- **Found and fixed a body-drop bug while building this.** An earlier run showed some Wikipedia pages at 0.02–0.55 body-retention — Lean's primary extractor (Defuddle) was silently dropping the body of certain large articles (e.g. neural-network returned the lead only, 370 words). The "token wins" on those pages were content deletion, not efficiency. Lean now runs **two extractors (Defuddle ‖ Readability) and keeps whichever recovers more body**, restoring retention to ~0.99. The numbers above are post-fix.
- Static-fetch limit: Lean does not execute JavaScript, so pages whose body is client-rendered (e.g. a GitHub repo landing page) extract thin. Jina/Firecrawl render JS and will win there. This is a known, honestly-reported boundary, not a bug.
- On already-clean pages (e.g. paulgraham.com) the gain over raw HTML is small (~1.5×); the blog-category median is 3.1×. The huge per-page ratios (marketing 240×) come from JS-heavy pages whose extracted body is a near-empty stub — that's raw-÷-stub arithmetic, excluded from every headline figure, not a recovered article.

## Run it

```bash
npm install
npm run bench          # raw / readability / lean across corpus/urls.jsonl
# results/latest.csv written; all numbers reproducible from committed corpus
```

## What's measured

- **Tokens**: `js-tiktoken` `o200k_base` (GPT-4o/4.1 class). Same tokenizer everywhere.
- **Body retention proxy**: word-count ratio vs Readability (1.0 ≈ keeps the same body). A real ground-truth fidelity pass (ROUGE-L recall vs hand-labeled body) is the next step.
- **Tools** at best-case: raw `fetch`; Readability + Turndown markdown; Lean Reader; Jina Reader (`r.jina.ai`, anonymous tier, `x-retain-images: none`); Firecrawl (runner ready, needs API key).

See `METHODOLOGY.md` for measurement details and `FAIRNESS.md` for the adversarial-review checklist.

_MIT. Corpus, raw outputs, and config are committed so anyone can re-run and dispute the numbers._
