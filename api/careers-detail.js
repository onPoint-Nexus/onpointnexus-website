// Vercel Edge Function — /api/careers-detail
// Serves a full HTML page for /careers/[slug] via a rewrite.
// Server-rendered so JobPosting JSON-LD is in the initial HTML
// (needed for Google Jobs indexing).

export const config = { runtime: 'edge' };

const SITE = 'https://www.onpointnexus.com';
const HIRING_EMAIL = 'hr@onpointsoft.com';

export default async function handler(req) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get('slug') || '').replace(/[^a-z0-9-]/g, '').slice(0, 80);
  if (!slug) return notFound('Missing role.');

  // Fetch jobs.json from the same deployment (edge → static file).
  // Origin URL is inferred from the request host.
  const origin = url.origin;
  let jobsRes;
  try {
    jobsRes = await fetch(origin + '/jobs.json', { cache: 'no-store' });
  } catch (_) { return notFound('Could not load roles.'); }
  if (!jobsRes.ok) return notFound('Could not load roles.');

  const jobs = await jobsRes.json().catch(() => ({}));
  const role = (jobs.roles || []).find(r => r.slug === slug);
  if (!role) return notFound('Role not found.');
  if (role.status !== 'open') {
    return htmlResponse(renderClosed(role), 200);
  }

  return htmlResponse(renderRolePage(role), 200);
}

function htmlResponse(html, status) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      'X-Robots-Tag': 'index, follow'
    }
  });
}

function notFound(msg) {
  return new Response(renderShell('Role not found', `
    <div class="max-w-2xl mx-auto text-center py-32 px-6">
      <p class="text-[11px] font-mono uppercase tracking-widest text-primary mb-4">404 &middot; Role not found</p>
      <h1 class="font-headline text-3xl md:text-4xl font-bold mb-6">${esc(msg)}</h1>
      <p class="text-on-surface-dim mb-10">This role may have closed. See all open roles below.</p>
      <a href="/careers" class="inline-flex items-center gap-2 rounded-full bg-primary text-surface px-7 py-3.5 font-semibold hover:bg-primary-dim transition-colors">See open roles</a>
    </div>
  `, ''), {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, follow'
    }
  });
}

// ─── HTML rendering ─────────────────────────────────────────────
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function bullets(items) {
  return '<ul class="resp-bullets">' + (items || []).map(b => `<li>${esc(b)}</li>`).join('') + '</ul>';
}

function jobPostingSchema(role) {
  const url = SITE + '/careers/' + role.slug;
  const desc = [
    '<p>' + esc(role.summary) + '</p>',
    '<h3>What you\'ll do</h3>', bullets(role.responsibilities),
    '<h3>What we look for</h3>', bullets(role.requirements),
    role.niceToHave && role.niceToHave.length ? '<h3>Nice to have</h3>' + bullets(role.niceToHave) : '',
    role.benefits && role.benefits.length ? '<h3>What we offer</h3>' + bullets(role.benefits) : ''
  ].join('');
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    'title': role.title,
    'description': desc,
    'datePosted': role.posted,
    'validThrough': role.closes || undefined,
    'employmentType': (role.type || '').toUpperCase().replace(/[^A-Z]/g, '_'),
    'hiringOrganization': {
      '@type': 'Organization',
      'name': 'OnPoint Nexus',
      'sameAs': SITE,
      'logo': SITE + '/logo-icon.png'
    },
    'jobLocation': {
      '@type': 'Place',
      'address': {
        '@type': 'PostalAddress',
        'addressLocality': 'Kolhapur',
        'addressRegion': 'Maharashtra',
        'addressCountry': 'IN'
      }
    },
    'baseSalary': {
      '@type': 'MonetaryAmount',
      'currency': 'INR',
      'value': { '@type': 'QuantitativeValue', 'unitText': 'YEAR' }
    },
    'directApply': true,
    'url': url,
    'identifier': {
      '@type': 'PropertyValue',
      'name': 'OnPoint Nexus',
      'value': role.slug
    }
  };
  Object.keys(schema).forEach(k => schema[k] === undefined && delete schema[k]);
  return JSON.stringify(schema);
}

