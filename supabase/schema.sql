-- Splitzy database
-- Run once in a fresh Supabase project: Dashboard → SQL Editor → paste → Run.
--
-- Security model: every table has row level security. The browser can only
-- READ rows the signed-in user is allowed to see. Every WRITE goes through a
-- security-definer function below that checks permissions itself, so rules
-- like "only the owner can approve a join request" live in the database and
-- can't be skipped by a modified client.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  email text not null,
  -- e.g. name@okhdfcbank; lets group-mates pay them straight from the app
  upi_id text check (upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,63}$'),
  -- Shown instead of the initial on their avatar; one emoji (ZWJ sequences
  -- such as 👨‍👩‍👧 run to several code points, hence 16), never plain text
  avatar_emoji text check (char_length(avatar_emoji) between 1 and 16 and avatar_emoji !~ '[A-Za-z0-9<>&"]'),
  -- Background of their avatar, as #rrggbb
  avatar_color text check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  -- How old a debt must be before the person owed can send a nudge
  nudge_after_days int not null default 3 check (nudge_after_days between 0 and 60),
  -- Group picture, same rules as a profile's
  avatar_emoji text check (char_length(avatar_emoji) between 1 and 16 and avatar_emoji !~ '[A-Za-z0-9<>&"]'),
  avatar_color text check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

