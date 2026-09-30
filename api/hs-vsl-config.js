// Vercel Edge Function — /api/hs-vsl-config
// Returns the VSL YouTube URL from env var HS_VSL_URL so it can be
// changed in the Vercel dashboard without redeploying HTML.

export const config = { runtime: 'edge' };

export default function handler() {
  const url = process.env.HS_VSL_URL || '';
  return new Response(JSON.stringify({ url }), {
    status: 200,
    headers: {
      'Content-Type':   'application/json; charset=utf-8',
      'X-Robots-Tag':   'noindex, nofollow, noarchive',
      'Cache-Control':  'private, no-store, max-age=0'
    }
  });
}
