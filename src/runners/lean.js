// Lean Reader — the tool under test. Shares the core directly (zero code duplication). Its dependencies resolve from ../lean-reader/node_modules.
// Returns the full result so the bench can record honesty signals (partial = static fetch got little body, e.g. on SPAs; extractor = which path won).
import { leanRead } from '../../../lean-reader/lib/core.js';

export async function runLean(url) {
  const r = await leanRead(url, { format: 'markdown' });
  return { text: r.content, partial: !!r.partial, extractor: r.extractor };
}
