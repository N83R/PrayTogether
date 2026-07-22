-- Prayer Wall production database
-- Run this entire file in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create type public.post_type as enum ('prayer', 'praise');
create type public.post_status as enum ('pending', 'active', 'hidden', 'expired', 'deleted', 'rejected');

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  type public.post_type not null,
  body text not null check (char_length(body) between 12 and 500),
  display_name varchar(40),
  status public.post_status not null default 'pending',
  prayed_count bigint not null default 0 check (prayed_count >= 0),
  report_count integer not null default 0 check (report_count >= 0),
  tag_id varchar(80),
  moderation_reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  updated_at timestamptz not null default now()
);

create table public.prayer_actions (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  tag_id varchar(80),
  created_at timestamptz not null default now()
);

create table public.reports (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  tag_id varchar(80),
  reason text,
  created_at timestamptz not null default now()
);

create index posts_public_wall_idx on public.posts (status, expires_at, created_at desc);
create index prayer_actions_created_idx on public.prayer_actions (created_at desc);
create index prayer_actions_post_idx on public.prayer_actions (post_id);
create index reports_post_idx on public.reports (post_id);

create or replace function public.set_post_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  if tg_op = 'INSERT' then
    new.expires_at = case
      when new.type = 'praise' then now() + interval '120 days'
      else now() + interval '90 days'
    end;
  end if;
  return new;
end;
$$;

create trigger posts_set_defaults
before insert or update on public.posts
for each row execute function public.set_post_defaults();

create or replace function public.record_prayer(target_post_id uuid, source_tag_id text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare new_count bigint;
begin
  insert into public.prayer_actions(post_id, tag_id)
  select id, source_tag_id from public.posts
  where id = target_post_id and type = 'prayer' and status = 'active' and expires_at > now();

  if not found then raise exception 'Prayer request is not active'; end if;

  update public.posts
  set prayed_count = prayed_count + 1, updated_at = now()
  where id = target_post_id
  returning prayed_count into new_count;

  return new_count;
end;
$$;

create or replace function public.report_post(target_post_id uuid, source_tag_id text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare new_count integer;
begin
  insert into public.reports(post_id, tag_id)
  select id, source_tag_id from public.posts
  where id = target_post_id and status = 'active';

  if not found then raise exception 'Post is not active'; end if;

  update public.posts
  set report_count = report_count + 1,
      status = case when report_count + 1 >= 3 then 'hidden'::public.post_status else status end,
      moderation_reason = case when report_count + 1 >= 3 then 'Auto-hidden after multiple reports.' else moderation_reason end,
      updated_at = now()
  where id = target_post_id
  returning report_count into new_count;

  return new_count;
end;
$$;

create or replace function public.get_prayer_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'today', count(*) filter (where created_at >= date_trunc('day', now())),
    'week', count(*) filter (where created_at >= now() - interval '7 days'),
    'month', count(*) filter (where created_at >= now() - interval '30 days'),
    'year', count(*) filter (where created_at >= now() - interval '365 days'),
    'lifetime', count(*)
  ) from public.prayer_actions;
$$;

alter table public.posts enable row level security;
alter table public.prayer_actions enable row level security;
alter table public.reports enable row level security;

-- Anyone may read active, unexpired posts.
create policy "public reads active posts"
on public.posts for select
to anon, authenticated
using (status = 'active' and expires_at > now());

-- Public visitors may submit, but may not set counters or privileged states.
create policy "public submits posts"
on public.posts for insert
to anon, authenticated
with check (
  status in ('active', 'pending', 'rejected')
  and prayed_count = 0
  and report_count = 0
);

-- Authenticated admin users may read and manage all posts.
create policy "admins read all posts"
on public.posts for select
to authenticated
using (true);

create policy "admins update posts"
on public.posts for update
to authenticated
using (true)
with check (true);

-- Direct table access to action/report logs stays closed. Public writes happen only through RPC functions.
revoke all on public.prayer_actions from anon, authenticated;
revoke all on public.reports from anon, authenticated;

revoke all on function public.record_prayer(uuid, text) from public;
revoke all on function public.report_post(uuid, text) from public;
revoke all on function public.get_prayer_stats() from public;
grant execute on function public.record_prayer(uuid, text) to anon, authenticated;
grant execute on function public.report_post(uuid, text) to anon, authenticated;
grant execute on function public.get_prayer_stats() to anon, authenticated;

grant select, insert on public.posts to anon, authenticated;
grant update on public.posts to authenticated;
