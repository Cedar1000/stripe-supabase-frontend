-- Family Tree schema for Supabase (multi-tenant: one tenant per family).
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Functions, triggers and policies are safe to re-run. Tables are created only if
-- missing, so to upgrade from the earlier single-family schema, run the reset block first:
--
--   drop table if exists public.chat_messages, public.tree_admins, public.people,
--     public.family_invites, public.family_members, public.families cascade;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per login account (created automatically on sign-up).
create table if not exists public.user_profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- A tenant. Everything else hangs off a family.
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_by uuid default auth.uid() references public.user_profiles on delete set null,
  created_at timestamptz not null default now()
);

-- Public (read-only, no login) sharing of a family's tree. Off until a 1st-level admin enables it.
alter table public.families add column if not exists is_public boolean not null default false;
alter table public.families add column if not exists public_slug text unique;
alter table public.families add column if not exists public_hide_living boolean not null default true;

-- Who can see a family's tree and chat.
create table if not exists public.family_members (
  family_id uuid not null references public.families on delete cascade,
  user_id uuid not null references public.user_profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index if not exists family_members_user_idx on public.family_members (user_id);

-- Invite code per family; kept apart from `families` so only admins can read it.
create table if not exists public.family_invites (
  family_id uuid primary key references public.families on delete cascade,
  code text not null unique,
  updated_at timestamptz not null default now()
);

-- One row per person on a tree. parent_id is the "up link".
-- Partial dates are stored as the LAST day of the given period
-- (year only -> 31 Dec, month+year -> last day of month) together with a
-- precision flag so the UI shows only what was entered.
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families on delete cascade,
  parent_id uuid references public.people on delete restrict,
  name text not null check (length(trim(name)) > 0),
  gender text not null check (gender in ('male', 'female')),
  photo_url text,
  birth_date date,
  birth_precision text check (birth_precision in ('year', 'month', 'day')),
  is_deceased boolean not null default false,
  death_date date,
  death_precision text check (death_precision in ('year', 'month', 'day')),
  bio text not null default '',
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  check ((birth_date is null) = (birth_precision is null)),
  check ((death_date is null) = (death_precision is null)),
  check (is_deceased or death_date is null)
);
create index if not exists people_family_idx on public.people (family_id);
create index if not exists people_parent_id_idx on public.people (parent_id);

-- Admin grants within a family. scope_person_id NULL = 1st-level admin of the
-- whole family tree; otherwise a 2nd-level admin of the branch rooted there.
create table if not exists public.tree_admins (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families on delete cascade,
  user_id uuid not null references public.user_profiles on delete cascade,
  scope_person_id uuid references public.people on delete cascade,
  granted_by uuid default auth.uid() references public.user_profiles on delete set null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (family_id, user_id, scope_person_id)
);
create index if not exists tree_admins_family_idx on public.tree_admins (family_id);

-- Chat. recipient_id NULL = the family's general room, otherwise a private message.
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families on delete cascade,
  sender_id uuid not null default auth.uid() references public.user_profiles on delete cascade,
  recipient_id uuid references public.user_profiles on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_family_idx on public.chat_messages (family_id, created_at);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------

create or replace function public.is_member(fid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from family_members where family_id = fid and user_id = auth.uid());
$$;

create or replace function public.is_family_admin(fid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from tree_admins where family_id = fid and user_id = auth.uid());
$$;

-- 1st-level admin of the family.
create or replace function public.is_family_owner(fid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from tree_admins
    where family_id = fid and user_id = auth.uid() and scope_person_id is null
  );
$$;

-- True when `target` is `branch_root` or one of its descendants.
create or replace function public.is_in_branch(branch_root uuid, target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  with recursive up as (
    select id, parent_id from people where id = target
    union
    select p.id, p.parent_id from people p join up on p.id = up.parent_id
  )
  select exists (select 1 from up where id = branch_root);
$$;

-- True when the current user may edit `target` (and therefore its branch).
create or replace function public.can_edit_person(target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from people p
    join tree_admins a on a.family_id = p.family_id
    where p.id = target
      and a.user_id = auth.uid()
      and (a.scope_person_id is null or public.is_in_branch(a.scope_person_id, target))
  );
$$;

-- Eight characters without look-alikes (no 0/O, 1/I/L).
create or replace function public.random_invite_code()
returns text
language sql volatile
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 31), 1), '')
  from (select gen_random_bytes(8) as b) x, generate_series(0, 7) as i;
$$;

