// Firecrawl adapter — best-case (onlyMainContent, markdown). Requires FIRECRAWL_API_KEY (enable after obtaining a key).
// Note: Firecrawl bills credits per page (independent of tokens) — report it in a column separate from the token axis (see FAIRNESS.md).
export async function runFirecrawl(url) {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error('no_firecrawl_key');
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ url, onlyMainContent: true, formats: ['markdown'] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`firecrawl_http_${res.status}`);
  const data = await res.json();
  return data?.data?.markdown ?? data?.markdown ?? '';
}
