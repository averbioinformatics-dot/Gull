# Gull

A voice "second brain" for a BTC/USDT spot desk. You sign in, a glowing eye fills the screen, and you talk to it. She answers out loud, with subtitles under the eye. When she shows you something (the chart, the market overview, a trade analysis, the news) the eye moves to the left and the panel opens on the right.

- `public/index.html` is the whole app: the sign-in page, the eye, the voice, subtitles, the stage panels (market, chart, analysis, plan, score, news, journal, transcript, help), and the scoring engine.
- `api/login.js` handles sign-in. Each person has their own username and password (stored only as scrypt hashes in `GULL_USERS`) and gets a signed session token.
- `api/anthropic.js` forwards Gull's questions to Anthropic. The API key lives here, never in the browser. A valid session unlocks it.
- `api/state.js` saves each person's journal and settings, plus the shared news scan, to Supabase so every device sees the same desk.
- `lib/auth.js` is the shared sign-in and session code. `scripts/hash-password.mjs` makes a new account.
- `supabase/migrations/` holds the one table, so Supabase's GitHub integration can create it.

## Her voice
Gull speaks with **Kokoro** ([hexgrad/kokoro](https://github.com/hexgrad/kokoro), Apache-2.0), a free, open-source neural voice that runs inside the browser through [kokoro-js](https://www.npmjs.com/package/kokoro-js). There's nothing to pay for, and no audio leaves the device. The first time, the browser downloads the model once: about 310 MB on a computer with WebGPU (faster, best quality) or about 90 MB on a phone. After that it loads from the browser's cache in a few seconds.

She talks the way people do: "hmm", "um", "okay so", "exactly", short pauses, a breath before a long explanation, the odd sigh when the market is ugly. Kokoro speaks the fillers itself. The breaths and sighs are generated sound mixed between her sentences, because no free in-browser voice can produce them. Twelve voices are in Settings (Heart, a warm American woman, is the default), and you can switch back to the browser's own voice.

Price data, the order book, and Fear & Greed come straight from public endpoints (Binance, alternative.me) in your browser; the server never calls them.

## How it works

1. **Sign in.** Opening the link shows a username and password page. Each person sees their own journal and settings, and Gull greets them by first name; the news scan is shared. "Keep me signed in" lasts 30 days on that device; otherwise the session lasts 12 hours.
2. **Asleep.** After sign-in the eye is a dim slit, listening only for its wake words: **"wakey wakey Gull"**, **"hey, I'm home"**, **"hey, I'm back"** (or "hey Gull"). You can tap the eye too.
3. **Awake.** She opens the eye, greets you, gives the price and the desk's lean, and keeps listening. Ask in your own words:
   - "What's going on in the market?" gives the whole scenario: where we came from (daily trend, 7/30/90-day moves, place in the 300-day range, structure), what's happening now (4h momentum, 15m trigger, volume, order book, Fear & Greed, session), and what to watch next.
   - "What's the news?" gives the top story, how it's likely to move BTC, whether it's priced in, events ahead, and whether to trade, wait or stay out. It scans the web if the last scan is over an hour old.
   - "Should I trade?" runs the full routine every time: fresh data, fresh news, past/present/future analysis, bull/base/bear odds, then the trade on screen with entry, stop, two targets, reward/risk, size, dollars at risk, and how to place it on Binance (buy plus OCO).
   - Anything about spot trading: order types, OCO, sizing, R multiples, RSI, sessions, CPI days, psychology.
4. **"Close it"** or Esc brings the eye back full screen. **"Goodnight Gull"** or "that's all" puts her to sleep; she also dozes off after 10 quiet minutes (Settings).

The desk rules are enforced by the page, not just requested from the model. A buy with reward/risk under 1.5, a buy with high news event risk, a position under Binance's minimum, or conviction under 3 of 5 is shown as WAIT, with the reason.

## Deploy in 15 minutes

### 1. Put the code on GitHub
The code lives in a private GitHub repo. To make changes, edit, commit and push; Vercel and Supabase pick up the push.

### 2. Create the database (Supabase)
1. supabase.com → **New project**.
2. If the Supabase project is connected to this GitHub repo (Project Settings → Integrations → GitHub, Supabase directory `supabase`, deploy to production on), it creates the table from `supabase/migrations` when you push. Otherwise: **SQL Editor** → **New query** → paste `supabase/migrations/20261027000000_gull_state.sql` → **Run**. Either way, **Table Editor** should then show `gull_state`.
3. **Project Settings → API**: copy the **Project URL** and the **service_role** (secret) key. Never put this key in the browser or in Git.

### 3. Deploy (Vercel)
1. vercel.com → **Add New… → Project** → **Import** your repo.
2. Before you press Deploy, open **Environment Variables** and add the ones from `.env.example`:
   - `ANTHROPIC_API_KEY` from console.anthropic.com. Set a monthly spend limit there too.
   - `GULL_USERS`: the accounts, as a JSON list of usernames, names and password hashes.
   - `GULL_SESSION_SECRET`: any long random string. It signs sessions; changing it signs every device out.
   - `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from step 2.
3. **Deploy**. Vercel gives you a URL like `https://gull-yourname.vercel.app`.

**Adding a person or changing a password:** run `node scripts/hash-password.mjs <username> "<Full Name>"`. It prints a new strong password and a JSON entry. Add the entry to the `GULL_USERS` list in Vercel (or replace that person's entry), then redeploy. Only that person is signed out. To remove someone, delete their entry and redeploy.

### 4. First run
Open the URL in **Chrome or Edge** (they are the browsers that can listen). Sign in. Allow the microphone when asked. Say "wakey wakey Gull".

On your phone: open the same URL in Chrome, sign in with "keep me signed in", then "Add to Home screen".

## Costs
- Vercel Hobby and Supabase Free are enough for two people.
- The voice is free: it runs on your own device.
- Anthropic: a normal question is a fraction of a cent to a few cents. A news scan adds about 1¢ per web search plus tokens (a few cents to ~15¢). A full trade analysis is usually 2–10¢, more if it has to scan the news first. The greeting itself is free (computed in the page); the optional AI briefing after it is not.
- The fixed part of Gull's instructions is prompt-cached, so repeat questions are cheaper.

## Change things
Edit `public/index.html`, commit, push. Vercel redeploys automatically. Balance, risk per trade, fees, news weight, wake words, auto-sleep, the voice and what Gull calls you are in the Settings panel (gear icon).

## Troubleshooting
- **"Wrong username or password"** means the username isn't in `GULL_USERS` or the password doesn't match its hash. Usernames are not case-sensitive; passwords are.
- **She speaks in the robotic voice.** The natural voice is still downloading (the progress shows under the eye the first time), or this browser can't run it (Settings → Voice engine says why). Old phones and old Safari versions fall back to the browser voice.
- **Long pauses between her sentences.** Kokoro is making speech slower than she says it, usually on a phone or a computer without WebGPU. Use Chrome or Edge on a computer, or switch to the browser voice in Settings. Changing an environment variable requires a redeploy (Vercel → Deployments → ⋯ → Redeploy).
- **"The sign-in service did not answer"** means the page is running without its `api` folder (for example, opened as a file). Use the Vercel URL, or `vercel dev` locally.
- **"Server is missing …"** means an environment variable is not set in Vercel.
- **She doesn't hear the wake words** if the mic button is red. Allow the microphone for the site (padlock icon → Site settings), use Chrome or Edge, and make sure you're on https. On Android Chrome the mic may beep when it restarts listening; that's the browser.
- **She hears herself.** She stops listening while she talks. If your speakers are very loud she can still catch the tail end; lower the volume or use headphones. Tap the eye or press Esc to cut her off.
- **Something she didn't mean wakes her.** "Hey girl" counts as "hey Gull" because speech recognition often hears it that way. Turn off wake words in Settings if that's a problem.
- **The journal doesn't sync.** Check `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`, and that the SQL ran (Table Editor should show `gull_state`).
- **Prices don't load.** Binance blocks some countries at the browser level; a VPN location change fixes it.
- **The news scan times out.** Vercel functions are capped at 60 s on the Hobby plan; lower "Max web searches per news scan" in Settings to 3 or 4.

## Not financial advice
Gull reads indicators, the order book and headlines and gives probability leans with an invalidation level. She will be wrong often. Paper-trade with her journal for a month before any real money.