-- Onboarding: create a family; the caller becomes its member and 1st-level admin.
create or replace function public.create_family(family_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into families (name, created_by) values (trim(family_name), auth.uid()) returning id into fid;
  insert into family_members (family_id, user_id) values (fid, auth.uid());
  insert into tree_admins (family_id, user_id, scope_person_id, granted_by) values (fid, auth.uid(), null, auth.uid());
  insert into family_invites (family_id, code) values (fid, random_invite_code());
  return fid;
end;
$$;

-- Onboarding: join a family with its invite code.
create or replace function public.join_family(invite_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select family_id into fid from family_invites where code = upper(trim(invite_code));
  if fid is null then raise exception 'That invite code is not valid'; end if;
  insert into family_members (family_id, user_id) values (fid, auth.uid()) on conflict do nothing;
  return fid;
end;
$$;

-- Any admin of the family may issue a new code (the old one stops working).
create or replace function public.regenerate_invite(fid uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare new_code text := random_invite_code();
begin
  if not public.is_family_admin(fid) then raise exception 'Only family admins can do this'; end if;
  insert into family_invites (family_id, code) values (fid, new_code)
  on conflict (family_id) do update set code = excluded.code, updated_at = now();
  return new_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public share links
-- ---------------------------------------------------------------------------

-- "The Okafor Family" -> "okafor-7k2p9qrx": readable, but the random part makes it unguessable.
create or replace function public.new_public_slug(family_name text)
returns text
language sql volatile
as $$
  select coalesce(
    nullif(left(trim(both '-' from regexp_replace(lower(regexp_replace(family_name, '^\s*the\s+', '', 'i')), '[^a-z0-9]+', '-', 'g')), 40), ''),
    'family'
  ) || '-' || lower(random_invite_code());
$$;

-- Turn the public link on/off and choose whether living relatives' details are hidden.
create or replace function public.set_public_sharing(fid uuid, enabled boolean, hide_living boolean)
returns text
language plpgsql security definer set search_path = public
as $$
declare slug text;
begin
  if not public.is_family_owner(fid) then raise exception 'Only 1st-level admins can change public sharing'; end if;
  update families
  set is_public = enabled,
      public_hide_living = hide_living,
      public_slug = coalesce(public_slug, new_public_slug(name))
  where id = fid
  returning public_slug into slug;
  return slug;
end;
$$;

-- New link; the old one stops working immediately.
create or replace function public.regenerate_public_link(fid uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare slug text;
begin
  if not public.is_family_owner(fid) then raise exception 'Only 1st-level admins can change public sharing'; end if;
  update families set public_slug = new_public_slug(name) where id = fid returning public_slug into slug;
  return slug;
end;
$$;

-- The only way anonymous visitors can read a tree. Returns null unless the family is public.
-- When public_hide_living is on, living people are reduced to name + place in the tree here,
-- so their photos, dates and write-ups never leave the database.
create or replace function public.get_public_tree(slug text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'family', jsonb_build_object('id', f.id, 'name', f.name, 'hide_living', f.public_hide_living),
    'people', coalesce((
      select jsonb_agg(
        case when f.public_hide_living and not p.is_deceased then
          jsonb_build_object(
            'id', p.id, 'family_id', p.family_id, 'parent_id', p.parent_id, 'name', p.name,
            'gender', p.gender, 'is_deceased', false, 'photo_url', null, 'bio', '',
            'birth_date', null, 'birth_precision', null, 'death_date', null, 'death_precision', null,
            'created_at', p.created_at, 'redacted', true, 'sibling_rank', p.sibling_rank
          )
        else to_jsonb(p) - 'created_by'
        end
      )
      from (
        -- sibling_rank keeps siblings in birth order even when their dates are hidden.
        select people.*, row_number() over (
          partition by people.parent_id order by people.birth_date nulls last, people.name
        ) as sibling_rank
        from people where people.family_id = f.id
      ) p
    ), '[]'::jsonb)
  )
  from families f
  where f.public_slug = slug and f.is_public;
$$;

grant execute on function public.get_public_tree(text) to anon, authenticated;

-- Create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into user_profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for accounts that existed before this script ran.
insert into public.user_profiles (id, email, display_name)
select id, email, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- Keep people inside their family and under the same parent.
create or replace function public.people_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.parent_id is distinct from old.parent_id then
      raise exception 'A person cannot be moved to a different parent';
    end if;
    if new.family_id <> old.family_id then
      raise exception 'A person cannot be moved to another family';
    end if;
  end if;
  if new.parent_id is not null
     and not exists (select 1 from people where id = new.parent_id and family_id = new.family_id) then
    raise exception 'Parent belongs to a different family';
  end if;
  return new;
end;
$$;

drop trigger if exists people_guard on public.people;
create trigger people_guard
  before insert or update on public.people
  for each row execute function public.people_guard();

-- Leaving (or being removed from) a family also removes admin rights there.
create or replace function public.member_removed()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from tree_admins where family_id = old.family_id and user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists member_removed on public.family_members;
create trigger member_removed
  after delete on public.family_members
  for each row execute function public.member_removed();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.user_profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invites enable row level security;
alter table public.people enable row level security;
alter table public.tree_admins enable row level security;
alter table public.chat_messages enable row level security;

-- Profiles: yourself, plus anyone who shares a family with you.
drop policy if exists "profiles readable by relatives" on public.user_profiles;
create policy "profiles readable by relatives" on public.user_profiles
  for select to authenticated
  using (
    id = auth.uid() or exists (
      select 1 from family_members mine join family_members theirs on theirs.family_id = mine.family_id
      where mine.user_id = auth.uid() and theirs.user_id = user_profiles.id
    )
  );

drop policy if exists "profiles self update" on public.user_profiles;
create policy "profiles self update" on public.user_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Families: members can read; 1st-level admins can rename. Creation goes through create_family().
drop policy if exists "families readable by members" on public.families;
create policy "families readable by members" on public.families
  for select to authenticated using (public.is_member(id));

drop policy if exists "families renamed by owners" on public.families;
create policy "families renamed by owners" on public.families
  for update to authenticated using (public.is_family_owner(id)) with check (public.is_family_owner(id));

-- Members: visible to fellow members. 1st-level admins remove people; anyone may leave.
drop policy if exists "members readable by members" on public.family_members;
create policy "members readable by members" on public.family_members
  for select to authenticated using (public.is_member(family_id));

drop policy if exists "members removed by owners or self" on public.family_members;
create policy "members removed by owners or self" on public.family_members
  for delete to authenticated using (user_id = auth.uid() or public.is_family_owner(family_id));

drop policy if exists "invites readable by admins" on public.family_invites;
create policy "invites readable by admins" on public.family_invites
  for select to authenticated using (public.is_family_admin(family_id));

-- People
drop policy if exists "people readable by members" on public.people;
create policy "people readable by members" on public.people
  for select to authenticated using (public.is_member(family_id));

-- Adding a child needs edit rights on the parent; a new root needs a 1st-level admin.
drop policy if exists "people insert by admins" on public.people;
create policy "people insert by admins" on public.people
  for insert to authenticated
  with check (
    case when parent_id is null then public.is_family_owner(family_id)
    else public.can_edit_person(parent_id) end
  );

drop policy if exists "people update by admins" on public.people;
create policy "people update by admins" on public.people
  for update to authenticated
  using (public.can_edit_person(id))
  with check (public.can_edit_person(id));

drop policy if exists "people delete by admins" on public.people;
create policy "people delete by admins" on public.people
  for delete to authenticated using (public.can_edit_person(id));

-- Admin grants
drop policy if exists "admins readable by members" on public.tree_admins;
create policy "admins readable by members" on public.tree_admins
  for select to authenticated using (public.is_member(family_id));

-- 1st-level admins grant anything in their family; branch admins only inside their branch.
-- The new admin must be a member, and the branch must belong to the same family.
drop policy if exists "admins grant" on public.tree_admins;
create policy "admins grant" on public.tree_admins
  for insert to authenticated
  with check (
    exists (select 1 from family_members m where m.family_id = tree_admins.family_id and m.user_id = tree_admins.user_id)
    and (
      (scope_person_id is null and public.is_family_owner(family_id))
      or (
        scope_person_id is not null
        and exists (select 1 from people p where p.id = scope_person_id and p.family_id = tree_admins.family_id)
        and (public.is_family_owner(family_id) or public.can_edit_person(scope_person_id))
      )
    )
  );

drop policy if exists "admins revoke" on public.tree_admins;
create policy "admins revoke" on public.tree_admins
  for delete to authenticated
  using (
    public.is_family_owner(family_id)
    or (scope_person_id is not null and public.can_edit_person(scope_person_id))
  );

-- Chat
drop policy if exists "chat read" on public.chat_messages;
create policy "chat read" on public.chat_messages
  for select to authenticated
  using (
    public.is_member(family_id)
    and (recipient_id is null or sender_id = auth.uid() or recipient_id = auth.uid())
  );

drop policy if exists "chat send" on public.chat_messages;
create policy "chat send" on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_member(family_id)
    and (
      recipient_id is null
      or exists (select 1 from family_members m where m.family_id = chat_messages.family_id and m.user_id = recipient_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Photo storage: public read; uploads go to "<family_id>/..." by that family's admins
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "photos public read" on storage.objects;
create policy "photos public read" on storage.objects
  for select using (bucket_id = 'photos');

drop policy if exists "photos admin upload" on storage.objects;
create policy "photos admin upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and exists (
      select 1 from public.tree_admins
      where user_id = auth.uid() and family_id::text = (storage.foldername(name))[1]
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime (live chat + live tree updates)
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['people', 'tree_admins', 'chat_messages', 'family_members', 'families'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
