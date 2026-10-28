alter table public.sycle_report_evidence_snapshots
  add column if not exists assessment jsonb not null default '{}'::jsonb,
  add column if not exists review_status text not null default 'analyst_review_required'
    check (review_status in ('analyst_review_required', 'in_review', 'approved', 'changes_requested', 'superseded'));

create table if not exists public.sycle_indicator_benchmarks (
  id text primary key,
  indicator_id text not null,
  stakeholder text not null,
  subcategory text not null,
  product_pattern text,
  sector_code text,
  geography_key text,
  benchmark_type text not null,
  benchmark_value jsonb not null,
  unit text not null,
  score_rules jsonb not null,
  source_dataset_version_id text references public.sycle_dataset_versions(id),
  effective_from date,
  effective_to date,
  quality_grade text not null check (quality_grade in ('A', 'B', 'C', 'D')),
  status text not null default 'active' check (status in ('draft', 'active', 'superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sycle_report_reviews (
  id uuid primary key default gen_random_uuid(),
  report_snapshot_id text not null references public.sycle_report_evidence_snapshots(id) on delete cascade,
  report_owner_id uuid references auth.users(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  status text not null check (status in ('analyst_review_required', 'in_review', 'approved', 'changes_requested')),
  score_overrides jsonb not null default '[]'::jsonb,
  reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.sycle_report_audit_events (
  id bigint generated always as identity primary key,
  report_snapshot_id text not null references public.sycle_report_evidence_snapshots(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sycle_benchmark_lookup_idx
  on public.sycle_indicator_benchmarks(indicator_id, geography_key, sector_code, status);
create index if not exists sycle_report_review_idx
  on public.sycle_report_reviews(report_snapshot_id, created_at desc);
create index if not exists sycle_report_audit_idx
  on public.sycle_report_audit_events(report_snapshot_id, created_at);

alter table public.sycle_indicator_benchmarks enable row level security;
alter table public.sycle_report_reviews enable row level security;
alter table public.sycle_report_audit_events enable row level security;

revoke all on public.sycle_indicator_benchmarks from anon, authenticated;
revoke all on public.sycle_report_reviews from anon, authenticated;
revoke all on public.sycle_report_audit_events from anon, authenticated;
grant select, insert, update on public.sycle_indicator_benchmarks to service_role;
grant select, insert, update on public.sycle_report_reviews to service_role;
grant select, insert on public.sycle_report_audit_events to service_role;
