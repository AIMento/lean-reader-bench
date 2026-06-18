// raw HTML baseline — fetched as-is with no processing (worst case: feeding the whole page to an LLM).
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function runRaw(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return await res.text();
}
