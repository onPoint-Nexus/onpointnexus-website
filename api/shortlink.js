// Vercel Edge Function — /api/shortlink
//   POST → create a short link (returns { code, url })
//   GET  ?c=<code> → resolve a short link (returns stored params)
//
// Storage: Vercel KV (REST API — no npm package needed).
// Required env vars:
//   KV_REST_API_URL
//   KV_REST_API_TOKEN
//   LB_PASSWORD         — same password as /_/link-builder
//
// If KV env vars are missing, POST returns 503 with a helpful message
// so misconfiguration is caught early instead of failing silently.

export const config = { runtime: 'edge' };

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/O/1/l/I
const CODE_LEN = 5;
const MAX_CREATE_ATTEMPTS = 6;
const BASE_URL = 'https://www.onpointnexus.com';

// ─── KV helpers (REST API) ───────────────────────────────────────
async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return { error: 'kv-not-configured' };
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { 'Authorization': `Bearer ${tok}` }
  });
  if (!r.ok) return { error: 'kv-fetch-failed', status: r.status };
  const j = await r.json();
  return { value: j.result };
}

async function kvSetNX(key, value, ttlSeconds) {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return { error: 'kv-not-configured' };
  const payload = ['SET', key, value, 'NX'];
  if (ttlSeconds) payload.push('EX', String(ttlSeconds));
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) return { error: 'kv-set-failed', status: r.status };
  const j = await r.json();
  return { ok: j.result === 'OK' };
}

async function kvIncr(key) {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return;
  await fetch(`${url}/incr/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tok}` }
  }).catch(() => {});
}

// ─── Utils ──────────────────────────────────────────────────────
function randomCode() {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function clip(v, n) { return v == null ? '' : String(v).slice(0, n).trim(); }

function buildLandingUrl(params) {
  const q = new URLSearchParams();
  if (params.n) q.set('n', params.n);
  if (params.m) q.set('m', params.m);
  if (params.p) q.set('p', params.p);
  if (params.src) q.set('src', params.src);
  return `${BASE_URL}/hello?${q.toString()}`;
}

// ─── Handler ────────────────────────────────────────────────────
export default async function handler(req) {
  const url = new URL(req.url);

  // GET: resolve code → return params or 404
  if (req.method === 'GET') {
    const code = (url.searchParams.get('c') || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
    if (!code) return json({ error: 'missing-code' }, 400);

    const got = await kvGet('sl:' + code);
    if (got.error) return json({ error: got.error }, 503);
    if (!got.value) return json({ error: 'not-found' }, 404);

    let parsed;
    try { parsed = typeof got.value === 'string' ? JSON.parse(got.value) : got.value; }
    catch (_) { return json({ error: 'corrupt-entry' }, 500); }

    // Fire-and-forget click counter
    kvIncr('sl:' + code + ':clicks');

    return json({ ok: true, params: parsed, landing: buildLandingUrl(parsed) }, 200);
  }

  // POST: create a new short link (password-protected)
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch (_) { return json({ error: 'invalid-json' }, 400); }

    const password = clip(body.password, 100);
    const expected = process.env.LB_PASSWORD;
    if (!expected) return json({ error: 'lb-password-not-configured' }, 503);
    if (password !== expected) return json({ error: 'unauthorized' }, 401);

    const params = {
      n: clip(body.n, 80),
      m: clip(body.m, 1000),
      p: clip(body.p, 40),
      src: clip(body.src, 10)
    };
    if (!params.n || !params.m || !params.p || !params.src) {
      return json({ error: 'missing-fields', need: ['n', 'm', 'p', 'src'] }, 400);
    }

    // Try N random codes; NX prevents overwrites on collision
    const payload = JSON.stringify({ ...params, created: Date.now() });
    // Auto-expire after 90 days (spam-safe; matches typical campaign lifecycle)
    const TTL_SECONDS = 90 * 24 * 3600;
    for (let i = 0; i < MAX_CREATE_ATTEMPTS; i++) {
      const code = randomCode();
      const setRes = await kvSetNX('sl:' + code, payload, TTL_SECONDS);
      if (setRes.error === 'kv-not-configured') {
        return json({
          error: 'kv-not-configured',
          hint: 'Add a KV database in Vercel Storage; env vars KV_REST_API_URL and KV_REST_API_TOKEN will inject automatically.'
        }, 503);
      }
      if (setRes.error) return json({ error: setRes.error, status: setRes.status }, 502);
      if (setRes.ok) {
        return json({
          ok: true,
          code,
          url: `${BASE_URL}/l/${code}`,
          landing: buildLandingUrl(params),
          expiresInDays: 90
        }, 200);
      }
      // NX failed → collision, try again
    }
    return json({ error: 'code-collision-exhausted' }, 500);
  }

  return json({ error: 'method-not-allowed' }, 405);
}
