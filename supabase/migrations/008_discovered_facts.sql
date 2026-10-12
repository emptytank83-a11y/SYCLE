-- Verified facts found by web discovery, the registry of publishers SYCLE has learned, and a human review queue.
-- Rows are written by the server with the service-role key only.

create table if not exists public.sycle_discovered_facts (
  id text primary key,
  question_key text not null,
  indicator_id text not null,
  kind text not null check (kind in ('indicator','benchmark')),
  ladder_level text not null check (ladder_level in ('exact','sector_country','country','international')),
  proxy boolean not null default false,
  geography text not null,
  geography_level text not null,
  observation_year integer,
  value numeric,
  value_text text,
  unit text not null default '',
  evidence_quote text not null default '',
  locator text not null default '',
  source_url text not null default '',
  source_title text,
  publisher text,
  source_class text not null,
  trust_score numeric not null default 0,
  trust_reason text not null,
  page_checksum text not null default '',
  retrieved_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null check (status in ('verified','conflict','miss')),
  metadata jsonb not null default '{}'::jsonb,
  check (status = 'miss' or value is not null or value_text is not null)
);
create index if not exists sycle_discovered_facts_lookup_idx
  on public.sycle_discovered_facts(question_key, expires_at desc);

create table if not exists public.sycle_source_registry (
  id text primary key,                 -- host name
  class text not null,
  trust_score numeric not null,
  reason text not null,
  assigned_by text not null default 'rule',
  review_status text not null default 'auto' check (review_status in ('auto','pending_review','approved','rejected')),
  times_used integer not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.sycle_review_queue (
  id text primary key,
  kind text not null,
  payload jsonb not null,
  reason text,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.sycle_discovered_facts enable row level security;
alter table public.sycle_source_registry enable row level security;
alter table public.sycle_review_queue enable row level security;
revoke all on public.sycle_discovered_facts from anon, authenticated;
revoke all on public.sycle_source_registry from anon, authenticated;
revoke all on public.sycle_review_queue from anon, authenticated;
grant select, insert, update on public.sycle_discovered_facts to service_role;
grant select, insert, update on public.sycle_source_registry to service_role;
grant select, insert, update on public.sycle_review_queue to service_role;
