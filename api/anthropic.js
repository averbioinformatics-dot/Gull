// Gull's brain proxy. The browser never sees ANTHROPIC_API_KEY; it sends its signed-in session instead.
// GET  /api/anthropic  -> { ok: true } when the session is valid and the server has its key
// POST /api/anthropic  -> forwards the Messages API body to Anthropic and returns the response unchanged
import { requireSession } from '../lib/auth.js';

const ALLOWED_MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'];
const MAX_TOKENS_CAP = 4000;

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY in its environment variables.' });

  if (req.method === 'GET') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const body = req.body;
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) {
    return res.status(400).json({ error: 'Body must be a Messages API request with a messages array.' });
  }
  if (!ALLOWED_MODELS.includes(body.model)) body.model = 'claude-sonnet-5-5';
  body.max_tokens = Math.min(Math.max(1, Number(body.max_tokens) || 900), MAX_TOKENS_CAP);
  delete body.stream; // this proxy returns whole responses

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    return res.send(text);
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach Anthropic: ' + e.message });
  }
}
