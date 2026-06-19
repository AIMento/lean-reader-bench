// Diagnostic — resolve the jina_keep<0.7 question: did LEAN drop real content, or did JINA drag in nav/chrome?
// Re-fetch a few worst-offender techdocs through lean + readability + jina, print head/tail so we can EYEBALL it.
import { runLean } from '../src/runners/lean.js';
import { runReadability } from '../src/runners/readability.js';
import { runJina } from '../src/runners/jina.js';
import { countWords } from '../src/metrics/tokens.js';

const URLS = [
  'https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods',   // jina_keep 0.11
  'https://docs.docker.com/get-started/',                         // jina_keep 0.04 (worst)
  'https://kubernetes.io/docs/concepts/overview/',                // jina_keep 0.13
];
const W = (s) => countWords(s);
const head = (s, n = 500) => (s || '').replace(/\s+/g, ' ').slice(0, n);
const tail = (s, n = 350) => (s || '').replace(/\s+/g, ' ').slice(-n);

for (const url of URLS) {
  console.log('\n' + '='.repeat(90) + `\nURL: ${url}`);
  let lean, read, jina;
  try { const o = await runLean(url); lean = o.text; console.log(`LEAN words=${W(lean)} extractor=${o.extractor} partial=${o.partial}`); } catch (e) { console.log('LEAN ERR', e.message); }
  try { const o = await runReadability(url); read = typeof o === 'string' ? o : o.text; console.log(`READ words=${W(read)}`); } catch (e) { console.log('READ ERR', e.message); }
  try { const o = await runJina(url); jina = typeof o === 'string' ? o : o.text; console.log(`JINA words=${W(jina)}`); } catch (e) { console.log('JINA ERR', e.message); }

  console.log(`\n--- LEAN head ---\n${head(lean)}`);
  console.log(`--- LEAN tail ---\n${tail(lean)}`);
  console.log(`\n--- JINA head ---\n${head(jina)}`);
  console.log(`--- JINA tail ---\n${tail(jina)}`);
  await new Promise((r) => setTimeout(r, 3500)); // stay under jina anon limit
}
