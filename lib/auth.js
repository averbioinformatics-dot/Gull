// Gull's sign-in. Users come from the environment:
//   GULL_USERS = [{"u":"sadeeq","name":"Sadeeq Khan","h":"scrypt$..."}, ...]   (make hashes with scripts/hash-password.mjs)
//   GULL_USERNAME / GULL_PASSWORD still work as one extra plain-text user, for older deployments.
// A successful sign-in returns a signed session token: base64url({u, n, v, exp}) + "." + HMAC-SHA256.
// v is a fingerprint of the user's password hash, so changing someone's password signs that person out everywhere.
import crypto from 'node:crypto';

const sha256 = s => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b)); // hashing first makes the compare length-independent
const norm = u => String(u || '').trim().toLowerCase();
const SCRYPT = { N: 16384, r: 8, p: 1 };

export function hashPassword(password, salt = crypto.randomBytes(16)) {
  const h = crypto.scryptSync(String(password), salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${h.toString('base64url')}`;
}
function verifyHash(password, stored) {
  const [kind, N, r, p, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  const got = crypto.scryptSync(String(password || ''), Buffer.from(salt, 'base64url'), want.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(got, want);
}

let cached = null, cachedFrom = null;
export function users() {
  const raw = process.env.GULL_USERS || '', lu = process.env.GULL_USERNAME, lp = process.env.GULL_PASSWORD;
  const from = `${raw}\n${lu}\n${lp}`;
  if (from === cachedFrom) return cached;
  let list = [];
  if (raw.trim()) {
    try { const j = JSON.parse(raw); if (Array.isArray(j)) list = j.filter(x => x && x.u && x.h).map(x => ({ u: norm(x.u), name: String(x.name || x.u).trim(), h: String(x.h) })); }
    catch { console.error('GULL_USERS is not valid JSON; ignoring it.'); }
  }
  if (lu && lp && !list.some(x => x.u === norm(lu))) list.push({ u: norm(lu), name: lu.trim(), plain: lp });
  cached = list; cachedFrom = from;
  return list;
}
export const configured = () => users().length > 0;
const fingerprint = x => sha256(x.h || `plain:${x.plain}`).toString('base64url').slice(0, 12);

let dummy = null; // checked against unknown usernames so they take as long as known ones
export function checkCredentials(username, password) {
  const x = users().find(y => y.u === norm(username));
  if (!x) { verifyHash(password, dummy || (dummy = hashPassword('timing-only'))); return null; }
  const ok = x.h ? verifyHash(password, x.h) : same(String(password || ''), x.plain);
  return ok ? x : null;
}

// With GULL_SESSION_SECRET set, editing one user leaves the others signed in (the fingerprint handles that user).
// Without it, the key comes from the user list itself, so any change signs everyone out.
function signingKey() {
  const secret = process.env.GULL_SESSION_SECRET;
  return sha256(secret ? `gull-session\n${secret}` : `gull-session\n${process.env.GULL_USERS || ''}\n${process.env.GULL_USERNAME || ''}\n${process.env.GULL_PASSWORD || ''}`);
}

export function issueToken(user, ttlSeconds) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = Buffer.from(JSON.stringify({ u: user.u, n: user.name, v: fingerprint(user), exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', signingKey()).update(body).digest('base64url');
  return { token: `${body}.${sig}`, exp };
}

export function readSession(req) {
  if (!configured()) return null;
  const m = String(req.headers.authorization || '').match(/^Bearer\s+([\w-]+)\.([\w-]+)$/);
  if (!m) return null;
  const want = crypto.createHmac('sha256', signingKey()).update(m[1]).digest();
  const got = Buffer.from(m[2], 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch { return null; }
  if (!p || typeof p.exp !== 'number' || p.exp * 1000 < Date.now()) return null;
  const x = users().find(y => y.u === p.u);
  if (!x || fingerprint(x) !== p.v) return null; // user removed or password changed
  return { u: x.u, name: x.name, exp: p.exp };
}

// For handlers: returns the session, or answers the request (500/401) and returns null.
export function requireSession(req, res) {
  if (!configured()) { res.status(500).json({ error: 'Server has no users: set GULL_USERS (or GULL_USERNAME and GULL_PASSWORD) in its environment variables.' }); return null; }
  const s = readSession(req);
  if (!s) { res.status(401).json({ error: 'Session expired. Sign in again.' }); return null; }
  return s;
}
