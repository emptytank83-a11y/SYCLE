create table if not exists public.sycle_product_identities (
  id text primary key,
  product_key text not null unique,
  requested_product text not null,
  resolved_product text not null,
  wikidata_id text,
  description text,
  confidence text not null check (confidence in ('H','M','L')),
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sycle_product_aliases (
  id text primary key,
  product_identity_id text not null references public.sycle_product_identities(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now()
  ,unique(product_identity_id, normalized_alias)
);

create table if not exists public.sycle_product_classifications (
  id text primary key,
  product_identity_id text not null references public.sycle_product_identities(id) on delete cascade,
  scheme text not null,
  code text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(product_identity_id, scheme, code)
);

create table if not exists public.sycle_lifecycle_profiles (
  id text primary key,
  product_identity_id text not null references public.sycle_product_identities(id) on delete cascade,
  product_key text not null,
  version integer not null default 1,
  boundary text not null,
  summary text not null,
  research_plan jsonb not null,
  evidence_checksum text not null,
  status text not null default 'active' check (status in ('draft','active','superseded','rejected')),
  created_at timestamptz not null default now(),
  unique(product_key, version)
);

create table if not exists public.sycle_process_stages (
  id text primary key,
  lifecycle_profile_id text not null references public.sycle_lifecycle_profiles(id) on delete cascade,
  ordinal integer not null,
  title text not null,
  description text not null,
  actor text not null,
  foreground boolean not null default false,
  inputs jsonb not null default '[]'::jsonb,
  outputs jsonb not null default '[]'::jsonb,
  social_risks jsonb not null default '[]'::jsonb,
  logistics text not null,
  evidence_claim_ids jsonb not null default '[]'::jsonb,
  unique(lifecycle_profile_id, ordinal)
);

create table if not exists public.sycle_process_edges (
  id text primary key,
  lifecycle_profile_id text not null references public.sycle_lifecycle_profiles(id) on delete cascade,
  from_stage_id text not null,
  to_stage_id text not null,
  flow_label text not null,
  evidence_claim_ids jsonb not null default '[]'::jsonb,
  unique(lifecycle_profile_id, from_stage_id, to_stage_id)
);

create table if not exists public.sycle_materials (
  id text primary key,
  normalized_name text not null unique,
  display_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sycle_lifecycle_materials (
  id text primary key,
  lifecycle_profile_id text not null references public.sycle_lifecycle_profiles(id) on delete cascade,
  material_id text not null references public.sycle_materials(id) on delete cascade,
  unique(lifecycle_profile_id, material_id)
);

create table if not exists public.sycle_geographic_entities (
  id text primary key,
  name text not null,
  country_code text,
  level text not null,
  parent_id text references public.sycle_geographic_entities(id),
  identifiers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sycle_evidence_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','resolving_product','searching_library','discovering_sources','retrieving_evidence','validating','building_report','complete','failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  public_message text not null default 'Preparing the evidence job',
  product_key text,
  request_payload jsonb not null,
  result_payload jsonb,
  error_code text,
  access_token_hash text not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sycle_product_identity_key_idx on public.sycle_product_identities using gin(product_key gin_trgm_ops);
create index if not exists sycle_lifecycle_product_idx on public.sycle_lifecycle_profiles(product_key, status, version desc);
create index if not exists sycle_evidence_job_queue_idx on public.sycle_evidence_jobs(status, next_attempt_at, created_at);

alter table public.sycle_product_identities enable row level security;
alter table public.sycle_product_aliases enable row level security;
alter table public.sycle_product_classifications enable row level security;
alter table public.sycle_lifecycle_profiles enable row level security;
alter table public.sycle_process_stages enable row level security;
alter table public.sycle_process_edges enable row level security;
alter table public.sycle_materials enable row level security;
alter table public.sycle_lifecycle_materials enable row level security;
alter table public.sycle_geographic_entities enable row level security;
alter table public.sycle_evidence_jobs enable row level security;

revoke all on public.sycle_product_identities, public.sycle_product_aliases, public.sycle_product_classifications, public.sycle_lifecycle_profiles, public.sycle_process_stages, public.sycle_process_edges, public.sycle_materials, public.sycle_lifecycle_materials, public.sycle_geographic_entities, public.sycle_evidence_jobs from anon, authenticated;
grant select, insert, update on public.sycle_product_identities, public.sycle_product_aliases, public.sycle_product_classifications, public.sycle_lifecycle_profiles, public.sycle_process_stages, public.sycle_process_edges, public.sycle_materials, public.sycle_lifecycle_materials, public.sycle_geographic_entities, public.sycle_evidence_jobs to service_role;

create or replace view public.source_catalog as select * from public.sycle_dataset_library;
create or replace view public.source_versions as select * from public.sycle_dataset_versions;
create or replace view public.evidence_claims as select * from public.sycle_evidence_claims;
create or replace view public.report_evidence_snapshots as select * from public.sycle_report_evidence_snapshots;

revoke all on public.source_catalog, public.source_versions, public.evidence_claims, public.report_evidence_snapshots from anon, authenticated;
grant select on public.source_catalog, public.source_versions, public.evidence_claims, public.report_evidence_snapshots to service_role;
