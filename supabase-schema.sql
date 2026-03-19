-- SkillSwap schema for Supabase
-- Run this in the SQL editor of your Supabase project.

create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null,
  teach text not null,
  learn text not null,
  level text not null default 'Beginner',
  availability text not null default 'Flexible',
  bio text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.swap_requests (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles(user_id) on delete cascade,
  target_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'rejected')) default 'pending',
  created_at timestamptz not null default now()
);

create unique index if not exists ux_swap_request_pair_pending
  on public.swap_requests(requester_id, target_id, status)
  where status = 'pending';

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  room_key text not null,
  sender_id uuid not null references public.profiles(user_id) on delete cascade,
  receiver_id uuid not null references public.profiles(user_id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.skill_catalog (
  id bigint generated always as identity primary key,
  skill text not null unique,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_room_key on public.messages(room_key, created_at);
create index if not exists idx_skill_catalog_skill on public.skill_catalog(skill);

create or replace function public.set_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_timestamp on public.profiles;
create trigger trg_profiles_timestamp
before update on public.profiles
for each row execute function public.set_timestamp();

alter table public.profiles enable row level security;
alter table public.swap_requests enable row level security;
alter table public.messages enable row level security;
alter table public.skill_catalog enable row level security;

-- Profiles policies
drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
create policy "Profiles are viewable by authenticated users"
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists "Users can manage own profile" on public.profiles;
create policy "Users can manage own profile"
  on public.profiles
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Swap request policies
drop policy if exists "Users can view their own requests" on public.swap_requests;
create policy "Users can view their own requests"
  on public.swap_requests
  for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = target_id);

drop policy if exists "Users can insert own outgoing requests" on public.swap_requests;
create policy "Users can insert own outgoing requests"
  on public.swap_requests
  for insert
  to authenticated
  with check (auth.uid() = requester_id);

drop policy if exists "Targets can update incoming requests" on public.swap_requests;
create policy "Targets can update incoming requests"
  on public.swap_requests
  for update
  to authenticated
  using (auth.uid() = target_id)
  with check (auth.uid() = target_id);

drop policy if exists "Participants can delete their requests" on public.swap_requests;
create policy "Participants can delete their requests"
  on public.swap_requests
  for delete
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = target_id);

-- Message policies
drop policy if exists "Participants can read room messages" on public.messages;
create policy "Participants can read room messages"
  on public.messages
  for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "Users can send own messages" on public.messages;
create policy "Users can send own messages"
  on public.messages
  for insert
  to authenticated
  with check (auth.uid() = sender_id);

-- Skill catalog policies
drop policy if exists "Authenticated users can read skills" on public.skill_catalog;
create policy "Authenticated users can read skills"
  on public.skill_catalog
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can insert skills" on public.skill_catalog;
create policy "Authenticated users can insert skills"
  on public.skill_catalog
  for insert
  to authenticated
  with check (true);