-- One-time codes the owner hands out. A code is burned the moment someone
-- redeems it; redeeming only creates a join request the owner must approve.
create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index group_invites_group_idx on public.group_invites (group_id);

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invite_id uuid references public.group_invites (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index join_requests_one_pending on public.join_requests (group_id, user_id) where status = 'pending';

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  bucket text not null check (char_length(bucket) between 1 and 30),
  note text check (char_length(note) <= 120),
  amount numeric(12, 2) not null check (amount > 0),
  paid_by uuid not null references public.profiles (id),
  split_type text not null check (split_type in ('equal', 'exact', 'percent')),
  expense_date date not null default current_date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index expenses_group_idx on public.expenses (group_id, expense_date desc);

create table public.expense_splits (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  amount numeric(12, 2) not null check (amount >= 0),
  primary key (expense_id, user_id)
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_user uuid not null references public.profiles (id),
  to_user uuid not null references public.profiles (id),
  bucket text not null check (char_length(bucket) between 1 and 30),
  amount numeric(12, 2) not null check (amount > 0),
  note text check (char_length(note) <= 120),
  settled_on date not null default current_date,
  -- Only 'confirmed' payments reduce debts; the receiver confirms them
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  -- "Clear all" makes one row per bucket sharing a batch, confirmed together
  batch_id uuid not null default gen_random_uuid(),
  -- Who confirms it. Normally the person paid (to_user); in a "settle
  -- everything" batch, rows run both ways and the net receiver confirms all.
  confirm_by uuid references public.profiles (id),
  -- Set on the rows a completed smart settle writes to clear the snapshot
  plan_id uuid,
  decided_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index settlements_group_idx on public.settlements (group_id, settled_on desc);
create index settlements_inbox_idx on public.settlements (to_user, status);
create index settlements_batch_idx on public.settlements (batch_id);

-- Smart settle: the fewest payments that clear every debt in a group.
-- A plan snapshots the group's bucket debts, works out the transfers, needs
-- everyone involved to approve, then each transfer is paid and confirmed.
-- When the last one is confirmed, every snapshotted bucket debt clears.
create table public.smart_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'approving' check (status in ('approving', 'paying', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
-- At most one open plan per group
create unique index smart_plans_one_open on public.smart_plans (group_id) where status in ('approving', 'paying');

-- The debts the plan clears, as they stood when it was proposed
create table public.smart_plan_items (
  plan_id uuid not null references public.smart_plans (id) on delete cascade,
  debtor uuid not null references public.profiles (id) on delete cascade,
  creditor uuid not null references public.profiles (id) on delete cascade,
  bucket text not null,
  amount numeric(12, 2) not null check (amount > 0)
);
create index smart_plan_items_plan_idx on public.smart_plan_items (plan_id);

-- Everyone whose balance the plan changes; all of them must approve
create table public.smart_plan_members (
  plan_id uuid not null references public.smart_plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  approved_at timestamptz,
  primary key (plan_id, user_id)
);

-- The actual payments: one per pair, as few as possible
create table public.smart_transfers (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.smart_plans (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  paid_at timestamptz,
  confirmed_at timestamptz
);
create index smart_transfers_plan_idx on public.smart_transfers (plan_id);

-- Reminders from the person owed to the person who owes, shown in the
-- debtor's bell. At most one per pair per group per day.
create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null,
  buckets jsonb not null,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);
create index nudges_inbox_idx on public.nudges (to_user, dismissed_at);
create index nudges_limit_idx on public.nudges (group_id, from_user, to_user, created_at desc);

-- ---------------------------------------------------------------------------
-- New users get a profile automatically
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 60),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Permission helpers (security definer so policies don't recurse)
-- ---------------------------------------------------------------------------

create function public.is_member(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from group_members where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create function public.is_owner(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from groups where id = p_group_id and owner_id = auth.uid());
$$;

-- Can the current user see this person's profile? Yes if it's them, they share
-- a group, or the person has asked to join a group the current user owns.
create function public.can_see_profile(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_user_id = auth.uid()
    or exists (
      select 1 from group_members a
      join group_members b on b.group_id = a.group_id
      where a.user_id = auth.uid() and b.user_id = p_user_id
    )
    or exists (
      select 1 from join_requests jr
      join groups g on g.id = jr.group_id
      where jr.user_id = p_user_id and jr.status = 'pending' and g.owner_id = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- Row level security: reads only
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.join_requests enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements enable row level security;
alter table public.nudges enable row level security;
alter table public.smart_plans enable row level security;
alter table public.smart_plan_items enable row level security;
alter table public.smart_plan_members enable row level security;
alter table public.smart_transfers enable row level security;

create policy "see related profiles" on public.profiles
  for select to authenticated using (public.can_see_profile(id));
create policy "edit own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "see own groups" on public.groups
  for select to authenticated using (
    public.is_member(id)
    or exists (
      select 1 from public.join_requests jr
      where jr.group_id = groups.id and jr.user_id = (select auth.uid()) and jr.status = 'pending'
    )
  );

create policy "see co-members" on public.group_members
  for select to authenticated using (public.is_member(group_id));

create policy "owner sees invites" on public.group_invites
  for select to authenticated using (public.is_owner(group_id));

create policy "see own or owned requests" on public.join_requests
  for select to authenticated using (user_id = (select auth.uid()) or public.is_owner(group_id));

create policy "members see expenses" on public.expenses
  for select to authenticated using (public.is_member(group_id));

create policy "members see splits" on public.expense_splits
  for select to authenticated using (
    exists (select 1 from public.expenses e where e.id = expense_id and public.is_member(e.group_id))
  );

create policy "members see settlements" on public.settlements
  for select to authenticated using (public.is_member(group_id));

create policy "members see smart plans" on public.smart_plans
  for select to authenticated using (public.is_member(group_id));
create policy "members see smart plan items" on public.smart_plan_items
  for select to authenticated using (exists (select 1 from public.smart_plans p where p.id = plan_id and public.is_member(p.group_id)));
create policy "members see smart plan members" on public.smart_plan_members
  for select to authenticated using (exists (select 1 from public.smart_plans p where p.id = plan_id and public.is_member(p.group_id)));
create policy "members see smart transfers" on public.smart_transfers
  for select to authenticated using (exists (select 1 from public.smart_plans p where p.id = plan_id and public.is_member(p.group_id)));

create policy "see own nudges" on public.nudges
  for select to authenticated using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

-- Table privileges: signed-in users may read; the only direct write is
-- renaming yourself. Everything else goes through the functions below.
grant usage on schema public to anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant update (display_name, upi_id, avatar_emoji, avatar_color) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------

create function public.create_group(p_name text, p_currency text default 'INR')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'You need to sign in first'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the group a name'; end if;

  insert into groups (name, owner_id, currency)
  values (trim(p_name), v_uid, upper(coalesce(p_currency, 'INR')))
  returning id into v_id;

  insert into group_members (group_id, user_id) values (v_id, v_uid);
  return v_id;
end;
$$;

create function public.rename_group(p_group_id uuid, p_name text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_owner(p_group_id) then raise exception 'Only the group owner can rename the group'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the group a name'; end if;
  update groups set name = trim(p_name) where id = p_group_id;
end;
$$;

-- Owner sets the group's picture ('' or null clears either part)
create function public.set_group_avatar(p_group_id uuid, p_emoji text, p_color text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_owner(p_group_id) then raise exception 'Only the group owner can change the group picture'; end if;
  update groups
  set avatar_emoji = nullif(trim(p_emoji), ''), avatar_color = nullif(trim(p_color), '')
  where id = p_group_id;
end;
$$;

create function public.delete_group(p_group_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_owner(p_group_id) then raise exception 'Only the group owner can delete the group'; end if;
  delete from groups where id = p_group_id;
end;
$$;

-- Hand the group to another member. The old owner stays on as a normal
-- member; pending join requests and unused codes now belong to the new owner.
create function public.transfer_ownership(p_group_id uuid, p_new_owner uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_owner(p_group_id) then raise exception 'Only the group owner can hand over ownership'; end if;
  if p_new_owner = auth.uid() then raise exception 'You already own this group'; end if;
  if not exists (select 1 from group_members where group_id = p_group_id and user_id = p_new_owner) then
    raise exception 'The new owner must be a member of the group';
  end if;
  update groups set owner_id = p_new_owner where id = p_group_id;
end;
$$;

-- Everyone who appears in the group (current members plus anyone still on
-- old expenses) with their net balance. Positive = they get money back.
create function public.group_balances(p_group_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  upi_id text,
  avatar_emoji text,
  avatar_color text,
  is_member boolean,
  is_owner boolean,
  net numeric
)
language sql stable security definer set search_path = public
as $$
  with people as (
    select gm.user_id as uid from group_members gm where gm.group_id = p_group_id
    union select e.paid_by from expenses e where e.group_id = p_group_id
    union select s.user_id from expense_splits s join expenses e on e.id = s.expense_id where e.group_id = p_group_id
    union select st.from_user from settlements st where st.group_id = p_group_id
    union select st.to_user from settlements st where st.group_id = p_group_id
  ),
  flows as (
    select e.paid_by as uid, e.amount as amt from expenses e where e.group_id = p_group_id
    union all
    select s.user_id, -s.amount from expense_splits s join expenses e on e.id = s.expense_id where e.group_id = p_group_id
    union all
    select st.from_user, st.amount from settlements st where st.group_id = p_group_id and st.status = 'confirmed'
    union all
    select st.to_user, -st.amount from settlements st where st.group_id = p_group_id and st.status = 'confirmed'
  )
  select
    p.uid,
    pr.display_name,
    pr.email,
    pr.upi_id,
    pr.avatar_emoji,
    pr.avatar_color,
    exists (select 1 from group_members m where m.group_id = p_group_id and m.user_id = p.uid),
    g.owner_id = p.uid,
    coalesce((select sum(f.amt) from flows f where f.uid = p.uid), 0)
  from people p
  join profiles pr on pr.id = p.uid
  join groups g on g.id = p_group_id
  where is_member(p_group_id)
  order by 7 desc, 2;
$$;

-- Who owes whom, per bucket. Within a bucket, debts between the same two
-- people cancel out (P owes N 50 for Cab, N owes P 50 for Cab → nothing).
-- Different buckets never cancel each other, so each can be cleared alone.
create function public.bucket_debts(p_group_id uuid)
returns table (bucket text, debtor uuid, creditor uuid, amount numeric)
language sql stable security definer set search_path = public
as $$
  with flows as (
    -- everyone in a split owes the payer their share
    select e.bucket, s.user_id as debtor, e.paid_by as creditor, s.amount
    from expenses e
    join expense_splits s on s.expense_id = e.id
    where e.group_id = p_group_id and s.user_id <> e.paid_by
    union all
    -- a confirmed payment from A to B cancels that much of A's debt to B
    select st.bucket, st.to_user, st.from_user, st.amount
    from settlements st
    where st.group_id = p_group_id and st.status = 'confirmed'
  ),
  pairs as (
    -- positive owed: a owes b; negative: b owes a
    select f.bucket, least(f.debtor, f.creditor) as a, greatest(f.debtor, f.creditor) as b,
           sum(case when f.debtor < f.creditor then f.amount else -f.amount end) as owed
    from flows f
    group by 1, 2, 3
  )
  select
    p.bucket,
    case when p.owed > 0 then p.a else p.b end,
    case when p.owed > 0 then p.b else p.a end,
    abs(p.owed)
  from pairs p
  where abs(p.owed) >= 0.01 and is_member(p_group_id)
  order by 4 desc;
$$;

-- The current user's groups with what they owe and are owed in each.
create function public.my_groups()
returns table (
  id uuid,
  name text,
  currency text,
  owner_id uuid,
  owner_name text,
  member_count int,
  my_owe numeric,
  my_owed numeric,
  created_at timestamptz,
  last_activity timestamptz,
  avatar_emoji text,
  avatar_color text
)
language sql stable security definer set search_path = public
as $$
  select
    g.id,
    g.name,
    g.currency,
    g.owner_id,
    o.display_name,
    (select count(*)::int from group_members m where m.group_id = g.id),
    (select coalesce(sum(d.amount), 0) from bucket_debts(g.id) d where d.debtor = auth.uid()),
    (select coalesce(sum(d.amount), 0) from bucket_debts(g.id) d where d.creditor = auth.uid()),
    g.created_at,
    greatest(
      g.created_at,
      (select max(e.created_at) from expenses e where e.group_id = g.id),
      (select max(st.created_at) from settlements st where st.group_id = g.id)
    ),
    g.avatar_emoji,
    g.avatar_color
  from groups g
  join group_members me on me.group_id = g.id and me.user_id = auth.uid()
  join profiles o on o.id = g.owner_id
  order by 10 desc;
$$;

-- Owner removes a member, or a member removes themselves (leaves).
-- Only allowed once that person is settled up in the group.
create function public.remove_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from groups where id = p_group_id;
  if v_owner is null or not is_member(p_group_id) then raise exception 'Group not found'; end if;
  if auth.uid() <> v_owner and auth.uid() <> p_user_id then
    raise exception 'Only the group owner can remove members';
  end if;
  if p_user_id = v_owner then
    raise exception 'The owner can''t leave. Delete the group instead.';
  end if;

  if exists (select 1 from bucket_debts(p_group_id) d where p_user_id in (d.debtor, d.creditor)) then
    raise exception 'They need to settle up before leaving the group';
  end if;
  if exists (select 1 from settlements where group_id = p_group_id and status = 'pending'
             and p_user_id in (from_user, to_user)) then
    raise exception 'They have payments waiting to be confirmed';
  end if;
  if exists (select 1 from smart_plan_members m join smart_plans p on p.id = m.plan_id
             where p.group_id = p_group_id and p.status in ('approving', 'paying') and m.user_id = p_user_id) then
    raise exception 'They''re part of a smart settle in progress';
  end if;

  delete from group_members where group_id = p_group_id and user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invites and join requests
-- ---------------------------------------------------------------------------

-- 8 characters from a 32-letter alphabet without look-alikes (no I, O, 0, 1).
create function public.create_invite(p_group_id uuid, p_hours int default 24)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_expires timestamptz := now() + make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 168));
  v_bytes bytea;
begin
  if not is_owner(p_group_id) then raise exception 'Only the group owner can create invite codes'; end if;

  loop
    v_bytes := gen_random_bytes(8);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
    end loop;
    exit when not exists (select 1 from group_invites where code = v_code);
  end loop;

  insert into group_invites (group_id, code, created_by, expires_at)
  values (p_group_id, v_code, auth.uid(), v_expires);

  return json_build_object('code', v_code, 'expires_at', v_expires);
end;
$$;

create function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_group uuid;
begin
  select group_id into v_group from group_invites where id = p_invite_id;
  if v_group is null or not is_owner(v_group) then raise exception 'Invite not found'; end if;
  update group_invites set revoked = true where id = p_invite_id;
end;
$$;

-- Burns the code and files a join request. The person is NOT in the group
-- until the owner approves.
create function public.redeem_invite(p_code text)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inv group_invites%rowtype;
  v_group groups%rowtype;
  v_owner_name text;
begin
  if v_uid is null then raise exception 'You need to sign in first'; end if;

  select * into v_inv from group_invites where code = v_code for update;
  if not found or v_inv.revoked then raise exception 'That code isn''t valid'; end if;
  if v_inv.used_at is not null then raise exception 'That code has already been used. Ask the owner for a new one.'; end if;
  if v_inv.expires_at < now() then raise exception 'That code has expired. Ask the owner for a new one.'; end if;

  select * into v_group from groups where id = v_inv.group_id;
  if exists (select 1 from group_members where group_id = v_group.id and user_id = v_uid) then
    raise exception 'You''re already in %', v_group.name;
  end if;
  if exists (select 1 from join_requests where group_id = v_group.id and user_id = v_uid and status = 'pending') then
    raise exception 'You already asked to join %. Waiting on the owner.', v_group.name;
  end if;

  update group_invites set used_by = v_uid, used_at = now() where id = v_inv.id;
  insert into join_requests (group_id, user_id, invite_id) values (v_group.id, v_uid, v_inv.id);

  select display_name into v_owner_name from profiles where id = v_group.owner_id;
  return json_build_object('group_id', v_group.id, 'group_name', v_group.name, 'owner_name', v_owner_name);
end;
$$;

create function public.respond_join_request(p_request_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_req join_requests%rowtype;
begin
  select * into v_req from join_requests where id = p_request_id for update;
  if not found or not is_owner(v_req.group_id) then
    raise exception 'Only the group owner can approve requests';
  end if;
  if v_req.status <> 'pending' then raise exception 'This request was already handled'; end if;

  update join_requests
  set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now()
  where id = p_request_id;

  if p_approve then
    insert into group_members (group_id, user_id) values (v_req.group_id, v_req.user_id)
    on conflict do nothing;
  end if;
end;
$$;

-- Requester withdraws their own pending request.
create function public.cancel_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from join_requests where id = p_request_id and user_id = auth.uid() and status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- Expenses and settlements
-- ---------------------------------------------------------------------------

-- Reuse an existing bucket's spelling so "cab" and "Cab" stay one bucket.
create function public.normalize_bucket(p_group_id uuid, p_bucket text)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select e.bucket from expenses e
     where e.group_id = p_group_id and lower(e.bucket) = lower(trim(p_bucket))
     order by e.created_at limit 1),
    trim(p_bucket)
  );
$$;

-- Insert (p_expense_id null) or update an expense with its splits in one go.
-- p_splits: [{"user_id": "...", "amount": 123.45}, ...] summing to p_amount.
create function public.save_expense(
  p_expense_id uuid,
  p_group_id uuid,
  p_bucket text,
  p_note text,
  p_amount numeric,
  p_paid_by uuid,
  p_split_type text,
  p_expense_date date,
  p_splits jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid := p_expense_id;
  v_bucket text;
  v_sum numeric := 0;
  v_split jsonb;
  v_user uuid;
  v_amt numeric;
  v_count int := 0;
begin
  if not is_member(p_group_id) then raise exception 'Group not found'; end if;
  if coalesce(trim(p_bucket), '') = '' then raise exception 'Pick a bucket'; end if;
  if char_length(trim(p_bucket)) > 30 then raise exception 'Bucket names can be up to 30 characters'; end if;
  v_bucket := normalize_bucket(p_group_id, p_bucket);
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be more than zero'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'Amount can have at most 2 decimals'; end if;
  if not exists (select 1 from group_members where group_id = p_group_id and user_id = p_paid_by) then
    raise exception 'The payer must be in the group';
  end if;
  if jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'Choose who this is split between';
  end if;

  for v_split in select * from jsonb_array_elements(p_splits) loop
    v_user := (v_split ->> 'user_id')::uuid;
    v_amt := (v_split ->> 'amount')::numeric;
    if v_amt is null or v_amt < 0 or v_amt <> round(v_amt, 2) then raise exception 'Invalid split amount'; end if;
    if not exists (select 1 from group_members where group_id = p_group_id and user_id = v_user) then
      raise exception 'Everyone in the split must be in the group';
    end if;
    v_sum := v_sum + v_amt;
    v_count := v_count + 1;
  end loop;

  if v_sum <> p_amount then raise exception 'Split amounts must add up to the total'; end if;
  if (select count(distinct x ->> 'user_id') from jsonb_array_elements(p_splits) x) <> v_count then
    raise exception 'Someone appears twice in the split';
  end if;

  if v_id is null then
    insert into expenses (group_id, bucket, note, amount, paid_by, split_type, expense_date, created_by)
    values (p_group_id, v_bucket, nullif(trim(p_note), ''), p_amount, p_paid_by, p_split_type,
            coalesce(p_expense_date, current_date), auth.uid())
    returning id into v_id;
  else
    update expenses
    set bucket = v_bucket, note = nullif(trim(p_note), ''), amount = p_amount, paid_by = p_paid_by,
        split_type = p_split_type, expense_date = coalesce(p_expense_date, expense_date)
    where id = v_id and group_id = p_group_id;
    if not found then raise exception 'Expense not found'; end if;
    delete from expense_splits where expense_id = v_id;
  end if;

  insert into expense_splits (expense_id, user_id, amount)
  select v_id, (x ->> 'user_id')::uuid, (x ->> 'amount')::numeric
  from jsonb_array_elements(p_splits) x
  where (x ->> 'amount')::numeric > 0;

  return v_id;
end;
$$;

create function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_group uuid;
begin
  select group_id into v_group from expenses where id = p_expense_id;
  if v_group is null or not is_member(v_group) then raise exception 'Expense not found'; end if;
  delete from expenses where id = p_expense_id;
end;
$$;

-- Shared checks for recording a payment from p_from to p_to.
create function public.check_payment_rights(p_group_id uuid, p_from uuid, p_to uuid)
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_member(p_group_id) then raise exception 'Group not found'; end if;
  if auth.uid() not in (p_from, p_to) and not is_owner(p_group_id) then
    raise exception 'Only the people involved or the owner can record this payment';
  end if;
  if p_from = p_to then raise exception 'Pick two different people'; end if;
  if (select count(*) from group_members where group_id = p_group_id and user_id in (p_from, p_to)) <> 2 then
    raise exception 'Both people must be in the group';
  end if;
  if exists (select 1 from smart_plans where group_id = p_group_id and status in ('approving', 'paying')) then
    raise exception 'A smart settle is in progress in this group. Finish or cancel it first.';
  end if;
end;
$$;

-- What p_from still owes p_to in a bucket after payments already waiting
-- for confirmation, so the same debt can't be paid twice while pending.
create function public.payable_amount(p_group_id uuid, p_from uuid, p_to uuid, p_bucket text)
returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce((select d.amount from bucket_debts(p_group_id) d
                   where d.bucket = p_bucket and d.debtor = p_from and d.creditor = p_to), 0)
       - coalesce((select sum(s.amount) from settlements s
                   where s.group_id = p_group_id and s.bucket = p_bucket and s.from_user = p_from
                     and s.to_user = p_to and s.status = 'pending'), 0);
$$;

-- Payments only count once the person being paid accepts them. If they
-- record it themselves it's accepted straight away.
create function public.initial_payment_status(p_to uuid)
returns text
language sql stable
as $$
  select case when auth.uid() = p_to then 'confirmed' else 'pending' end;
$$;

-- Record that p_from paid p_to toward one bucket (all of it or part).
create function public.add_settlement(
  p_group_id uuid,
  p_from uuid,
  p_to uuid,
  p_bucket text,
  p_amount numeric,
  p_note text default null,
  p_settled_on date default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_payable numeric;
begin
  perform check_payment_rights(p_group_id, p_from, p_to);
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a valid amount';
  end if;

  v_payable := payable_amount(p_group_id, p_from, p_to, p_bucket);
  if v_payable <= 0 then
    if exists (select 1 from settlements where group_id = p_group_id and bucket = p_bucket
               and from_user = p_from and to_user = p_to and status = 'pending') then
      raise exception 'A payment for % is already waiting to be confirmed', p_bucket;
    end if;
    raise exception 'Nothing is owed for % between these two', p_bucket;
  end if;
  if p_amount > v_payable then raise exception 'That''s more than the % owed for %', v_payable, p_bucket; end if;

  insert into settlements (group_id, from_user, to_user, bucket, amount, note, settled_on, created_by, status)
  values (p_group_id, p_from, p_to, p_bucket, p_amount, nullif(trim(p_note), ''),
          coalesce(p_settled_on, current_date), auth.uid(), initial_payment_status(p_to))
  returning id into v_id;
  return v_id;
end;
$$;

-- Clear whole buckets between two people in one go: one payment per bucket
-- for exactly what's owed, sharing a batch id so the receiver confirms them
-- together. p_buckets null = every bucket between them.
create function public.clear_buckets(
  p_group_id uuid,
  p_from uuid,
  p_to uuid,
  p_buckets text[] default null,
  p_note text default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
  v_batch uuid := gen_random_uuid();
  v_status text := initial_payment_status(p_to);
begin
  perform check_payment_rights(p_group_id, p_from, p_to);

  insert into settlements (group_id, from_user, to_user, bucket, amount, note, settled_on, created_by, status, batch_id)
  select p_group_id, p_from, p_to, d.bucket, payable_amount(p_group_id, p_from, p_to, d.bucket),
         nullif(trim(p_note), ''), current_date, auth.uid(), v_status, v_batch
  from bucket_debts(p_group_id) d
  where d.debtor = p_from and d.creditor = p_to
    and (p_buckets is null or d.bucket = any (p_buckets))
    and payable_amount(p_group_id, p_from, p_to, d.bucket) > 0;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    if exists (select 1 from settlements where group_id = p_group_id and from_user = p_from
               and to_user = p_to and status = 'pending') then
      raise exception 'Already waiting for confirmation';
    end if;
    raise exception 'Nothing to clear';
  end if;
  return json_build_object('count', v_count, 'status', v_status);
end;
$$;

-- Payments waiting for the current user to accept, one row per batch.
-- total is what the user receives net (a "settle everything" batch has rows
-- both ways); bucket amounts are signed the same way (negative = they paid).
create function public.my_pending_payments()
returns table (
  batch_id uuid,
  group_id uuid,
  group_name text,
  currency text,
  from_user uuid,
  from_name text,
  from_emoji text,
  from_color text,
  total numeric,
  buckets jsonb,
  note text,
  created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with b as (
    select
      s.batch_id,
      s.group_id,
      (array_agg(case when s.from_user = auth.uid() then s.to_user else s.from_user end))[1] as other,
      sum(case when s.to_user = auth.uid() then s.amount else -s.amount end) as total,
      jsonb_agg(
        jsonb_build_object('bucket', s.bucket, 'amount', case when s.to_user = auth.uid() then s.amount else -s.amount end)
        order by s.amount desc
      ) as buckets,
      max(s.note) as note,
      max(s.created_at) as created_at
    from settlements s
    where coalesce(s.confirm_by, s.to_user) = auth.uid() and s.status = 'pending'
      and exists (select 1 from group_members m where m.group_id = s.group_id and m.user_id = auth.uid())
    group by s.batch_id, s.group_id
  )
  select b.batch_id, b.group_id, g.name, g.currency, b.other, p.display_name, p.avatar_emoji, p.avatar_color,
         b.total, b.buckets, b.note, b.created_at
  from b
  join groups g on g.id = b.group_id
  join profiles p on p.id = b.other
  order by b.created_at desc;
$$;

-- The confirmer (the person paid, or the net receiver of a "settle
-- everything" batch) accepts (clears the debts) or declines a batch.
create function public.respond_payment(p_batch_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_row settlements%rowtype;
  v_due numeric;
begin
  if not exists (select 1 from settlements where batch_id = p_batch_id and coalesce(confirm_by, to_user) = auth.uid() and status = 'pending') then
    raise exception 'Only the person being paid can confirm this';
  end if;

  if p_accept then
    for v_row in select * from settlements where batch_id = p_batch_id and status = 'pending' order by bucket for update loop
      -- Expenses may have been edited since it was sent
      select d.amount into v_due from bucket_debts(v_row.group_id) d
      where d.bucket = v_row.bucket and d.debtor = v_row.from_user and d.creditor = v_row.to_user;
      if coalesce(v_due, 0) < v_row.amount then
        raise exception 'The % balance changed since this was sent. Decline it and ask them to send it again.', v_row.bucket;
      end if;
      update settlements set status = 'confirmed', decided_at = now() where id = v_row.id;
    end loop;
  else
    update settlements set status = 'rejected', decided_at = now()
    where batch_id = p_batch_id and status = 'pending';
  end if;
end;
$$;

-- Settle everything between two people: every bucket either of them owes
-- the other is cleared in one batch, and only the difference changes hands.
-- The net receiver confirms (instantly if they're the one recording it, or
-- if it nets to zero).
create function public.settle_pair(p_group_id uuid, p_a uuid, p_b uuid, p_note text default null)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_net numeric;      -- positive: a owes b overall
  v_count int;
  v_receiver uuid;
  v_status text;
  v_batch uuid := gen_random_uuid();
begin
  perform check_payment_rights(p_group_id, p_a, p_b);

  select coalesce(sum(case when x.debtor = p_a then x.payable else -x.payable end), 0), count(*)
  into v_net, v_count
  from (
    select d.debtor, payable_amount(p_group_id, d.debtor, d.creditor, d.bucket) as payable
    from bucket_debts(p_group_id) d
    where (d.debtor = p_a and d.creditor = p_b) or (d.debtor = p_b and d.creditor = p_a)
  ) x
  where x.payable > 0;

  if v_count = 0 then
    if exists (select 1 from settlements where group_id = p_group_id and status = 'pending'
               and ((from_user = p_a and to_user = p_b) or (from_user = p_b and to_user = p_a))) then
      raise exception 'Already waiting for confirmation';
    end if;
    raise exception 'Nothing to settle between these two';
  end if;

  v_receiver := case when v_net >= 0 then p_b else p_a end;
  v_status := case when v_net = 0 or auth.uid() = v_receiver then 'confirmed' else 'pending' end;

  insert into settlements (group_id, from_user, to_user, bucket, amount, note, settled_on, created_by, status, batch_id, confirm_by, decided_at)
  select p_group_id, d.debtor, d.creditor, d.bucket, payable_amount(p_group_id, d.debtor, d.creditor, d.bucket),
         nullif(trim(p_note), ''), current_date, auth.uid(), v_status, v_batch, v_receiver,
         case when v_status = 'confirmed' then now() end
  from bucket_debts(p_group_id) d
  where ((d.debtor = p_a and d.creditor = p_b) or (d.debtor = p_b and d.creditor = p_a))
    and payable_amount(p_group_id, d.debtor, d.creditor, d.bucket) > 0;

  return json_build_object(
    'count', v_count,
    'status', v_status,
    'net', abs(v_net),
    'payer', case when v_net >= 0 then p_a else p_b end,
    'receiver', v_receiver
  );
end;
$$;

-- Pending: the payer can withdraw it. Confirmed: only the receiver or the
-- owner can undo it (the debt comes back). Declined: anyone involved can
-- tidy it away.
create function public.delete_settlement(p_settlement_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_row settlements%rowtype;
begin
  select * into v_row from settlements where id = p_settlement_id;
  if not found or not is_member(v_row.group_id) then raise exception 'Payment not found'; end if;
  if v_row.plan_id is not null then raise exception 'This is part of a smart settle and can''t be removed on its own'; end if;
  if v_row.status = 'pending' then
    if auth.uid() not in (v_row.from_user, v_row.created_by) then
      raise exception 'Only the person who sent it can withdraw it';
    end if;
    -- A batch (clear all / settle everything) is withdrawn as a whole
    delete from settlements where batch_id = v_row.batch_id and status = 'pending';
    return;
  end if;
  if v_row.status = 'confirmed' and auth.uid() <> v_row.to_user and not is_owner(v_row.group_id) then
    raise exception 'Only % or the owner can undo a confirmed payment',
      (select display_name from profiles where id = v_row.to_user);
  end if;
  if v_row.status = 'rejected' and auth.uid() not in (v_row.from_user, v_row.to_user, v_row.created_by) and not is_owner(v_row.group_id) then
    raise exception 'Only the people involved can remove this';
  end if;
  delete from settlements where id = p_settlement_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Nudges
-- ---------------------------------------------------------------------------

-- How long p_debtor has owed p_creditor: the oldest expense the creditor paid
-- for (with the debtor in the split) since the debtor last paid them back.
create function public.debt_since(p_group_id uuid, p_debtor uuid, p_creditor uuid)
returns date
language sql stable security definer set search_path = public
as $$
  with shared as (
    select e.expense_date
    from expenses e
    join expense_splits s on s.expense_id = e.id and s.user_id = p_debtor
    where e.group_id = p_group_id and e.paid_by = p_creditor
  ),
  last_paid as (
    select max(st.settled_on) as d from settlements st
    where st.group_id = p_group_id and st.from_user = p_debtor and st.to_user = p_creditor and st.status = 'confirmed'
  )
  select coalesce(
    (select min(expense_date) from shared where expense_date > coalesce((select d from last_paid), '-infinity'::date)),
    (select max(expense_date) from shared)
  );
$$;

-- For the person owed: each debtor's debt age and when they were last nudged
create function public.nudge_info(p_group_id uuid)
returns table (debtor uuid, debt_since date, last_nudged timestamptz)
language sql stable security definer set search_path = public
as $$
  select d.debtor, debt_since(p_group_id, d.debtor, auth.uid()),
    (select max(n.created_at) from nudges n
     where n.group_id = p_group_id and n.from_user = auth.uid() and n.to_user = d.debtor)
  from (select distinct debtor from bucket_debts(p_group_id) where creditor = auth.uid()) d
  where is_member(p_group_id);
$$;

create function public.send_nudge(p_group_id uuid, p_to uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_after int;
  v_since date;
  v_total numeric;
  v_buckets jsonb;
  v_name text;
begin
  if not is_member(p_group_id) then raise exception 'Group not found'; end if;
  select display_name into v_name from profiles where id = p_to;

  select sum(d.amount), jsonb_agg(jsonb_build_object('bucket', d.bucket, 'amount', d.amount) order by d.amount desc)
  into v_total, v_buckets
  from bucket_debts(p_group_id) d where d.debtor = p_to and d.creditor = auth.uid();
  if v_total is null then raise exception '% doesn''t owe you anything here', v_name; end if;
  if not exists (select 1 from bucket_debts(p_group_id) d
                 where d.debtor = p_to and d.creditor = auth.uid()
                   and payable_amount(p_group_id, p_to, auth.uid(), d.bucket) > 0) then
    raise exception '% already sent you a payment for this. Confirm it from your bell.', v_name;
  end if;

  select nudge_after_days into v_after from groups where id = p_group_id;
  v_since := debt_since(p_group_id, p_to, auth.uid());
  if v_since is not null and current_date - v_since < v_after then
    raise exception 'You can nudge % once the debt is % days old', v_name, v_after;
  end if;

  if exists (select 1 from nudges where group_id = p_group_id and from_user = auth.uid() and to_user = p_to
             and created_at > now() - interval '24 hours') then
    raise exception 'You already nudged % today', v_name;
  end if;

  insert into nudges (group_id, from_user, to_user, amount, buckets)
  values (p_group_id, auth.uid(), p_to, v_total, v_buckets);
end;
$$;

-- Reminders in the user's bell. Ones they've since paid off drop out.
create function public.my_nudges()
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  currency text,
  from_user uuid,
  from_name text,
  from_emoji text,
  from_color text,
  amount numeric,
  buckets jsonb,
  created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select n.id, n.group_id, g.name, g.currency, n.from_user, p.display_name, p.avatar_emoji, p.avatar_color, n.amount, n.buckets, n.created_at
  from nudges n
  join groups g on g.id = n.group_id
  join profiles p on p.id = n.from_user
  where n.to_user = auth.uid() and n.dismissed_at is null
    and exists (select 1 from group_members m where m.group_id = n.group_id and m.user_id = auth.uid())
    and exists (select 1 from bucket_debts(n.group_id) d where d.debtor = auth.uid() and d.creditor = n.from_user)
  order by n.created_at desc;
$$;

create function public.dismiss_nudge(p_nudge_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update nudges set dismissed_at = now() where id = p_nudge_id and to_user = auth.uid();
$$;

create function public.set_nudge_after(p_group_id uuid, p_days int)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_owner(p_group_id) then raise exception 'Only the group owner can change this'; end if;
  update groups set nudge_after_days = least(greatest(coalesce(p_days, 3), 0), 60) where id = p_group_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Smart settle
-- ---------------------------------------------------------------------------

create function public.open_smart_plan(p_group_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from smart_plans where group_id = p_group_id and status in ('approving', 'paying');
$$;

-- Propose a smart settle: snapshot every bucket debt in the group and work
-- out the fewest payments (biggest debtor pays biggest creditor, repeat).
create function public.start_smart_settle(p_group_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_plan uuid;
  v_ids uuid[];
  v_nets numeric[];
  v_c int;
  v_d int;
  v_amt numeric;
begin
  if not is_member(p_group_id) then raise exception 'Group not found'; end if;
  if open_smart_plan(p_group_id) is not null then raise exception 'A smart settle is already in progress'; end if;
  if exists (select 1 from settlements where group_id = p_group_id and status = 'pending') then
    raise exception 'Some payments are still waiting to be confirmed. Confirm or decline them first.';
  end if;
  if not exists (select 1 from bucket_debts(p_group_id)) then raise exception 'Everyone is already settled'; end if;

  insert into smart_plans (group_id, created_by) values (p_group_id, auth.uid()) returning id into v_plan;

  insert into smart_plan_items (plan_id, debtor, creditor, bucket, amount)
  select v_plan, d.debtor, d.creditor, d.bucket, d.amount from bucket_debts(p_group_id) d;

  -- Each person's net across every bucket (positive: gets money back)
  select array_agg(n.uid order by n.uid), array_agg(n.net order by n.uid)
  into v_ids, v_nets
  from (
    select t.uid, sum(t.amt) as net
    from (
      select creditor as uid, amount as amt from smart_plan_items where plan_id = v_plan
      union all
      select debtor, -amount from smart_plan_items where plan_id = v_plan
    ) t
    group by t.uid
  ) n;

  -- Everyone in the snapshot approves, even if they net to zero (their buckets still clear)
  insert into smart_plan_members (plan_id, user_id, approved_at)
  select v_plan, x.uid, case when x.uid = auth.uid() then now() end
  from (select debtor as uid from smart_plan_items where plan_id = v_plan
        union select creditor from smart_plan_items where plan_id = v_plan) x;

  loop
    v_c := null;
    v_d := null;
    for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
      if v_nets[i] >= 0.01 and (v_c is null or v_nets[i] > v_nets[v_c]) then v_c := i; end if;
      if v_nets[i] <= -0.01 and (v_d is null or v_nets[i] < v_nets[v_d]) then v_d := i; end if;
    end loop;
    exit when v_c is null or v_d is null;
    v_amt := least(v_nets[v_c], -v_nets[v_d]);
    insert into smart_transfers (plan_id, from_user, to_user, amount) values (v_plan, v_ids[v_d], v_ids[v_c], v_amt);
    v_nets[v_c] := v_nets[v_c] - v_amt;
    v_nets[v_d] := v_nets[v_d] + v_amt;
  end loop;

  -- Only the proposer involved (can't happen with two people) or all approved already
  if not exists (select 1 from smart_plan_members where plan_id = v_plan and approved_at is null) then
    update smart_plans set status = 'paying' where id = v_plan;
  end if;
  return v_plan;
end;
$$;

-- Everyone in the plan approves; one decline cancels it
create function public.respond_smart_plan(p_plan_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from smart_plan_members m join smart_plans p on p.id = m.plan_id
                 where m.plan_id = p_plan_id and m.user_id = auth.uid() and p.status = 'approving') then
    raise exception 'Nothing to approve here';
  end if;
  if p_approve then
    update smart_plan_members set approved_at = coalesce(approved_at, now()) where plan_id = p_plan_id and user_id = auth.uid();
    if not exists (select 1 from smart_plan_members where plan_id = p_plan_id and approved_at is null) then
      update smart_plans set status = 'paying' where id = p_plan_id;
    end if;
  else
    update smart_plans set status = 'cancelled', finished_at = now() where id = p_plan_id;
  end if;
end;
$$;

-- Payer says they've sent their transfer
create function public.mark_transfer_paid(p_transfer_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update smart_transfers t set paid_at = coalesce(t.paid_at, now())
  from smart_plans p
  where t.id = p_transfer_id and p.id = t.plan_id and p.status = 'paying' and t.from_user = auth.uid();
  if not found then raise exception 'Only the payer can mark this as paid'; end if;
end;
$$;

-- Receiver confirms; the last confirmation clears every snapshotted debt
create function public.confirm_transfer(p_transfer_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_plan smart_plans%rowtype;
begin
  select p.* into v_plan from smart_transfers t join smart_plans p on p.id = t.plan_id
  where t.id = p_transfer_id and t.to_user = auth.uid() and p.status = 'paying' and t.confirmed_at is null
  for update of p;
  if not found then raise exception 'Only the person receiving it can confirm this'; end if;

  update smart_transfers set confirmed_at = now(), paid_at = coalesce(paid_at, now()) where id = p_transfer_id;

  if exists (select 1 from smart_transfers where plan_id = v_plan.id and confirmed_at is null) then
    return 'paying';
  end if;

  insert into settlements (group_id, from_user, to_user, bucket, amount, note, settled_on, created_by, status, batch_id, decided_at, plan_id)
  select v_plan.group_id, i.debtor, i.creditor, i.bucket, i.amount, 'Smart settle', current_date, auth.uid(), 'confirmed', v_plan.id, now(), v_plan.id
  from smart_plan_items i where i.plan_id = v_plan.id;

  update smart_plans set status = 'done', finished_at = now() where id = v_plan.id;
  return 'done';
end;
$$;

-- The proposer or the owner can call it off before any money is confirmed
create function public.cancel_smart_plan(p_plan_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_plan smart_plans%rowtype;
begin
  select * into v_plan from smart_plans where id = p_plan_id and status in ('approving', 'paying');
  if not found or not is_member(v_plan.group_id) then raise exception 'Smart settle not found'; end if;
  if auth.uid() <> v_plan.created_by and not is_owner(v_plan.group_id) then
    raise exception 'Only whoever proposed it or the owner can cancel it';
  end if;
  if exists (select 1 from smart_transfers where plan_id = p_plan_id and confirmed_at is not null) then
    raise exception 'Some payments are already confirmed, so it can only be finished now';
  end if;
  update smart_plans set status = 'cancelled', finished_at = now() where id = p_plan_id;
end;
$$;

-- For the bell: plans waiting on my approval, and transfers waiting on my confirmation
create function public.my_smart_tasks()
returns table (
  kind text,
  plan_id uuid,
  transfer_id uuid,
  group_id uuid,
  group_name text,
  currency text,
  other_user uuid,
  other_name text,
  amount numeric,
  created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select 'approve', p.id, null::uuid, g.id, g.name, g.currency, p.created_by, pr.display_name,
         (select coalesce(sum(case when t.to_user = auth.uid() then t.amount else -t.amount end), 0)
          from smart_transfers t where t.plan_id = p.id and auth.uid() in (t.from_user, t.to_user)),
         p.created_at
  from smart_plans p
  join smart_plan_members m on m.plan_id = p.id and m.user_id = auth.uid() and m.approved_at is null
  join groups g on g.id = p.group_id
  join profiles pr on pr.id = p.created_by
  where p.status = 'approving' and is_member(p.group_id)
  union all
  select 'confirm', p.id, t.id, g.id, g.name, g.currency, t.from_user, pr.display_name, t.amount, coalesce(t.paid_at, p.created_at)
  from smart_transfers t
  join smart_plans p on p.id = t.plan_id
  join groups g on g.id = p.group_id
  join profiles pr on pr.id = t.from_user
  where t.to_user = auth.uid() and t.confirmed_at is null and p.status = 'paying' and is_member(p.group_id)
  order by 10 desc;
$$;

-- Used by the keep-alive GitHub Action so the free project never pauses.
create function public.ping()
returns int
language sql stable
as $$ select 1; $$;

-- ---------------------------------------------------------------------------
-- Function privileges: signed-in users only (ping is public)
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.ping() to anon;
