alter table public.sycle_report_evidence_snapshots
  add column if not exists product_resolution jsonb not null default '{}'::jsonb;
