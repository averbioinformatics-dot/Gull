// Gull's brain proxy. The browser never sees ANTHROPIC_API_KEY; it sends its signed-in session instead.
// GET  /api/anthropic  -> { ok: true } when the session is valid and the server has its key
// POST /api/anthropic  -> forwards the Messages API body to Anthropic and returns the response unchanged
import { requireSession } from '../lib/auth.js';

const ALLOWED_MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'];
const MAX_TOKENS_CAP = 4000;

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY in its environment variables.' });
  // a key is one token; anything else (pasted chat text, two lines, quotes) is rejected here, without ever echoing it back
  if (!/^sk-ant-[\w-]+$/.test(apiKey)) {
    return res.status(500).json({ error: `ANTHROPIC_API_KEY in Vercel is not a valid API key: it must be just the key on one line, starting with "sk-ant-" (this one is ${apiKey.length} characters${/\s/.test(apiKey) ? ' and contains spaces or line breaks' : ''}${/^["']/.test(apiKey) ? ' and starts with a quote' : ''}). Paste only the key, then redeploy.` });
  }
  const keyShape = `${apiKey.split('-').slice(0, 3).join('-')}-…${apiKey.slice(-4)}, ${apiKey.length} characters`;

  // GET ?check=1 makes a one-token call so Settings → Test brain reports Anthropic's real answer
  if (req.method === 'GET' && req.query && req.query.check) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: String(req.query.model || 'claude-sonnet-5-5'), max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return res.status(200).json({ ok: true, key: keyShape, model: j.model });
      return res.status(200).json({ ok: false, key: keyShape, status: r.status, type: j.error && j.error.type, message: j.error && j.error.message });
    } catch (e) {
      return res.status(200).json({ ok: false, key: keyShape, message: 'Could not reach Anthropic: ' + String(e.message).split(apiKey).join('[key hidden]') });
    }
  }
  if (req.method === 'GET') return res.status(200).json({ ok: true, key: keyShape });
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
    return res.status(502).json({ error: 'Could not reach Anthropic: ' + String(e.message).split(apiKey).join('[key hidden]') });
  }
}
