// Vercel Edge Function — /api/lead
// Accepts a POST from /hello and forwards to GoHighLevel.
// Until GHL_API_KEY + GHL_LOCATION_ID env vars are set, it just logs
// and returns 200 so the frontend can be tested end-to-end.

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // Extract + validate
  const {
    name = null,
    message = null,
    post_id = null,
    src = null,
    category = null,
    wants_call = null,
    phone = null
  } = body || {};

  if (!phone || String(phone).trim().length < 6) {
    return json({ error: 'Phone required' }, 400);
  }
  if (!wants_call || !['yes', 'no'].includes(String(wants_call))) {
    return json({ error: 'wants_call must be yes or no' }, 400);
  }

  // Cap sizes to prevent abuse
  const clip = (v, n) => v == null ? null : String(v).slice(0, n);
  const payload = {
    name:       clip(name, 80),
    message:    clip(message, 1500),
    post_id:    clip(post_id, 40),
    src:        clip(src, 10),
    category:   clip(category, 40),
    wants_call: String(wants_call),
    phone:      clip(phone, 40).trim()
  };

  // ─── GHL forwarding ────────────────────────────────────────────
  const GHL_API_KEY     = process.env.GHL_API_KEY;
  const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;

  if (!GHL_API_KEY || !GHL_LOCATION_ID) {
    // Stub mode — log and return success so frontend can be tested
    console.log('[lead:stub-mode] GHL env vars not set. Payload:', payload);
    return json({ ok: true, mode: 'stub' }, 200);
  }

  // Split "First Last" into first/last
  const parts = (payload.name || '').trim().split(/\s+/);
  const firstName = parts[0] || 'Unknown';
  const lastName  = parts.slice(1).join(' ') || undefined;

  const tags = ['social-landing'];
  if (payload.src)        tags.push('src:' + payload.src);
  if (payload.post_id)    tags.push('post:' + payload.post_id);
  if (payload.category)   tags.push('cat:' + payload.category);
  tags.push('wants-call:' + payload.wants_call);

  const ghlBody = {
    locationId: GHL_LOCATION_ID,
    firstName,
    lastName,
    phone: payload.phone,
    source: 'social-landing:' + (payload.src || 'unknown') + ':' + (payload.post_id || 'none'),
    tags,
    customFields: [
      { key: 'social_message',      field_value: payload.message || '' },
      { key: 'post_id',             field_value: payload.post_id || '' },
      { key: 'source_platform',     field_value: payload.src || '' },
      { key: 'inferred_category',   field_value: payload.category || '' },
      { key: 'wants_discovery_call', field_value: payload.wants_call }
    ]
  };

  try {
    const ghlResp = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + GHL_API_KEY,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      },
      body: JSON.stringify(ghlBody)
    });

    if (!ghlResp.ok) {
      const errText = await ghlResp.text().catch(() => '');
      console.warn('[lead] GHL responded ' + ghlResp.status + ':', errText.slice(0, 500));
      // Don't leak GHL details to the browser; log and return generic 502
      return json({ error: 'Upstream error' }, 502);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    console.warn('[lead] Fetch to GHL threw:', err && err.message);
    return json({ error: 'Upstream error' }, 502);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
