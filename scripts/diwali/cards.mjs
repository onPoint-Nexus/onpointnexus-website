#!/usr/bin/env node
// Diwali 2026 — print-ready card generator.
// For every *active* recipient produces:
//   out/diwali-cards/<slug>.html      — card HTML (A6 portrait, 105×148mm + 3mm bleed)
//   out/diwali-cards/<slug>-qr.png    — 1200×1200 QR (level Q, no logo inside)
//   out/diwali-cards/<slug>.pdf       — card as PDF (requires Playwright; see note)
//   out/diwali-cards/all-cards.pdf    — every card in one file
//
// Playwright is optional and large. If it isn't installed, HTMLs + QR PNGs are still
// produced and you can print the HTMLs directly from any browser, or wire the PDF
// step later with:  npm i playwright && npx playwright install chromium

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_PATH  = path.join(ROOT, 'data', 'diwali-2026.json');
const LOGO_PATH  = path.join(ROOT, 'diwali', 'onpoint-logo-ink.png');
const OUT_DIR    = path.join(ROOT, 'out', 'diwali-cards');

// A6 + 3mm bleed per edge. @300dpi:
//   width  = (105 + 6) mm = 111 mm = 1311 px
//   height = (148 + 6) mm = 154 mm = 1819 px
const CARD_W_MM = 111;
const CARD_H_MM = 154;

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function fail(msg){ console.error('\n✗ ' + msg + '\n'); process.exit(1); }

async function readJson(p){
  try { return JSON.parse(await fs.readFile(p, 'utf8')); }
  catch (e) { fail(`Could not read ${p}: ${e.message}`); }
}

async function readLogoDataUri(){
  try {
    const bytes = await fs.readFile(LOGO_PATH);
    return 'data:image/png;base64,' + bytes.toString('base64');
  } catch { return ''; }
}

async function renderQr(url, outPath){
  await QRCode.toFile(outPath, url, {
    errorCorrectionLevel: 'Q',
    margin: 4,
    width: 1200,
    color: { dark: '#09384A', light: '#FFFFFF' },
  });
}

// Derive how the person is addressed on the card. If a salutation
// override exists on the recipient (e.g. "Hi Dr. Bhagyesh,"), we
// strip the leading "Hi " and trailing comma so the card reads
// "Dr. Bhagyesh, this card has something to say." Otherwise the
// first name is used — same behaviour as the message screen.
function cardAddressedAs(r){
  if (r.salutation) {
    return String(r.salutation)
      .replace(/^Hi\s+/i, '')
      .replace(/[,，]\s*$/, '')
      .trim();
  }
  return r.firstName;
}

