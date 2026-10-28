-- Budget Goal Planner database schema
-- Run this script in Supabase Dashboard > SQL Editor.
-- The backend uses a server-only service-role key and enforces ownership on every private query.
-- RLS is enabled as defense in depth. No anon/authenticated policies are granted because this app
-- does not use Supabase Auth directly; browser access must go through the Express API.

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  name varchar(80) not null check (char_length(trim(name)) between 2 and 80),
  email varchar(254) not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  category varchar(50) not null check (char_length(trim(category)) between 1 and 50),
  amount numeric(12,2) not null check (amount > 0 and amount <= 100000000),
  month date not null check (extract(day from month) = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category, month)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  description varchar(120) not null check (char_length(trim(description)) between 1 and 120),
  category varchar(50) not null check (char_length(trim(category)) between 1 and 50),
  amount numeric(12,2) not null check (amount > 0 and amount <= 100000000),
  spent_on date not null,
  created_at timestamptz not null default now()
);

create index if not exists budgets_user_month_idx on public.budgets(user_id, month);
create index if not exists expenses_user_spent_on_idx on public.expenses(user_id, spent_on desc);
create index if not exists expenses_user_category_idx on public.expenses(user_id, category);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at before update on public.app_users
for each row execute function public.set_updated_at();

drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at before update on public.budgets
for each row execute function public.set_updated_at();

alter table public.app_users enable row level security;
alter table public.budgets enable row level security;
alter table public.expenses enable row level security;

-- Intentionally no public RLS policies: all database access is server-side only.
-- Keep SUPABASE_SERVICE_ROLE_KEY on the server, never in frontend code.
