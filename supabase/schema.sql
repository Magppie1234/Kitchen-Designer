-- supabase/schema.sql — the design store on Supabase Postgres: profiles / projects / rooms /
-- revisions / shares / audit log, with row-level security doing the per-designer separation.
--
-- Run ONCE in the Supabase dashboard: SQL Editor -> New query -> paste this file -> Run.
-- Safe to re-run (IF NOT EXISTS / OR REPLACE / ON CONFLICT throughout).
--
-- Who sees what (enforced here, in the database, not just in the app):
--   designer — reads and writes only their own projects, rooms, revisions and shares
--   admin    — reads everything, writes nothing (view-only)
-- Accounts are invite-only (public sign-up is off in Supabase Auth). Every invited user
-- becomes a designer; ADMIN_EMAIL below becomes the admin.

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user, created automatically when the invite is sent
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text not null,
  role       text not null default 'designer' check (role in ('designer','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, split_part(new.email, '@', 1),
          case when lower(new.email) = 'info@mymagppie.com' then 'admin' else 'designer' end)  -- ADMIN_EMAIL
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- users invited before this file was run
insert into public.profiles (id, email, name, role)
select id, email, split_part(email, '@', 1),
       case when lower(email) = 'info@mymagppie.com' then 'admin' else 'designer' end
from auth.users on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Design store (same shape as the old db/migrations 001-003, JSON as jsonb)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references public.profiles(id),
  name         text not null,
  details      jsonb not null default '{}',
  status       text not null default 'assigned' check (status in ('assigned','in-process','submitted')),
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  category   text not null default 'rk-show',
  series_id  text,
  state      jsonb not null default '{}',   -- live autosave target, recovery only
  value      bigint,                        -- latest room total (INR), for cheap listings
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.revisions (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  number     integer not null,               -- set by the trigger below
  reason     text not null,
  state      jsonb not null,                 -- immutable snapshot
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (room_id, number)
);

create table if not exists public.shares (
  id               uuid primary key default gen_random_uuid(),
  token            text unique not null,
  room_id          uuid not null references public.rooms(id) on delete cascade,
  revision_id      uuid not null references public.revisions(id),
  include_estimate boolean not null default true,
  expires_at       timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  project_id uuid,
  room_id    uuid,
  actor      uuid default auth.uid(),
  action     text not null,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists projects_owner_idx  on public.projects (owner_id);
create index if not exists rooms_project_idx   on public.rooms (project_id);
create index if not exists revisions_room_idx  on public.revisions (room_id);
create index if not exists shares_room_idx     on public.shares (room_id);
create index if not exists audit_project_idx   on public.audit_log (project_id);

-- Revision numbers per room: 1, 2, 3 ... assigned in the database so two saves at the same
-- moment (two tabs, two serverless instances) can never collide.
create or replace function public.set_revision_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.room_id::text));
  select coalesce(max(number), 0) + 1 into new.number from public.revisions where room_id = new.room_id;
  return new;
end $$;

drop trigger if exists revisions_number on public.revisions;
create trigger revisions_number before insert on public.revisions
  for each row execute function public.set_revision_number();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
-- security definer helpers, so policies do not recurse through each other's RLS
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.owns_project(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = pid and owner_id = auth.uid())
$$;

create or replace function public.owns_room(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rooms r join public.projects p on p.id = r.project_id
                 where r.id = rid and p.owner_id = auth.uid())
$$;

alter table public.profiles  enable row level security;
alter table public.projects  enable row level security;
alter table public.rooms     enable row level security;
alter table public.revisions enable row level security;
alter table public.shares    enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_id = auth.uid() and not public.is_admin());
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms for select to authenticated
  using (public.owns_project(project_id) or public.is_admin());
drop policy if exists rooms_insert on public.rooms;
create policy rooms_insert on public.rooms for insert to authenticated
  with check (public.owns_project(project_id));
drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms for update to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));

-- revisions are never updated or deleted, so there are no update/delete policies
drop policy if exists revisions_read on public.revisions;
create policy revisions_read on public.revisions for select to authenticated
  using (public.owns_room(room_id) or public.is_admin());
drop policy if exists revisions_insert on public.revisions;
create policy revisions_insert on public.revisions for insert to authenticated
  with check (public.owns_room(room_id) and created_by = auth.uid());

-- clients open share links without logging in; the server reads those with the secret key
drop policy if exists shares_read on public.shares;
create policy shares_read on public.shares for select to authenticated
  using (public.owns_room(room_id) or public.is_admin());
drop policy if exists shares_insert on public.shares;
create policy shares_insert on public.shares for insert to authenticated
  with check (public.owns_room(room_id));

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated
  using (actor = auth.uid() or public.is_admin());
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (actor = auth.uid());

-- Dashboard listing: one row per live project with its owner and revision count. Runs
-- with the caller's rights (security_invoker), so it shows exactly what RLS allows.
create or replace view public.project_summaries with (security_invoker = true) as
select p.id, p.owner_id, p.name, p.details, p.status, p.submitted_at, p.created_at, p.updated_at,
       pr.name as owner_name, pr.email as owner_email,
       (select count(*) from public.revisions rv join public.rooms r on r.id = rv.room_id
        where r.project_id = p.id)::int as revision_count
from public.projects p join public.profiles pr on pr.id = p.owner_id
where p.deleted_at is null;

-- ---------------------------------------------------------------------------
-- Storage: snapshot and AI-render images (kept out of the design JSON so saves stay
-- under Vercel's 4.5 MB request limit). Public bucket with unguessable file names, so
-- client share links can show the images; designers may only upload into their own folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('design-images', 'design-images', true, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists design_images_upload on storage.objects;
create policy design_images_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'design-images'
              and (storage.foldername(name))[1] = auth.uid()::text
              and not public.is_admin());
