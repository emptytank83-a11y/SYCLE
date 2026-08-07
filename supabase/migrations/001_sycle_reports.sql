create extension if not exists pgcrypto;

create table if not exists public.sycle_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  product text not null,
  country text not null,
  region text,
  sector_key text not null,
  report_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sycle_reports enable row level security;

create policy "Users can read own SYCLE reports"
on public.sycle_reports
for select
using (auth.uid() = user_id);

create policy "Users can insert own SYCLE reports"
on public.sycle_reports
for insert
with check (auth.uid() = user_id);

create policy "Users can update own SYCLE reports"
on public.sycle_reports
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own SYCLE reports"
on public.sycle_reports
for delete
using (auth.uid() = user_id);

create or replace function public.set_sycle_reports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sycle_reports_updated_at on public.sycle_reports;
create trigger sycle_reports_updated_at
before update on public.sycle_reports
for each row
execute function public.set_sycle_reports_updated_at();
