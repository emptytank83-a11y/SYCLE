create extension if not exists pgcrypto;

create table if not exists public.sycle_evidence_snapshots (
  id text primary key,
  generated_at timestamptz not null,
  checksum text not null unique,
  status text not null check (status in ('active','superseded')),
  record_count integer not null check (record_count >= 0),
  notes text
);

create table if not exists public.sycle_evidence_sources (
  id text primary key,
  name text not null,
  publisher text not null,
  canonical_url text not null,
  licence text,
  update_cadence text,
  source_type text not null
);

create table if not exists public.sycle_evidence_source_versions (
  id text primary key,
  source_id text not null references public.sycle_evidence_sources(id),
  edition text not null,
  retrieved_at timestamptz not null,
  checksum text not null,
  snapshot_id text not null references public.sycle_evidence_snapshots(id),
  unique(source_id, edition, checksum)
);

create table if not exists public.sycle_evidence_records (
  id text primary key,
  indicator_id text not null,
  indicator_name text not null,
  geography_key text not null,
  geography_name text not null,
  geography_level text not null check (geography_level in ('global','country','state','county','site')),
  country_code text,
  sector_key text,
  product_key text,
  value numeric,
  value_text text,
  unit text not null,
  confidence text not null check (confidence in ('H','M','L')),
  interpretation text not null,
  source_version_id text not null references public.sycle_evidence_source_versions(id),
  snapshot_id text not null references public.sycle_evidence_snapshots(id),
  dimensions jsonb not null default '{}'::jsonb,
  check (value is not null or value_text is not null)
);

create table if not exists public.sycle_material_origins (
  id text primary key,
  material_key text not null,
  material_name text not null,
  country_code text not null,
  country_name text not null,
  basis text not null,
  social_topics jsonb not null default '[]'::jsonb,
  confidence text not null check (confidence in ('H','M','L')),
  source_version_id text not null references public.sycle_evidence_source_versions(id),
  snapshot_id text not null references public.sycle_evidence_snapshots(id)
);

create table if not exists public.sycle_industry_profiles (
  id text primary key,
  sector_key text not null,
  variant text not null default 'default',
  version integer not null,
  product_patterns jsonb not null,
  naics_codes jsonb not null default '[]'::jsonb,
  hs_codes jsonb not null default '[]'::jsonb,
  profile jsonb not null,
  source_ids jsonb not null,
  checksum text not null,
  snapshot_id text not null references public.sycle_evidence_snapshots(id),
  unique(sector_key, variant, version)
);

create index if not exists sycle_evidence_geo_indicator_idx
  on public.sycle_evidence_records(geography_key, indicator_id, sector_key);
create index if not exists sycle_material_key_idx
  on public.sycle_material_origins(material_key, country_code);
create index if not exists sycle_profile_lookup_idx
  on public.sycle_industry_profiles(sector_key, variant, version desc);

alter table public.sycle_evidence_snapshots enable row level security;
alter table public.sycle_evidence_sources enable row level security;
alter table public.sycle_evidence_source_versions enable row level security;
alter table public.sycle_evidence_records enable row level security;
alter table public.sycle_material_origins enable row level security;
alter table public.sycle_industry_profiles enable row level security;

revoke all on public.sycle_evidence_snapshots from anon, authenticated;
revoke all on public.sycle_evidence_sources from anon, authenticated;
revoke all on public.sycle_evidence_source_versions from anon, authenticated;
revoke all on public.sycle_evidence_records from anon, authenticated;
revoke all on public.sycle_material_origins from anon, authenticated;
revoke all on public.sycle_industry_profiles from anon, authenticated;
grant select, insert, update on public.sycle_evidence_snapshots to service_role;
grant select, insert, update on public.sycle_evidence_sources to service_role;
grant select, insert on public.sycle_evidence_source_versions to service_role;
grant select, insert on public.sycle_evidence_records to service_role;
grant select, insert on public.sycle_material_origins to service_role;
grant select, insert on public.sycle_industry_profiles to service_role;

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
    select * from public.sycle_evidence_snapshots
    where status = 'active'
    order by generated_at desc
    limit 1
  ), selected_profile as (
    select p.* from public.sycle_industry_profiles p, active_snapshot s
    where p.snapshot_id = s.id
      and p.sector_key = p_sector_key
      and p.variant in (p_variant, 'default')
    order by (p.variant = p_variant) desc, p.version desc
    limit 1
  ), selected_records as (
    select e.* from public.sycle_evidence_records e, active_snapshot s
    where e.snapshot_id = s.id
      and (e.geography_key = any(p_geography_keys) or e.geography_key = 'GLOBAL')
      and (e.sector_key is null or e.sector_key = p_sector_key)
  ), material_keys as (
    select distinct jsonb_array_elements_text(stage->'materials') as material_key
    from selected_profile p,
      jsonb_array_elements(p.profile->'stages') stage
  ), selected_origins as (
    select m.* from public.sycle_material_origins m, active_snapshot s
    where m.snapshot_id = s.id
      and m.material_key in (select material_key from material_keys)
  ), origin_country_records as (
    select e.* from public.sycle_evidence_records e, active_snapshot s
    where e.snapshot_id = s.id
      and e.country_code in (select distinct country_code from selected_origins)
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

revoke all on function public.sycle_get_evidence_bundle(text,text[],text,text) from public, anon, authenticated;
grant execute on function public.sycle_get_evidence_bundle(text,text[],text,text) to service_role;
