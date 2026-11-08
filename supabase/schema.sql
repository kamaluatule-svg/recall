-- Recall database schema (Supabase / PostgreSQL)
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Identity comes from Firebase Auth, so user ids are Firebase UIDs (text),
-- not Supabase auth.users uuids. All access goes through the Recall API,
-- which uses the service_role key. RLS is enabled with NO policies for
-- anon/authenticated, so the public publishable key can read nothing.

create table if not exists public.profiles (
  id            text primary key check (char_length(id) between 1 and 128),
  email         text,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table if not exists public.decks (
  id          uuid primary key,
  user_id     text not null references public.profiles(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 48),
  subject     text not null default 'General' check (char_length(subject) between 1 and 32),
  icon        text not null default 'layers-2',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists decks_user_idx on public.decks (user_id, created_at);

create table if not exists public.cards (
  id             uuid primary key,
  deck_id        uuid not null references public.decks(id) on delete cascade,
  user_id        text not null references public.profiles(id) on delete cascade,
  question       text not null check (char_length(question) between 1 and 500),
  answer         text not null check (char_length(answer) between 1 and 1000),
  interval_days  int  not null default 0 check (interval_days between 0 and 30),
  due_at         timestamptz,                       -- null = never scheduled (due now)
  seen_count     int  not null default 0 check (seen_count >= 0),
  correct_count  int  not null default 0 check (correct_count >= 0 and correct_count <= seen_count),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists cards_deck_idx on public.cards (deck_id);
create index if not exists cards_user_due_idx on public.cards (user_id, due_at);

create table if not exists public.study_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.profiles(id) on delete cascade,
  day         text not null check (day ~ '^\d{4}-\d{1,2}-\d{1,2}$'),  -- learner's local day key
  reviewed    int  not null check (reviewed between 1 and 10000),
  correct     int  not null check (correct between 0 and 10000 and correct <= reviewed),
  created_at  timestamptz not null default now()
);
create index if not exists sessions_user_idx on public.study_sessions (user_id, created_at desc);

-- Row Level Security: deny everything to browser-facing roles.
alter table public.profiles       enable row level security;
alter table public.decks          enable row level security;
alter table public.cards          enable row level security;
alter table public.study_sessions enable row level security;

revoke all on public.profiles, public.decks, public.cards, public.study_sessions
  from anon, authenticated;
-- service_role bypasses RLS and is used only by the Render backend.