function cardHtml({ addressedAs, qrDataUri, logoDataUri, signatureName, signatureOrg }){
  // Mirrors design-reference/Main.dc.html, scaled to A6+bleed.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Diwali card — ${escapeHtml(addressedAs)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@page { size: ${CARD_W_MM}mm ${CARD_H_MM}mm; margin: 0; }
html,body{margin:0;padding:0;background:#fff}
body{
  width:${CARD_W_MM}mm; height:${CARD_H_MM}mm;
  display:flex; align-items:center; justify-content:center;
  font-family:'Hanken Grotesk',system-ui,sans-serif; color:#09384A;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
.card{
  width:105mm; height:148mm;
  background:#FBF7EF;
  box-sizing:border-box;
  padding:10mm 10mm 8mm;
  display:flex; flex-direction:column; align-items:center;
}
.logo{height:16mm; width:auto; display:block; margin-top:2mm}
.diya{margin-top:3mm}
.deepavali{
  margin-top:3mm;
  font-family:'Fraunces',Georgia,serif; font-size:11pt;
  letter-spacing:.04em; color:#8A5D14;
}
.headline{
  margin-top:3mm; max-width:85mm; text-align:center;
  font-family:'Fraunces',Georgia,serif; font-style:italic;
  font-size:19pt; line-height:1.18; color:#09384A;
}
.sub{
  margin:2.5mm 0 0; max-width:75mm; text-align:center;
  font-size:10pt; line-height:1.5; color:#3B5560;
}
.qr-row{
  margin-top:5mm;
  display:flex; align-items:center; gap:3mm;
}
.arrow{color:#8A5D14}
.qr{
  width:45mm; height:45mm;
  background:#fff;
  border:.6mm solid #D9CBAE;
  border-radius:2.5mm;
  padding:3mm;
  box-sizing:border-box;
}
.qr img{width:100%; height:100%; display:block}
.scan{
  margin-top:3mm;
  font-size:10pt; font-weight:600; letter-spacing:.04em; color:#8A5D14;
}
.scan-sub{
  margin-top:.8mm;
  font-size:9pt; color:#3B5560;
}
.spacer{flex:1}
.sign{
  display:flex; flex-direction:column; align-items:center; gap:1mm;
}
.sign .name{
  font-family:'Fraunces',Georgia,serif; font-style:italic;
  font-size:14pt; color:#09384A; line-height:1;
}
.sign .org{
  font-size:9pt; color:#5C7680; letter-spacing:.02em;
}
</style></head>
<body><div class="card">
  ${logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="OnPoint Nexus">` : '<div style="height:16mm"></div>'}

  <svg class="diya" width="12mm" height="12mm" viewBox="0 0 44 44" fill="none"
       stroke="#8A5D14" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M22 6c3 4 4 7 0 11c-4-4-3-7 0-11z"/>
    <path d="M8 24h28c0 7-6 12-14 12S8 31 8 24z"/>
    <path d="M17 40h10"/>
  </svg>

  <div class="deepavali">Shubh Deepavali</div>
  <div class="headline">${escapeHtml(addressedAs)}, this card has something to say.</div>
  <p class="sub">It's not written inside. Scan the code to hear it.</p>

  <div class="qr-row">
    <svg class="arrow" width="14mm" height="18mm" viewBox="0 0 46 60" fill="none"
         stroke="#8A5D14" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 6c-2 18 8 34 30 40"/>
      <path d="M28 38l8 8-10 4"/>
    </svg>
    <div class="qr"><img src="${qrDataUri}" alt="Scan QR"></div>
    <div style="width:14mm"></div>
  </div>

  <div class="scan">Scan to unwrap your surprise</div>
  <div class="scan-sub">Under 2 minutes · sound on</div>

  <div class="spacer"></div>
  <div class="sign">
    <div class="name">— ${escapeHtml(signatureName)}</div>
    <div class="org">${escapeHtml(signatureOrg)}</div>
  </div>
</div></body></html>`;
}

async function renderPdfs(cardHtmlPaths, outPdfDir){
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.warn('\n⚠  Playwright not installed. Skipping PDF generation.\n' +
                 '   HTMLs + QR PNGs were still written. To add PDFs:\n' +
                 '     npm install playwright && npx playwright install chromium\n' +
                 '   then rerun: npm run diwali:cards\n');
    return { skipped: true };
  }
  const browser = await chromium.launch();
  try {
    for (const { slug, htmlPath, pdfPath } of cardHtmlPaths) {
      const page = await browser.newPage();
      const url = 'file://' + htmlPath;
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.pdf({
        path: pdfPath,
        width:  CARD_W_MM + 'mm',
        height: CARD_H_MM + 'mm',
        printBackground: true,
      });
      await page.close();
      console.log(`  ✓ ${slug}.pdf`);
    }

    // Single combined PDF: an index page that loads each card via iframe at exact size.
    // Simpler approach: use Playwright to open a combined HTML that stacks them.
    const combined = cardHtmlPaths.map(c =>
      `<div style="page-break-after:always;width:${CARD_W_MM}mm;height:${CARD_H_MM}mm"><iframe style="border:0;width:100%;height:100%" src="file://${c.htmlPath}"></iframe></div>`
    ).join('\n');
    const combinedHtml = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${CARD_W_MM}mm ${CARD_H_MM}mm;margin:0}body{margin:0}</style></head><body>${combined}</body></html>`;
    const combinedPath = path.join(outPdfDir, '_combined.html');
    await fs.writeFile(combinedPath, combinedHtml);
    const page = await browser.newPage();
    await page.goto('file://' + combinedPath, { waitUntil: 'networkidle' });
    await page.pdf({
      path: path.join(outPdfDir, 'all-cards.pdf'),
      width:  CARD_W_MM + 'mm',
      height: CARD_H_MM + 'mm',
      printBackground: true,
    });
    await page.close();
    await fs.unlink(combinedPath).catch(() => {});
    console.log(`  ✓ all-cards.pdf`);
  } finally {
    await browser.close();
  }
  return { skipped: false };
}

async function main(){
  const data = await readJson(DATA_PATH);
  const baseUrl = data.baseUrl;
  if (!baseUrl) fail('data/diwali-2026.json: missing baseUrl.');

  const actives = data.recipients.filter(r => r.active !== false);
  if (!actives.length) fail('No active recipients to generate cards for.');

  // Wipe + recreate so stale cards for removed recipients don't linger
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });
  const logoDataUri = await readLogoDataUri();

  const cardHtmlPaths = [];

  const defaults = data.defaults || {};
  const signatureName = `${defaults.fromFirstName || 'Vikas'} Sawant`;
  const signatureOrg  = 'OnPoint Nexus';

  for (const r of actives) {
    const qrPath   = path.join(OUT_DIR, `${r.slug}-qr.png`);
    const htmlPath = path.join(OUT_DIR, `${r.slug}.html`);
    const pdfPath  = path.join(OUT_DIR, `${r.slug}.pdf`);
    const url = baseUrl + r.slug;

    await renderQr(url, qrPath);

    // Embed QR as base64 so the card HTML is single-file printable.
    const qrBytes = await fs.readFile(qrPath);
    const qrDataUri = 'data:image/png;base64,' + qrBytes.toString('base64');

    const html = cardHtml({
      addressedAs: cardAddressedAs(r),
      qrDataUri,
      logoDataUri,
      signatureName,
      signatureOrg,
    });
    await fs.writeFile(htmlPath, html);

    cardHtmlPaths.push({ slug: r.slug, htmlPath, pdfPath });
    console.log(`  ✓ ${r.slug}-qr.png + ${r.slug}.html  →  ${url}  (${cardAddressedAs(r)})`);
  }

  await renderPdfs(cardHtmlPaths, OUT_DIR);

  console.log(`\n✓ ${actives.length} card(s) written to ${path.relative(ROOT, OUT_DIR)}/`);
}

main().catch(e => fail(e.message || String(e)));
