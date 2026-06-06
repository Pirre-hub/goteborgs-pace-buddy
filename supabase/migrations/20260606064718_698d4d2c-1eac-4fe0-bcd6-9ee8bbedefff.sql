create table if not exists public.coach_conversations (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  role text not null check (role in ('user', 'coach')),
  content text not null,
  triggers_replan boolean default false,
  created_at timestamptz not null default now()
);

grant all on public.coach_conversations to service_role;

alter table public.coach_conversations enable row level security;

create index if not exists coach_conversations_date_idx on public.coach_conversations(date);