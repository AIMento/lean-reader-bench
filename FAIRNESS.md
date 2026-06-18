# Fairness checklist (adversarial-review proof)

This benchmark is designed to survive a skeptical Hacker News / r/LocalLLaMA reading. If you can break any item below, open an issue — that's the point.

- [x] **Every tool runs at its best-case settings** (image-strip, main-content-only, markdown) — documented per runner in `src/runners/` and `METHODOLOGY.md`.
- [x] **Corpus, raw outputs, and config are committed** — anyone can re-run and dispute. Numbers come from `npm run bench`, not screenshots.
- [x] **Pricing models are separated, never summed** — token-priced (Jina) vs per-page (Firecrawl) vs free are different columns.
- [x] **Fidelity is shown, not hidden** — a token win that comes from deleting the body is visible in the body-retention column. We flag our own low-retention cases (neural-network 0.43, MCP 0.70) instead of burying them.
- [x] **Failures are recorded as `null`**, not dropped (e.g. jvns.ca failed on the first run — likely bot-block/timeout; it stays in the table).
- [x] **Cases where Lean does NOT clearly win are listed** (see below).
- [ ] **Ground-truth fidelity (ROUGE-L recall)** — not yet done; current fidelity is a Readability-relative proxy. Until then we do **not** claim a fidelity victory, only token efficiency + a retention proxy.
- [ ] **Frozen HTML snapshots** so all tools see identical input — roadmap.
- [ ] **Jina / Firecrawl measured** — pending API keys; their columns are empty, not guessed.

## Where Lean is weak or ambiguous (stated up front)
- **Already-clean pages**: paulgraham.com → only 1.5× vs raw. The token tax is a property of bloated modern pages, not a universal constant.
- **Possible over-trim on long encyclopedic pages**: low body-retention on some Wikipedia articles needs ground-truth checking. Could be Lean dropping content, could be Readability admitting navbox/table noise — unresolved until the ROUGE pass.
- **JS-rendered SPAs**: static fetch only; pages whose body is client-rendered return little. Lean reports this honestly rather than emitting empty text.

## The one honest sentence
On this corpus, Lean Reader produces **~15× fewer tokens than raw HTML (median)** and **~33% fewer than Mozilla Readability** while keeping ~95% of the body — measured with a public tokenizer on a committed corpus. The Jina/Firecrawl comparison and a ground-truth fidelity pass are not done yet, and we don't claim them.
