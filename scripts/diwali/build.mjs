#!/usr/bin/env node
// Diwali 2026 — static per-recipient page generator.
// Reads data/diwali-2026.json, renders src/diwali/template.html (or
// inactive.html if active:false) into d/<slug>/index.html.
// Also writes d/_preview.html with a grid linking every recipient
// — never deployed (ignored by vercel.json build output).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_PATH     = path.join(ROOT, 'data', 'diwali-2026.json');
const TEMPLATE_PATH = path.join(ROOT, 'src', 'diwali', 'template.html');
const INACTIVE_PATH = path.join(ROOT, 'src', 'diwali', 'inactive.html');
const OUT_DIR       = path.join(ROOT, 'd');

const SLUG_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'; // no 0 o 1 l i
const SLUG_RE = new RegExp('^[a-z0-9-]+-[' + SLUG_ALPHABET + ']{5}$');

const PREVIEW_MODE = process.argv.includes('--preview');

function fail(msg){
  console.error('\n✗ ' + msg + '\n');
  process.exit(1);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function detectPlayerKind(src){
  const u = String(src).toLowerCase();
  if (/\.mp4(\?|$)/.test(u) || u.includes('vercel-storage.com') || u.includes('blob.vercel-storage.com') ||
      u.includes('public.blob.vercel-storage.com') || u.includes('example-blob.vercel.app')) {
    return 'mp4';
  }
  if (u.includes('loom.com/share/') || u.includes('loom.com/embed/')) return 'loom';
  // YouTube Shorts frequently block embedding (Error 153). Open on YouTube instead.
  if (u.includes('youtube.com/shorts/')) return 'youtube-link';
  if (u.includes('youtu.be/') || u.includes('youtube.com/')) return 'youtube';
  if (/\.(mov|webm|m4v)(\?|$)/.test(u)) return 'mp4';
  return null;
}

function validUrl(s){
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

function validate(data){
  if (!data || typeof data !== 'object') fail('data/diwali-2026.json: expected an object.');
  if (!data.campaign) fail('data/diwali-2026.json: missing "campaign".');
  if (!data.baseUrl) fail('data/diwali-2026.json: missing "baseUrl".');
  if (!Array.isArray(data.recipients)) fail('data/diwali-2026.json: "recipients" must be an array.');

  const seen = new Set();
  data.recipients.forEach((r, i) => {
    const where = `recipients[${i}]` + (r && r.slug ? ` (slug: ${r.slug})` : '');
    if (!r || typeof r !== 'object') fail(`${where}: expected an object.`);
    if (!r.slug) fail(`${where}: missing "slug".`);
    if (!SLUG_RE.test(r.slug)) fail(`${where}: slug "${r.slug}" must be <first>-<5 chars from ${SLUG_ALPHABET}>.`);
    if (seen.has(r.slug)) fail(`${where}: duplicate slug "${r.slug}".`);
    seen.add(r.slug);
    if (!r.firstName) fail(`${where}: missing "firstName".`);
    if (r.active === false) return; // inactive entries don't need a video
    // video.src is OPTIONAL — an entry without one renders a "video coming soon" state.
    // When present it must be a valid URL with a recognised host.
    const src = r.video && r.video.src;
    if (src) {
      if (!validUrl(src)) fail(`${where}: video.src is not a valid URL: ${src}`);
      if (!detectPlayerKind(src)) {
        fail(`${where}: video.src host not recognised. Expected .mp4, Vercel Blob, loom.com/share/… or youtube.com/…`);
      }
    }
    if (r.video && r.video.poster && !validUrl(r.video.poster)) {
      fail(`${where}: video.poster is not a valid URL: ${r.video.poster}`);
    }
  });
}

function merge(defaults, r){
  // Any key in `defaults` can be overridden on a recipient.
  return Object.assign({}, defaults || {}, r);
}

function renderNoteParagraphs(noteText){
  if (!noteText) return '<p></p>';
  return String(noteText)
    .split(/\n{2,}/)
    .map(p => `<p>${escapeHtml(p.trim())}</p>`)
    .join('\n        ');
}

function waHref(number, text){
  const digits = String(number || '').replace(/[^0-9]/g, '');
  const qs = text ? ('?text=' + encodeURIComponent(text)) : '';
  return 'https://wa.me/' + digits + qs;
}
function mailtoHref(email, subject){
  const qs = subject ? ('?subject=' + encodeURIComponent(subject)) : '';
  return 'mailto:' + (email || '') + qs;
}

function renderActive(template, merged){
  const src    = (merged.video && merged.video.src) || '';
  const poster = (merged.video && merged.video.poster) || '';
  const hasVideo = !!src;
  const kind   = hasVideo ? detectPlayerKind(src) : 'none';

  const posterImg = poster
    ? `<img class="video-poster" src="${escapeHtml(poster)}" alt="" aria-hidden="true">`
    : '';
  // Duration chip only when we actually have a video to time — skip for
  // youtube-link, since the YouTube page shows its own duration.
  const durationChip = hasVideo && merged.durationLabel && kind !== 'youtube-link'
    ? `<div class="video-duration">${escapeHtml(merged.durationLabel)}</div>`
    : '';

  const salutation = merged.salutation || `Hi ${merged.firstName},`;

  const replacements = {
    '{{GREETING}}':          escapeHtml(merged.greeting || 'Shubh Deepavali'),
    '{{FIRST_NAME}}':        escapeHtml(merged.firstName),
    '{{SALUTATION}}':        escapeHtml(salutation),
    '{{DURATION_LABEL}}':    escapeHtml(merged.durationLabel || ''),
    '{{PLAYER_KIND}}':       escapeHtml(kind),
    '{{VIDEO_SRC}}':         escapeHtml(src),
    '{{VIDEO_POSTER}}':      escapeHtml(poster),
    '{{VIDEO_POSTER_IMG}}':  posterImg,
    '{{VIDEO_DURATION_CHIP}}': durationChip,
    '{{VIDEO_CAPTION}}':      hasVideo
      ? (kind === 'youtube-link' ? 'Opens on YouTube' : 'Press play')
      : 'Coming in a day or two',
    '{{NOTE_PARAGRAPHS}}':   renderNoteParagraphs(merged.note),
    '{{CLOSING_LINE}}':      escapeHtml(merged.closingLine || ''),
    '{{SIGNOFF}}':           escapeHtml(merged.signoff || 'Warmly,'),
    '{{FROM_FIRST_NAME}}':   escapeHtml(merged.fromFirstName || 'Vikas'),
    '{{FROM_TITLE}}':        escapeHtml(merged.fromTitle || ''),
    '{{WHATSAPP_HREF}}':     waHref(merged.whatsapp, merged.whatsappText),
    '{{EMAIL_HREF}}':        mailtoHref(merged.email, 'Diwali wishes'),
    '{{SLUG_JSON}}':         JSON.stringify(merged.slug),
  };

  let html = template;
  for (const [k, v] of Object.entries(replacements)) {
    html = html.split(k).join(v);
  }
  return html;
}

async function main(){
  const [dataRaw, tplRaw, inactiveRaw] = await Promise.all([
    fs.readFile(DATA_PATH, 'utf8'),
    fs.readFile(TEMPLATE_PATH, 'utf8'),
    fs.readFile(INACTIVE_PATH, 'utf8'),
  ]);

  let data;
  try { data = JSON.parse(dataRaw); }
  catch (e) { fail('data/diwali-2026.json: invalid JSON — ' + e.message); }

  validate(data);

  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const stats = { active: 0, inactive: 0 };
  const rows = [];

  for (const r of data.recipients) {
    const merged = merge(data.defaults, r);
    const destDir = path.join(OUT_DIR, r.slug);
    await fs.mkdir(destDir, { recursive: true });

    const isActive = r.active !== false;
    const html = isActive ? renderActive(tplRaw, merged) : inactiveRaw;
    await fs.writeFile(path.join(destDir, 'index.html'), html);

    stats[isActive ? 'active' : 'inactive']++;
    const vSrc = (r.video && r.video.src) || '';
    const videoKind = isActive ? (vSrc ? detectPlayerKind(vSrc) : 'pending') : null;
    rows.push({ slug: r.slug, firstName: r.firstName, active: isActive, videoKind });
    console.log(`  ✓ /d/${r.slug}/  ${isActive ? '(' + (videoKind) + ')' : '[INACTIVE]'}`);
  }

  if (PREVIEW_MODE) {
    const previewHtml = renderPreview(data, rows);
    await fs.writeFile(path.join(OUT_DIR, '_preview.html'), previewHtml);
    console.log(`  ✓ /d/_preview.html  (preview grid — not deployed)`);
  }

  console.log(`\n✓ Built ${stats.active} active + ${stats.inactive} inactive pages into ${path.relative(ROOT, OUT_DIR)}/`);
}

function renderPreview(data, rows){
  const cards = rows.map(r => `
    <a class="card ${r.active ? '' : 'inactive'}" href="/d/${r.slug}/">
      <div class="name">${escapeHtml(r.firstName)}</div>
      <div class="slug">/d/${escapeHtml(r.slug)}/</div>
      <div class="badge">${r.active ? (r.videoKind || 'active') : 'inactive'}</div>
    </a>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Diwali 2026 — preview</title>
<meta name="robots" content="noindex, nofollow, noarchive">
<style>
body{font:15px/1.5 -apple-system,BlinkMacSystemFont,'Hanken Grotesk',sans-serif;background:#FBF7EF;color:#09384A;margin:0;padding:40px 24px;max-width:1120px;margin:0 auto}
h1{font-family:'Fraunces',Georgia,serif;font-weight:400;font-size:38px;letter-spacing:-.01em;margin:0 0 6px}
.sub{color:#5C7680;margin-bottom:28px;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.card{display:block;padding:18px 20px;background:#fff;border:1px solid #EDE3CF;border-radius:14px;color:inherit;text-decoration:none;transition:transform .2s,box-shadow .2s;position:relative}
.card:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(9,56,74,.08)}
.card.inactive{background:#F4EBD8;opacity:.75}
.name{font-family:'Fraunces',Georgia,serif;font-size:22px;color:#09384A;margin-bottom:4px}
.slug{font:12px/1.4 ui-monospace,Menlo,monospace;color:#5C7680}
.badge{position:absolute;top:14px;right:14px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#8A5D14;background:#FBF7EF;padding:3px 8px;border-radius:999px;border:1px solid #EDE3CF}
.card.inactive .badge{color:#5C7680}
</style>
</head><body>
<h1>Diwali 2026 — ${rows.length} cards</h1>
<div class="sub">Preview only — this page is not deployed. Click to open each recipient's experience.</div>
<div class="grid">${cards}
</div>
</body></html>`;
}

main().catch(e => fail(e.message || String(e)));