function renderRolePage(role) {
  const url = SITE + '/careers/' + role.slug;
  const posDetail = role.positions > 1 ? role.positions + ' positions' : '1 position';
  const jsonLd = jobPostingSchema(role);
  const desc = esc(role.summary);

  return renderShell(
    `${role.title} — Careers | OnPoint Nexus`,
    innerRolePage(role, posDetail),
    `
      <link rel="canonical" href="${url}">
      <meta name="description" content="${desc}">
      <meta name="robots" content="index, follow">
      <meta property="og:type" content="website">
      <meta property="og:url" content="${url}">
      <meta property="og:title" content="${esc(role.title)} — Careers | OnPoint Nexus">
      <meta property="og:description" content="${desc}">
      <meta property="og:image" content="${SITE}/og-image.png">
      <script type="application/ld+json">${jsonLd}</script>
    `
  );
}

function renderClosed(role) {
  return renderShell(
    `${role.title} (closed) — Careers | OnPoint Nexus`,
    `
      <section class="pt-24 pb-24 max-w-3xl mx-auto px-6 text-center">
        <p class="text-[11px] font-mono uppercase tracking-widest text-primary mb-4">This role is closed</p>
        <h1 class="font-headline text-3xl md:text-4xl font-bold mb-6">${esc(role.title)}</h1>
        <p class="text-on-surface-dim mb-10">This position has been filled or is no longer accepting applications. See what else we're hiring for.</p>
        <a href="/careers" class="inline-flex items-center gap-2 rounded-full bg-primary text-surface px-7 py-3.5 font-semibold hover:bg-primary-dim transition-colors">See open roles</a>
      </section>
    `,
    `<meta name="robots" content="noindex, follow">`
  );
}

