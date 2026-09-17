// Vercel Edge Function — /api/apply
// Receives a multipart form submission from /careers/[slug].
// Attaches the resume PDF to a Resend email sent to HIRING_EMAIL.
// Zero storage — resumes live only in the hiring inbox (per phase 1 plan).

export const config = { runtime: 'edge' };

const HIRING_EMAIL   = 'hr@onpointsoft.com';
const FROM_EMAIL     = 'careers@onpointnexus.com';  // requires domain verify in Resend
const FROM_FALLBACK  = 'onboarding@resend.dev';     // Resend's dev sender; works with any account
const MAX_RESUME_MB  = 3;
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  let form;
  try {
    form = await req.formData();
  } catch (_) {
    return json({ error: 'bad-form-data' }, 400);
  }

  // Honeypot — silently accept but do nothing
  const hp = String(form.get('website') || '').trim();
  if (hp) return json({ ok: true, dropped: 'honeypot' }, 200);

  const name    = clip(form.get('full_name'), 120);
  const email   = clip(form.get('email'), 200);
  const phone   = clip(form.get('phone'), 40);
  const linkedin= clip(form.get('linkedin'), 400);
  const roleSlug= clip(form.get('role_slug'), 80);
  const roleTitle=clip(form.get('role_title'), 200);
  const cover   = clip(form.get('cover'), 3000);
  const source  = clip(form.get('source'), 40);

  if (!name || !email || !phone || !roleSlug || !roleTitle) {
    return json({ error: 'missing-fields' }, 400);
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json({ error: 'invalid-email' }, 400);
  }

  const resume = form.get('resume');
  if (!resume || typeof resume === 'string') {
    return json({ error: 'resume-required' }, 400);
  }
  if (resume.size === 0) {
    return json({ error: 'resume-empty' }, 400);
  }
  if (resume.size > MAX_RESUME_MB * 1024 * 1024) {
    return json({ error: 'resume-too-large' }, 413);
  }
  const mime = resume.type || '';
  if (!/pdf/i.test(mime) && !/pdf$/i.test(resume.name || '')) {
    return json({ error: 'resume-not-pdf' }, 415);
  }

  // Convert file → base64 for Resend attachment
  const buf = new Uint8Array(await resume.arrayBuffer());
  const base64 = uint8ToBase64(buf);
  const safeName = safeFileName(resume.name || 'resume.pdf');

  // ── Compose email ──────────────────────────────────────────
  const subject = `[Careers] ${roleTitle} — ${name}`;
  const html = renderHtmlEmail({ name, email, phone, linkedin, roleTitle, roleSlug, cover, source });
  const text = renderTextEmail({ name, email, phone, linkedin, roleTitle, roleSlug, cover, source });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    // Stub mode — log so team can verify wiring end-to-end pre-Resend
    console.log('[apply:stub] RESEND_API_KEY not set. Would send:', { subject, name, email, phone, roleTitle, resume: safeName + ' (' + buf.length + ' bytes)' });
    return json({ ok: true, mode: 'stub' }, 200);
  }

  const from = process.env.CAREERS_FROM_EMAIL || FROM_EMAIL;
  const body = {
    from: from,
    to: [HIRING_EMAIL],
    reply_to: email,
    subject,
    html,
    text,
    attachments: [
      { filename: safeName, content: base64 }
    ]
  };

  let resp;
  try {
    resp = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.warn('[apply] Resend fetch threw', err && err.message);
    return json({ error: 'upstream-fetch-failed' }, 502);
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.warn('[apply] Resend ' + resp.status + ':', errText.slice(0, 500));

    // If domain not verified yet, retry with Resend's default sender
    if (from !== FROM_FALLBACK && (resp.status === 403 || errText.includes('not verified'))) {
      body.from = FROM_FALLBACK;
      const retry = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (retry.ok) return json({ ok: true, note: 'sent-via-fallback-sender' }, 200);
    }
    return json({ error: 'send-failed' }, 502);
  }

  return json({ ok: true }, 200);
}

// ─── helpers ────────────────────────────────────────────────
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function clip(v, n) { return v == null ? '' : String(v).slice(0, n).trim(); }

function safeFileName(name) {
  return String(name).replace(/[^\w.-]/g, '_').slice(0, 120) || 'resume.pdf';
}

function uint8ToBase64(bytes) {
  // Chunked to avoid stack overflow on large files at edge runtimes
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderHtmlEmail(d) {
  return `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;background:#0c1324;color:#E8EDF5;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#0f1729;border-radius:16px;padding:32px;border:1px solid rgba(255,255,255,0.06);">
    <div style="color:#1ABADC;font-family:monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px;">New Application</div>
    <h1 style="font-size:22px;margin:0 0 6px;color:#E8EDF5;">${esc(d.roleTitle)}</h1>
    <div style="color:#8A9BB5;font-size:13px;margin-bottom:24px;">Slug: <code>${esc(d.roleSlug)}</code></div>

    <table style="width:100%;font-size:14px;line-height:1.6;color:#E8EDF5;border-collapse:collapse;">
      <tr><td style="color:#8A9BB5;padding:6px 0;width:130px;">Name</td><td>${esc(d.name)}</td></tr>
      <tr><td style="color:#8A9BB5;padding:6px 0;">Email</td><td><a href="mailto:${esc(d.email)}" style="color:#1ABADC;">${esc(d.email)}</a></td></tr>
      <tr><td style="color:#8A9BB5;padding:6px 0;">Phone</td><td>${esc(d.phone)}</td></tr>
      ${d.linkedin ? `<tr><td style="color:#8A9BB5;padding:6px 0;">LinkedIn</td><td><a href="${esc(d.linkedin)}" style="color:#1ABADC;">${esc(d.linkedin)}</a></td></tr>` : ''}
      ${d.source ? `<tr><td style="color:#8A9BB5;padding:6px 0;">Source</td><td>${esc(d.source)}</td></tr>` : ''}
    </table>

    ${d.cover ? `
      <div style="margin-top:24px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);">
        <div style="color:#8A9BB5;font-size:12px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;">Why they want to work with us</div>
        <div style="font-size:14px;line-height:1.6;white-space:pre-wrap;">${esc(d.cover)}</div>
      </div>
    ` : ''}

    <div style="margin-top:24px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);color:#5A7494;font-size:12px;">
      Resume attached to this email.<br>
      Reply directly to reach the applicant.
    </div>
  </div>
</body></html>`;
}

function renderTextEmail(d) {
  const lines = [
    `New Application — ${d.roleTitle}`,
    `Slug: ${d.roleSlug}`,
    ``,
    `Name:  ${d.name}`,
    `Email: ${d.email}`,
    `Phone: ${d.phone}`
  ];
  if (d.linkedin) lines.push(`LinkedIn: ${d.linkedin}`);
  if (d.source)   lines.push(`Source: ${d.source}`);
  if (d.cover) {
    lines.push('', 'Why they want to work with us:', d.cover);
  }
  lines.push('', 'Resume is attached.', 'Reply directly to reach the applicant.');
  return lines.join('\n');
}
