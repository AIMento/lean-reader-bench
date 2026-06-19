# Methodology

## Corpus
`corpus/urls.jsonl` — one JSON object per line `{url, category}`. Categories: techdocs, reference, blog, marketing, discussion. Current corpus is 116 URLs (114 measured; 2 collide on the 48-char short-key). URLs are public, robots-permitted, non-paywalled. (Roadmap: freeze a raw-HTML snapshot per URL under `corpus/snapshots/<sha>.html` so every tool sees identical input and results stay reproducible as sites change.)

## Tokens
`js-tiktoken` with `o200k_base` ranks (GPT-4o / 4.1 class). The **same** tokenizer is used for every tool and for the in-product "receipt", so comparisons are apples-to-apples. Other models tokenize differently — a Claude/Gemini conversion table is a future appendix, not the headline.

## Cost
Two separate axes, never summed:
1. **Context cost** = output tokens × a single pinned input price (`config/prices.json`, with date + source URL). This is what every tool's output costs you to feed an LLM.
2. **Tool fee** = the tool's own pricing model. Jina is token-priced; Firecrawl is per-page credits; Readability/raw/Lean-core are free. These are different units and are reported in different columns.

## Fidelity
First-run proxy: **body-retention** = `lean_words / readability_words`. ~1.0 means Lean keeps the same body Readability keeps; well below 1.0 flags possible over-trimming; well above 1.0 means Readability missed content Lean caught (e.g. SPA pages, HN comments).

This is a proxy, not truth — Readability is not ground truth. The real pass (roadmap): hand-label the correct article body per URL into `corpus/groundtruth/<sha>.txt`, then score **ROUGE-L recall** (body preserved) as the primary metric and precision (noise admitted) as secondary. Recall is primary because the failure we most need to catch is "cut tokens by dropping the article."

## Runner fairness (best-case for each)
- **raw**: `fetch()` as-is (worst-case upper bound).
- **readability**: `@mozilla/readability` + `jsdom` + Turndown markdown.
- **lean**: Lean Reader core (shared code, no duplication).
- **jina** *(measured, keyless anonymous tier)*: `x-respond-with: markdown` + image-strip + anchor-only links (best-case, no base64 bloat). Anonymous tier rate-limits (~20 RPM, intermittent 503) — the runner spaces requests 3.5s; a few rows record `null`.
- **firecrawl** *(pending)*: `scrape` + `onlyMainContent: true` + `formats: ['markdown']`.

All runners: same URL, same timeout, failures recorded as `null` (never hidden). Run 3× and take the median when latency matters.
