create table if not exists public.daily_choices (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  recommended_type text not null,
  actual_choice text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.daily_choices to authenticated;
grant all on public.daily_choices to service_role;

alter table public.daily_choices enable row level security;