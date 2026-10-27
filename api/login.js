// Sign-in for the desk.
// POST /api/login { username, password, remember } -> { ok, token, exp, user, name }
// GET  /api/login (Authorization: Bearer <token>)   -> { ok, user, name, exp } while the session is valid
import { configured, checkCredentials, issueToken, readSession } from '../lib/auth.js';

const DAY = 86400;

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!configured()) return res.status(500).json({ error: 'Server has no users: set GULL_USERS (or GULL_USERNAME and GULL_PASSWORD) in its environment variables.' });

  if (req.method === 'GET') {
    const s = readSession(req);
    return s ? res.status(200).json({ ok: true, user: s.u, name: s.name, exp: s.exp }) : res.status(401).json({ error: 'Session expired. Sign in again.' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const { username, password, remember } = req.body || {};
  const user = checkCredentials(username, password);
  if (!user) {
    await new Promise(r => setTimeout(r, 700)); // slows down guessing
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  const { token, exp } = issueToken(user, remember ? 30 * DAY : DAY / 2);
  return res.status(200).json({ ok: true, token, exp, user: user.u, name: user.name });
}
