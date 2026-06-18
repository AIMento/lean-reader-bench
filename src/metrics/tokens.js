// Token measurement — o200k_base (GPT-4o/4.1 family). Both billing estimates and the benchmark use the same tokenizer to stay honest.
import { getEncoding } from 'js-tiktoken';

const enc = getEncoding('o200k_base');

export const countTokens = (s) => (s ? enc.encode(s).length : 0);

// Helper: word count (proxy for content volume — a first-pass indicator before precise fidelity measurement)
export const countWords = (s) => (s ? s.trim().split(/\s+/).filter(Boolean).length : 0);
