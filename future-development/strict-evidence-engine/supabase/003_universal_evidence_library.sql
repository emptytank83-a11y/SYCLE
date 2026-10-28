create extension if not exists pg_trgm;

create table if not exists public.sycle_dataset_library (
  id text primary key,
  title text not null,
  publisher text not null,
  source_url text not null,
  dataset_url text,
  source_type text not null,
  licence_name text,
  licence_url text,
  licence_status text not null check (licence_status in ('permitted','permitted_with_attribution','review_required','restricted')),
  authority_score integer not null check (authority_score between 0 and 100),
  scope jsonb not null default '{}'::jsonb,
  status text not null check (status in ('discovered','queued','acquiring','active','restricted','failed')),
  discovered_at timestamptz not null default now(),
  last_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.sycle_dataset_versions (
  id text primary key,
  dataset_id text not null references public.sycle_dataset_library(id) on delete cascade,
  publication_year integer,
  retrieved_at timestamptz not null,
  content_checksum text not null,
  raw_storage_path text,
  content_type text,
  byte_size bigint,
  record_count bigint,
  retrieval_status text not null check (retrieval_status in ('verified','metadata_only','unavailable','restricted')),
  retrieval_http_status integer,
  metadata jsonb not null default '{}'::jsonb,
  unique(dataset_id, content_checksum)
);

create table if not exists public.sycle_evidence_claims (
  id text primary key,
  dataset_version_id text not null references public.sycle_dataset_versions(id),
  product_key text not null,
  industry text not null,
  lifecycle_stage_id text,
  claim_type text not null,
  statement text not null,
  evidence_quote text not null,
  locator text not null,
  geography text,
  publication_year integer,
  confidence text not null check (confidence in ('H','M','L')),
  stakeholder text,
  risk_level text,
  quote_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.sycle_evidence_measurements (
  id text primary key,
  dataset_version_id text not null references public.sycle_dataset_versions(id),
  indicator_id text not null,
  indicator_name text not null,
  value numeric,
  value_text text,
  unit text not null,
  geography text not null,
  geography_level text not null,
  observation_year integer,
  evidence_quote text not null,
  locator text not null,
  interpretation text not null,
  confidence text not null check (confidence in ('H','M','L')),
  quote_verified boolean not null default false,
  created_at timestamptz not null default now(),
  check (value is not null or value_text is not null)
);

create table if not exists public.sycle_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  dataset_id text not null references public.sycle_dataset_library(id) on delete cascade,
  dataset_url text not null,
  status text not null default 'queued' check (status in ('queued','running','complete','failed','restricted')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(dataset_id, dataset_url)
);

create table if not exists public.sycle_report_evidence_snapshots (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  product text not null,
  geography jsonb not null,
  request_data jsonb not null,
  lifecycle jsonb not null,
  evidence_manifest jsonb not null,
  calculations jsonb not null,
  validation jsonb not null,
  checksum text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists sycle_dataset_status_idx on public.sycle_dataset_library(status, publisher);
create index if not exists sycle_dataset_scope_gin_idx on public.sycle_dataset_library using gin(scope);
create index if not exists sycle_claim_product_idx on public.sycle_evidence_claims(product_key, lifecycle_stage_id, claim_type);
create index if not exists sycle_claim_geography_idx on public.sycle_evidence_claims(geography);
create index if not exists sycle_measurement_lookup_idx on public.sycle_evidence_measurements(indicator_id, geography, observation_year desc);
create index if not exists sycle_ingestion_queue_idx on public.sycle_ingestion_jobs(status, next_attempt_at);

insert into storage.buckets (id, name, public, file_size_limit)
values ('sycle-evidence-raw', 'sycle-evidence-raw', false, 1073741824)
on conflict (id) do update set public = false;

alter table public.sycle_dataset_library enable row level security;
alter table public.sycle_dataset_versions enable row level security;
alter table public.sycle_evidence_claims enable row level security;
alter table public.sycle_evidence_measurements enable row level security;
alter table public.sycle_ingestion_jobs enable row level security;
alter table public.sycle_report_evidence_snapshots enable row level security;

revoke all on public.sycle_dataset_library from anon, authenticated;
revoke all on public.sycle_dataset_versions from anon, authenticated;
revoke all on public.sycle_evidence_claims from anon, authenticated;
revoke all on public.sycle_evidence_measurements from anon, authenticated;
revoke all on public.sycle_ingestion_jobs from anon, authenticated;
revoke all on public.sycle_report_evidence_snapshots from anon, authenticated;
grant select, insert, update on public.sycle_dataset_library to service_role;
grant select, insert, update on public.sycle_dataset_versions to service_role;
grant select, insert, update on public.sycle_evidence_claims to service_role;
grant select, insert, update on public.sycle_evidence_measurements to service_role;
grant select, insert, update on public.sycle_ingestion_jobs to service_role;
grant select, insert on public.sycle_report_evidence_snapshots to service_role;

create or replace function public.sycle_claim_library_search(
  p_product_key text,
  p_geography text,
  p_limit integer default 100
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb)
  from (
    select c.*, v.retrieved_at, v.content_checksum, v.raw_storage_path,
      d.title as source_title, d.publisher, d.source_url, d.dataset_url, d.licence_status
    from public.sycle_evidence_claims c
    join public.sycle_dataset_versions v on v.id = c.dataset_version_id
    join public.sycle_dataset_library d on d.id = v.dataset_id
    where (lower(c.product_key) = lower(p_product_key)
      or lower(c.product_key) % lower(p_product_key))
      and (c.geography is null or lower(c.geography) = lower(p_geography))
      and v.retrieval_status = 'verified'
    order by c.confidence asc, v.retrieved_at desc
    limit greatest(1, least(p_limit, 500))
  ) result;
$$;

revoke all on function public.sycle_claim_library_search(text,text,integer) from public, anon, authenticated;
grant execute on function public.sycle_claim_library_search(text,text,integer) to service_role;

create or replace function public.sycle_get_evidence_bundle(
  p_country_code text,
  p_geography_keys text[],
  p_sector_key text,
  p_variant text default 'default'
) returns jsonb
language sql
security definer
set search_path = public
as $$
  with active_snapshot as (
    select * from public.sycle_evidence_snapshots where status = 'active' order by generated_at desc limit 1
  ), selected_profile as (
    select p.* from public.sycle_industry_profiles p, active_snapshot s
    where p.snapshot_id = s.id and p.sector_key = p_sector_key and p.variant in (p_variant, 'default')
    order by (p.variant = p_variant) desc, p.version desc limit 1
  ), selected_records as (
    select e.* from public.sycle_evidence_records e, active_snapshot s
    where e.snapshot_id = s.id and (e.geography_key = any(p_geography_keys) or e.geography_key = 'GLOBAL')
      and (e.sector_key is null or e.sector_key = p_sector_key)
  ), material_keys as (
    select distinct jsonb_array_elements_text(stage->'materials') as material_key
    from selected_profile p, jsonb_array_elements(p.profile->'stages') stage
  ), selected_origins as (
    select m.* from public.sycle_material_origins m, active_snapshot s
    where m.snapshot_id = s.id and m.material_key in (select material_key from material_keys)
  ), origin_country_records as (
    select e.* from public.sycle_evidence_records e, active_snapshot s
    where e.snapshot_id = s.id and e.country_code in (select distinct country_code from selected_origins)
      and e.indicator_id in ('control_of_corruption','vulnerable_employment','child_forced_labour_goods_flag')
  ), version_ids as (
    select source_version_id from selected_records
    union select source_version_id from selected_origins
    union select unnest(array(select jsonb_array_elements_text(source_ids))) from selected_profile
  )
  select jsonb_build_object(
    'snapshot', (select to_jsonb(s) from active_snapshot s),
    'profile', (select to_jsonb(p) from selected_profile p),
    'records', coalesce((select jsonb_agg(to_jsonb(r)) from selected_records r), '[]'::jsonb),
    'material_origins', coalesce((select jsonb_agg(to_jsonb(m)) from selected_origins m), '[]'::jsonb),
    'origin_country_records', coalesce((select jsonb_agg(to_jsonb(r)) from origin_country_records r), '[]'::jsonb),
    'source_versions', coalesce((select jsonb_agg(to_jsonb(v)) from public.sycle_evidence_source_versions v where v.id in (select source_version_id from version_ids)), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(to_jsonb(src)) from public.sycle_evidence_sources src where src.id in (select v.source_id from public.sycle_evidence_source_versions v where v.id in (select source_version_id from version_ids))), '[]'::jsonb)
  );
$$;
