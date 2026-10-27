-- Gull's memory. One small table; the Vercel functions read and write it with the service key.
-- Rows: "news" (shared), "journal:<user>" and "settings:<user>" (one per signed-in user).
create table if not exists public.gull_state (
  key        text primary key,          -- 'news', 'journal:<user>', 'settings:<user>'
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Lock the table down: with RLS on and no policies, the public anon key can read nothing.
-- The service key used by the server bypasses RLS, which is exactly what we want.
alter table public.gull_state enable row level security;
