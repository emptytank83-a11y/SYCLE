create table if not exists public.sycle_user_reports (
  user_id uuid not null references auth.users(id) on delete cascade,
  report_id text not null,
  report_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, report_id)
);

create index if not exists sycle_user_reports_updated_idx on public.sycle_user_reports(user_id, updated_at desc);
alter table public.sycle_user_reports enable row level security;
revoke all on public.sycle_user_reports from anon, authenticated;
grant select, insert, update, delete on public.sycle_user_reports to service_role;
