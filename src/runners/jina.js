// Jina Reader adapter — best-case settings (strip images, anchor-only).
// Keyless (anonymous) operation verified (2026-06-18): r.jina.ai returns 200 OK without a key. A key only raises the rate limit (optional).
// If JINA_API_KEY is set, send it as a Bearer token (higher limit); otherwise run anonymously — measured openly, nothing hidden.
const UA = 'lean-reader-bench/0.1';

export async function runJina(url) {
  const key = process.env.JINA_API_KEY;
  const headers = {
    'x-respond-with': 'markdown',
    'x-retain-images': 'none', // best-case: remove base64 images
    'x-with-links-summary': 'false',
    'user-agent': UA,
  };
  if (key) headers.authorization = `Bearer ${key}`; // present = higher limit, absent = anonymous
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers,
    signal: AbortSignal.timeout(40000),
  });
  if (!res.ok) throw new Error(`jina_http_${res.status}`);
  return await res.text();
}