function innerRolePage(role, posDetail) {
  const chip = (label, val) => `<div class="chip-item"><span class="material-symbols-outlined">chevron_right</span><strong>${esc(label)}:</strong>&nbsp;${esc(val)}</div>`;
  const nice = role.niceToHave && role.niceToHave.length ? `
    <h2>Nice to have</h2>
    ${bullets(role.niceToHave)}
  ` : '';
  const bens = role.benefits && role.benefits.length ? `
    <h2>What we offer</h2>
    ${bullets(role.benefits)}
  ` : '';

  return `
  <section class="relative pt-16 pb-10 overflow-hidden" style="background:#0c1324;">
    <div class="absolute inset-0 pointer-events-none" style="background-image:linear-gradient(rgba(26,186,220,0.055) 1px,transparent 1px),linear-gradient(90deg,rgba(26,186,220,0.055) 1px,transparent 1px);background-size:60px 60px;mask-image:radial-gradient(ellipse 75% 65% at 50% 45%,#000 30%,transparent 85%);-webkit-mask-image:radial-gradient(ellipse 75% 65% at 50% 45%,#000 30%,transparent 85%);"></div>
    <div class="absolute inset-0 pointer-events-none" style="background:radial-gradient(ellipse 55% 45% at 30% 40%,rgba(26,186,220,0.13) 0%,transparent 70%);"></div>

    <div class="relative max-w-4xl mx-auto px-6">
      <nav class="mb-6 text-sm text-on-surface-muted font-mono">
        <a href="/" class="hover:text-primary">Home</a> &middot;
        <a href="/careers" class="hover:text-primary">Careers</a> &middot;
        <span class="text-on-surface">${esc(role.department)}</span>
      </nav>

      <span class="sec-eyebrow"><span class="dot"></span>${esc(role.department)}</span>

      <h1 class="mt-6 font-bold" style="font-size:clamp(2rem,4vw,3.4rem);letter-spacing:-.035em;line-height:1.04;">
        ${esc(role.title)}
      </h1>

      <div class="mt-6 flex flex-wrap gap-3">
        <span class="meta-chip"><span class="material-symbols-outlined">location_on</span> ${esc(role.location)}</span>
        <span class="meta-chip"><span class="material-symbols-outlined">work</span> ${esc(role.type)}</span>
        <span class="meta-chip"><span class="material-symbols-outlined">badge</span> ${esc(role.experience)}</span>
        <span class="meta-chip"><span class="material-symbols-outlined">group</span> ${esc(posDetail)}</span>
        <span class="meta-chip"><span class="material-symbols-outlined">payments</span> ${esc(role.salary)}</span>
      </div>

      <p class="mt-8 text-on-surface-dim text-lg leading-relaxed max-w-3xl">${esc(role.summary)}</p>

      <div class="mt-10 flex flex-wrap gap-3">
        <a href="#apply" class="inline-flex items-center gap-2 rounded-full bg-primary text-surface px-7 py-3.5 font-semibold hover:bg-primary-dim transition-colors">
          Apply for this role <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
        </a>
        <a href="/careers" class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-7 py-3.5 font-semibold hover:border-primary hover:text-primary transition-colors">
          Back to all roles
        </a>
      </div>
    </div>
  </section>

  <section class="py-14 border-t border-white/[0.05]">
    <div class="max-w-4xl mx-auto px-6 role-body">
      <h2>What you'll do</h2>
      ${bullets(role.responsibilities)}

      <h2>What we look for</h2>
      ${bullets(role.requirements)}

      ${nice}
      ${bens}
    </div>
  </section>

  <section id="apply" class="py-20 border-t border-white/[0.05] bg-surface-low scroll-mt-20">
    <div class="max-w-2xl mx-auto px-6">
      <p class="text-[11px] font-mono uppercase tracking-widest text-primary mb-4 text-center">Apply</p>
      <h2 class="font-headline text-2xl md:text-3xl font-bold text-on-surface leading-tight tracking-[-0.02em] mb-3 text-center">
        Apply for: ${esc(role.title)}
      </h2>
      <p class="text-on-surface-dim mb-10 text-center text-sm">One form, no login. Your resume goes straight to our hiring inbox.</p>

      <div id="formWrap">
        <form id="applyForm" class="flex flex-col gap-6" novalidate enctype="multipart/form-data">
          <input type="hidden" name="role_slug" value="${esc(role.slug)}">
          <input type="hidden" name="role_title" value="${esc(role.title)}">
          <!-- Honeypot: bots fill it, humans never see it -->
          <div style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;" aria-hidden="true">
            <label>Do not fill: <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
          </div>

          <div>
            <label class="field-label" for="full_name">Full name</label>
            <input class="field-input" type="text" id="full_name" name="full_name" required autocomplete="name" placeholder="Vikas Sawant">
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label class="field-label" for="email">Email</label>
              <input class="field-input" type="email" id="email" name="email" required autocomplete="email" placeholder="you@example.com">
            </div>
            <div>
              <label class="field-label" for="phone">Phone (with country code)</label>
              <input class="field-input" type="tel" id="phone" name="phone" required autocomplete="tel" placeholder="+91 98765 43210">
            </div>
          </div>

          <div>
            <label class="field-label" for="linkedin">LinkedIn URL <span class="text-on-surface-muted normal-case tracking-normal">(optional)</span></label>
            <input class="field-input" type="url" id="linkedin" name="linkedin" placeholder="https://linkedin.com/in/…">
          </div>

          <div>
            <label class="field-label" for="resume">Resume (PDF, max 3&nbsp;MB)</label>
            <input class="field-input" type="file" id="resume" name="resume" accept="application/pdf,.pdf" required>
          </div>

          <div>
            <label class="field-label" for="cover">Why do you want to work with us? <span class="text-on-surface-muted normal-case tracking-normal">(optional, 2–4 sentences)</span></label>
            <textarea class="field-input" id="cover" name="cover" rows="4" style="resize:vertical;font-family:inherit;" placeholder="What excites you about this role at OnPoint?"></textarea>
          </div>

          <div>
            <label class="field-label" for="source">How did you hear about this role?</label>
            <select class="field-input" id="source" name="source">
              <option value="">Select…</option>
              <option value="linkedin">LinkedIn</option>
              <option value="instagram">Instagram</option>
              <option value="referral">Referral</option>
              <option value="google">Google search</option>
              <option value="google-jobs">Google Jobs</option>
              <option value="other">Other</option>
            </select>
          </div>

          <button type="submit" class="submit-btn" id="submitBtn">
            Submit application <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
          <p class="text-xs text-on-surface-muted text-center" id="formError" style="display:none; color:#f87171;"></p>
        </form>
      </div>

      <div id="thankYou" class="thank-you" style="display:none;">
        <div class="mb-4"><span class="material-symbols-outlined text-primary" style="font-size:48px;">check_circle</span></div>
        <h2 class="font-headline text-2xl font-bold mb-3">Application received. 🎉</h2>
        <p class="text-on-surface-dim mb-2">Thanks for applying to <strong>${esc(role.title)}</strong>. We review every application ourselves.</p>
        <p class="text-on-surface-dim text-sm">If your profile is a fit, we'll be in touch within <strong>5 business days</strong> from <code>${HIRING_EMAIL}</code>.</p>
      </div>
    </div>
  </section>

  <script>
  (function(){
    const form = document.getElementById('applyForm');
    const btn  = document.getElementById('submitBtn');
    const err  = document.getElementById('formError');
    if (!form) return;

    form.addEventListener('submit', async e => {
      e.preventDefault();
      err.style.display = 'none';
      const file = document.getElementById('resume').files[0];
      if (!file) { err.textContent = 'Please attach a PDF resume.'; err.style.display=''; return; }
      if (file.size > 3 * 1024 * 1024) { err.textContent = 'Resume is over 3 MB. Please compress and re-upload.'; err.style.display=''; return; }
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        err.textContent = 'Please upload a PDF file.'; err.style.display=''; return;
      }

      btn.disabled = true;
      const orig = btn.innerHTML;
      btn.innerHTML = 'Uploading&hellip;';

      const fd = new FormData(form);
      try {
        const resp = await fetch('/api/apply', { method: 'POST', body: fd });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || ('HTTP ' + resp.status));
        document.getElementById('formWrap').style.display = 'none';
        document.getElementById('thankYou').style.display = '';
        if (window.gtag) gtag('event', 'career_application_submit', {
          role_slug: '${esc(role.slug)}',
          role_title: '${esc(role.title)}'
        });
      } catch(er) {
        btn.disabled = false; btn.innerHTML = orig;
        err.textContent = 'Something went wrong. Please try again, or email ${HIRING_EMAIL} directly.';
        err.style.display = '';
        console.warn('Apply error', er);
      }
    });
  })();
  </script>
  `;
}

