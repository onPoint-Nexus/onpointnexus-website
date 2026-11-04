#!/usr/bin/env node
// npm run diwali:add -- "First Name"
// Appends a recipient to data/diwali-2026.json with a unique slug.
// Populates video.src with an empty placeholder so you can paste a Loom
// or YouTube link later. Note is left empty.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_PATH = path.join(ROOT, 'data', 'diwali-2026.json');

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'; // no 0 o 1 l i

function randToken(n){
  const bytes = crypto.randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function slugify(name){
  return String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function fail(m){ console.error('✗ ' + m); process.exit(1); }

async function main(){
  const nameArg = process.argv.slice(2).join(' ').trim();
  if (!nameArg) fail('Usage: npm run diwali:add -- "First Name"');

  const raw = await fs.readFile(DATA_PATH, 'utf8');
  const data = JSON.parse(raw);
  const seen = new Set(data.recipients.map(r => r.slug));

  const firstName = nameArg.split(/\s+/)[0];
  const base = slugify(firstName) || 'guest';
  let token, slug, tries = 0;
  do {
    if (tries++ > 20) fail('Could not find a unique slug after 20 tries.');
    token = randToken(5);
    slug = `${base}-${token}`;
  } while (seen.has(slug));

  const entry = {
    slug,
    firstName,
    note: '',
    video: { src: '' },
    active: true,
  };
  data.recipients.push(entry);

  // Pretty-print with 2-space indent, trailing newline
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2) + '\n');
  console.log(`✓ Added ${firstName} → /d/${slug}/`);
  console.log(`  Next: paste a Loom / YouTube URL into video.src and write the note.`);
}

main().catch(e => fail(e.message || String(e)));
