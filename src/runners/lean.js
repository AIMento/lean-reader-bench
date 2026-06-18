// Lean Reader — the tool under test. Shares the core directly (zero code duplication). Its dependencies resolve from ../lean-reader/node_modules.
import { leanRead } from '../../../lean-reader/lib/core.js';

export async function runLean(url) {
  const r = await leanRead(url, { format: 'markdown' });
  return r.content;
}
