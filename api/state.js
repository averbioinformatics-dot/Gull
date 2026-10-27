// Gull's memory, stored in Supabase (table gull_state, see supabase/migrations).
// Journal and settings belong to each user (rows "journal:<user>", "settings:<user>"); the news scan is shared ("news").
// GET /api/state            -> { ok: true, data: { journal, news, settings } }
// PUT /api/state { items:[{key,value}] } -> upserts
// If Supabase is not configured the handler answers { ok: false } and the page keeps everything in the browser.

import { requireSession } from '../lib/auth.js';

const PER_USER = new Set(['journal', 'settings']);
const SHARED = new Set(['news']);

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;
  const uid = session.u.replace(/[^a-z0-9._-]/g, '_');
  const dbKey = k => PER_USER.has(k) ? `${k}:${uid}` : SHARED.has(k) ? k : null;
  const appKey = Object.fromEntries([...PER_USER, ...SHARED].map(k => [dbKey(k), k]));

  // names set by hand, or by the Vercel–Supabase integration
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  res.setHeader('cache-control', 'no-store');
  if (!url || !key) return res.status(200).json({ ok: false, reason: 'Supabase is not configured (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).' });

  // legacy service_role keys are JWTs and also go in Authorization; the newer sb_secret_ keys go in apikey only
  const headers = { apikey: key, 'content-type': 'application/json', ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}) };
  const table = url + '/rest/v1/gull_state';

  try {
    if (req.method === 'GET') {
      const wanted = Object.keys(appKey).map(k => `"${k}"`).join(',');
      const r = await fetch(`${table}?select=key,value&key=in.(${encodeURIComponent(wanted)})`, { headers });
      if (!r.ok) return res.status(502).json({ ok: false, reason: 'Supabase read failed: ' + (await r.text()).slice(0, 300) });
      const data = {};
      for (const row of await r.json()) if (appKey[row.key]) data[appKey[row.key]] = row.value;
      return res.status(200).json({ ok: true, data });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
      const rows = items.filter(i => i && dbKey(i.key)).map(i => ({ key: dbKey(i.key), value: i.value, updated_at: new Date().toISOString() }));
      if (!rows.length) return res.status(400).json({ ok: false, reason: 'No valid items.' });
      const r = await fetch(table, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
      if (!r.ok) return res.status(502).json({ ok: false, reason: 'Supabase write failed: ' + (await r.text()).slice(0, 300) });
      return res.status(200).json({ ok: true, saved: rows.map(r => appKey[r.key]) });
    }
    return res.status(405).json({ error: 'Use GET or PUT.' });
  } catch (e) {
    return res.status(502).json({ ok: false, reason: 'Could not reach Supabase: ' + e.message });
  }
}
