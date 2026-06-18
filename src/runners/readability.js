// Strong open-source baseline — Mozilla Readability (Firefox Reader View) + Turndown (markdown).
// best-case: extraction followed by markdown conversion. Lean Reader has to beat this on tokens for the advantage to be real.
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function runReadability(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article || !article.content) return '';
  return td.turndown(article.content);
}
