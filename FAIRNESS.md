# Fairness checklist (adversarial-review proof)

This benchmark is designed to survive a skeptical Hacker News / r/LocalLLaMA reading. If you can break any item below, open an issue — that's the point.

- [x] **Every tool runs at its best-case settings** (image-strip, main-content-only, markdown) — documented per runner in `src/runners/` and `METHODOLOGY.md`.
- [x] **Corpus, raw outputs, and the analysis script are committed** — `corpus/urls.jsonl`, `results/progress*.jsonl`, `results/latest.csv`, `scripts/seal.js`. `node scripts/seal.js` reprints every figure in `RESULTS.md`; numbers come from committed data, not screenshots. `latest.csv` carries the full URL per row so every row is individually re-fetchable.
- [x] **Pricing models are separated, never summed** — token-priced (Jina) vs per-page (Firecrawl) vs free are different columns.
- [x] **Fidelity is shown, not hidden** — a token win from deleting the body is visible in the retention columns. We surface our own adverse numbers: reference-page word_keep median 0.90 (30/30 below 1.0), and the SPA-shell pages below.
- [x] **Failures are recorded as `null`**, not dropped (e.g. jvns.ca failed on the first run — likely bot-block/timeout; it stays in the table).
- [x] **Cases where Lean does NOT clearly win are listed** (see below).
- [x] **Readability comparison de-rigged** — the headline 1.40× is Lean's `minimize` post-pass, not better extraction. Applying the same `minimize` to the Readability baseline gives **1.00×** (measured, `scripts/readmin.js`). We do not claim a token win over Readability-done-right; the edge is reliability + raw-HTML savings.
- [x] **Jina measured** (keyless anonymous tier, 109/114 rows; 3 `null` on rate-limit/block). Firecrawl still pending an API key — its column stays empty, not guessed.
- [~] **Low Jina-retention pages — verified narrowly, not corpus-wide.** 3 techdocs hub pages (MDN/Docker/Kubernetes, all Defuddle-extracted) confirmed as Jina chrome, not Lean truncation. The Lean≈Readability cross-check is independent **only on Defuddle-path pages** (blog/techdocs, word_keep 1.00); it is **circular on the 30 reference pages** (Lean's extractor *is* Readability there), where word_keep is 0.90 — direction of loss, magnitude unresolved. 68 low-retention pages total; 3 eyeballed.
- [ ] **Ground-truth fidelity (ROUGE-L recall)** — **top roadmap item.** Hand-label a stratified sample (≥3 each: reference / marketing / techdocs) and score recall. This is the only thing that resolves the reference bucket, where Readability can't referee because it is the extractor.
- [ ] **SPA-shell detection** — `partial` is a <200-char floor and misses app shells; 7 pages (nextjs, github, supabase, …) show word_keep>3 and are unflagged. Roadmap fix: flag word_keep>3.
- [ ] **Frozen HTML snapshots** so all tools see identical input — roadmap.

## Where Lean is weak or ambiguous (stated up front)
- **Already-clean pages**: paulgraham.com → only 1.5× vs raw. The token tax is a property of bloated modern pages, not a universal constant.
- **Possible over-trim on long encyclopedic pages**: reference (Wikipedia-class) pages have word_keep median 0.90 (all 30/30 below 1.0) — `minimize` drops ~10% of Readability's words. Could be noise (edit-links, citation markers) or real content; unresolved until the ROUGE pass. We do not paper over it.
- **JS-rendered SPAs**: static fetch only. 7 pages (nextjs, github, supabase, …) return the app shell, not the post-hydration body, and our `partial` flag misses them. We disclose this rather than counting the shell as a win.

## The one honest sentence
On this 114-URL corpus, Lean Reader produces **~8.7× fewer tokens than raw HTML (median, n=106)** — composition-robust down to a 3.1× blog floor. Versus Mozilla Readability the apparent 1.40× is the portable `minimize` post-pass (1.00× once the baseline is minimized too), so the real edge there is reliability + raw savings, not tokens. Versus Jina, Lean is 4.3× lighter; the "chrome not truncation" explanation is verified on techdocs hub pages and unresolved on the reference bucket. A ground-truth ROUGE fidelity pass and Firecrawl are not done, and we don't claim them.