function renderShell(title, body, headExtras) {
  return `<!DOCTYPE html>
<html class="dark" lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0c1324">
  <title>${esc(title)}</title>
  ${headExtras || ''}
  <link rel="icon" type="image/png" href="/favicon.png">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Roboto+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script>
    tailwind.config = { darkMode:'class', theme:{ extend:{
      colors:{ primary:'#1ABADC','primary-dim':'#0E8FA8', surface:'#0c1324','surface-card':'#141c2e','surface-low':'#080e1c','on-surface':'#E8EDF5','on-surface-dim':'#8A9BB5','on-surface-muted':'#5A7494' }
    }}}
  </script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-N2WCZPCE46"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-N2WCZPCE46');</script>
  <style>
    body { background:#0c1324; color:#E8EDF5; font-family:'Plus Jakarta Sans',sans-serif; }
    .grad-text { background:linear-gradient(135deg,#1ABADC 0%,#8de4f0 100%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
    .sec-eyebrow { display:inline-flex; align-items:center; gap:10px; padding:7px 16px; border-radius:999px; border:1px solid rgba(26,186,220,0.28); background:rgba(26,186,220,0.08); color:#1ABADC; font-family:'Roboto Mono',monospace; font-size:.68rem; font-weight:600; text-transform:uppercase; letter-spacing:.14em; }
    .sec-eyebrow .dot { width:6px; height:6px; border-radius:50%; background:#1ABADC; }
    .meta-chip { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:999px; background:#0f1729; border:1px solid rgba(255,255,255,0.06); font-family:'Roboto Mono',monospace; font-size:11px; letter-spacing:.08em; color:#8A9BB5; text-transform:uppercase; font-weight:600; }
    .meta-chip .material-symbols-outlined { color:#1ABADC; font-size:16px; }
    .role-body h2 { font-family:'Plus Jakarta Sans',sans-serif; font-size:24px; font-weight:700; color:#E8EDF5; margin:36px 0 14px; letter-spacing:-.015em; }
    .role-body h2:first-child { margin-top:0; }
    .role-body h3 { font-family:'Plus Jakarta Sans',sans-serif; font-size:16px; font-weight:600; color:#E8EDF5; margin:22px 0 10px; }
    .resp-bullets { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:12px; }
    .resp-bullets li { display:flex; align-items:flex-start; gap:14px; font-size:16px; color:#E8EDF5; line-height:1.55; padding-left:0; }
    .resp-bullets li::before { content:''; width:7px; height:7px; border-radius:50%; background:#1ABADC; margin-top:10px; flex-shrink:0; box-shadow:0 0 12px rgba(26,186,220,0.55); }
    .field-label { display:block; font-family:'Roboto Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:.12em; color:#8A9BB5; margin-bottom:10px; font-weight:600; }
    .field-input { width:100%; padding:14px 18px; background:#0f1729; color:#E8EDF5; border:1px solid rgba(255,255,255,0.08); border-radius:12px; font-size:15px; font-family:inherit; transition:border-color .2s ease; }
    .field-input:focus { outline:none; border-color:#1ABADC; box-shadow:0 0 0 3px rgba(26,186,220,0.15); }
    textarea.field-input { min-height:110px; }
    .submit-btn { width:100%; display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:16px 28px; background:#1ABADC; color:#0c1324; border:none; border-radius:999px; font-family:inherit; font-weight:700; font-size:15px; cursor:pointer; transition:background .2s ease, transform .15s ease; box-shadow:0 12px 28px -12px rgba(26,186,220,0.55); }
    .submit-btn:hover:not(:disabled) { background:#0E8FA8; transform:translateY(-1px); }
    .submit-btn:disabled { opacity:.5; cursor:not-allowed; }
    .thank-you { padding:44px; background:linear-gradient(135deg, rgba(26,186,220,0.08) 0%, #0f1729 60%); border:1px solid rgba(26,186,220,0.28); border-radius:22px; text-align:center; }
  </style>
</head>
<body class="bg-surface text-on-surface antialiased">

<nav class="sticky top-0 z-50 border-b border-white/[0.05]" style="background:rgba(12,19,36,0.92);backdrop-filter:blur(20px);">
  <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
    <a href="/" class="flex items-center gap-2 shrink-0"><img src="/logo-wordmark.png" alt="OnPoint Nexus" class="h-5 w-auto" width="160" height="20"></a>
    <div class="hidden md:flex items-center gap-7 text-sm">
      <a href="/services" class="text-on-surface-dim hover:text-primary">Services</a>
      <a href="/scaleos"  class="text-on-surface-dim hover:text-primary">ScaleOS</a>
      <a href="/work"     class="text-on-surface-dim hover:text-primary">Work</a>
      <a href="/products" class="text-on-surface-dim hover:text-primary">Products</a>
      <a href="/about"    class="text-on-surface-dim hover:text-primary">About</a>
      <a href="/careers"  class="text-primary">Careers</a>
    </div>
    <a href="#apply" class="hidden md:inline-flex items-center gap-1.5 bg-primary text-surface px-5 py-2 rounded-full font-semibold text-sm hover:bg-primary-dim">Apply</a>
  </div>
</nav>

${body}

<footer class="bg-surface-low border-t border-white/5 pt-14 pb-8">
  <div class="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-on-surface-muted font-mono">
    <p>© 2026 OnPoint Nexus Pvt. Ltd. &middot; Pune &amp; Kolhapur, India &middot; Dallas, TX</p>
    <div class="flex gap-5">
      <a href="/careers" class="hover:text-primary">All roles</a>
      <a href="/privacy-policy" class="hover:text-primary">Privacy</a>
      <a href="/terms" class="hover:text-primary">Terms</a>
    </div>
  </div>
</footer>
</body>
</html>`;
}
