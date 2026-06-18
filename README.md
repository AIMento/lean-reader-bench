# lean-reader-bench

A fair, reproducible benchmark of **token efficiency × fidelity** for web readers that feed LLMs — [Lean Reader](https://github.com/AIMento/lean-reader) vs Mozilla Readability vs raw HTML vs Jina Reader (Firecrawl pending API key).

> **Why this exists.** Most "X is N× cheaper" claims about web scrapers are vendor marketing with no measured data. This repo measures it: same corpus, same tokenizer, all raw outputs committed, every tool run at its best-case settings. If a tool wins by deleting the article body, the fidelity column shows it.

## Headline results (17/18 URLs, o200k_base)

| Comparison | Median | Note |
|---|---|---|
| Lean vs raw HTML | **~15–19×** fewer tokens (median) | range 1.5×–145× — high variance; the median moves with corpus composition (re-run `npm run bench` for the live figure) |
| Lean vs Readability+Turndown | **1.32×** fewer tokens | both extract the article body; Lean's edge is the `minimize` pass (link/image/footnote/whitespace strip), not the extractor |
| Body retention (Lean words / Readability words) | **0.99** | Lean keeps ~99% of the body Readability keeps — no silent content drop |
| Lean vs Jina Reader (all pages) | **4.75×** fewer tokens | but Lean has ~0.5× Jina's word count: Jina renders JS **and** keeps nav/edit-links/reference dumps that Lean drops |
| Lean vs Jina, fidelity-matched pages | **1.64×** fewer tokens | pages where both keep a comparable body (retention 0.7–1.5) — the conservative apples-to-apples number |

Honest caveats up front:
- The "1.32× vs Readability" is **not** the extractor being smarter — it's the `minimize` post-pass. Run both through `minimize` and they're ~par (1.04×). The real value over Readability is reliability + the raw-HTML savings, not beating Readability on tokens.
- The Jina "4.75×" is inflated: Jina ships the whole page (nav, "edit" links, full reference lists), Lean ships the article body. The fidelity-gated **1.64×** is the defensible figure. Jina also renders JavaScript; Lean is a static fetcher (see SPA caveat below).
- **Found and fixed a body-drop bug while building this.** An earlier run showed some Wikipedia pages at 0.02–0.55 body-retention — Lean's primary extractor (Defuddle) was silently dropping the body of certain large articles (e.g. neural-network returned the lead only, 370 words). The "token wins" on those pages were content deletion, not efficiency. Lean now runs **two extractors (Defuddle ‖ Readability) and keeps whichever recovers more body**, restoring retention to ~0.99. The numbers above are post-fix.
- Static-fetch limit: Lean does not execute JavaScript, so pages whose body is client-rendered (e.g. a GitHub repo landing page) extract thin. Jina/Firecrawl render JS and will win there. This is a known, honestly-reported boundary, not a bug.
- On already-clean pages (e.g. paulgraham.com) the gain over raw HTML is small (1.5×). Modern JS-heavy/bloated pages are where the 20×+ lives.

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
