create table if not exists public.sycle_evidence_sources (
  id text primary key,
  name text not null,
  publisher text not null,
  url text not null,
  licence text,
  licence_commercial_ok boolean,
  update_cadence text
);

create table if not exists public.sycle_evidence_source_versions (
  id text primary key,
  source_id text not null references public.sycle_evidence_sources(id),
  edition text not null,
  ingested_at timestamptz not null,
  checksum text not null unique
);

create table if not exists public.sycle_evidence_geographies (
  id text primary key,
  name text not null,
  level text not null check (level in ('country','state','county','site')),
  parent_id text references public.sycle_evidence_geographies(id)
);

create table if not exists public.sycle_evidence_indicators (
  id text primary key,
  name text not null,
  unit text,
  direction text not null,
  unep_stakeholder text not null,
  unep_subcategory text not null
);

create table if not exists public.sycle_evidence (
  id text primary key,
  indicator_id text not null references public.sycle_evidence_indicators(id),
  geography_id text not null references public.sycle_evidence_geographies(id),
  sector_code text,
  value numeric,
  value_text text,
  source_version_id text not null references public.sycle_evidence_source_versions(id),
  geo_level_used text not null check (geo_level_used in ('country','state','county','site')),
  is_fallback boolean not null default false,
  confidence text not null check (confidence in ('H','M','L')),
  notes text,
  check (value is not null or value_text is not null)
);

create table if not exists public.sycle_evidence_jurisdiction_rules (
  id text primary key,
  geography_id text not null references public.sycle_evidence_geographies(id),
  rule_key text not null,
  rule_value jsonb,
  effective_from date,
  source_url text not null,
  verified boolean not null default false,
  verified_by text,
  verified_at timestamptz
);

create index if not exists sycle_evidence_lookup_idx
  on public.sycle_evidence(indicator_id, geography_id, sector_code);

create index if not exists sycle_rules_lookup_idx
  on public.sycle_evidence_jurisdiction_rules(geography_id, rule_key, verified);

comment on table public.sycle_evidence is
  'Append-only versioned evidence. Corrections must insert new source versions and evidence ids.';
