-- Adds: expense history (who added, edited or deleted what) and edit rights,
-- per-person group order / pins / archive, push notifications, live updates,
-- expenses saved offline, and deleting your account.
-- Only needed if you ran schema.sql BEFORE this change (run 001–005 first if
-- you haven't); a fresh project just runs schema.sql. Safe to run more than once.
-- Supabase → SQL Editor → paste → Run.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Who last changed an expense, and the id an offline save was queued with
-- (so sending it twice can't add it twice)
alter table public.expenses
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid references public.profiles (id),
  add column if not exists client_id uuid unique;

-- Every add, edit and delete, with the expense as it was before and after
create table if not exists public.expense_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- No foreign key: a deleted expense keeps its history
  expense_id uuid not null,
  action text not null check (action in ('created', 'edited', 'deleted')),
  actor uuid not null references public.profiles (id),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists expense_events_group_idx on public.expense_events (group_id, created_at desc);
create index if not exists expense_events_expense_idx on public.expense_events (expense_id);

-- Each person's own arrangement of their groups. Nobody else sees it.
create table if not exists public.group_prefs (
  group_id uuid not null,
  user_id uuid not null,
  pinned boolean not null default false,
  sort_order int,
  archived_at timestamptz,
  primary key (group_id, user_id),
  foreign key (group_id, user_id) references public.group_members (group_id, user_id) on delete cascade
);

-- Browsers that asked for push notifications
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Server-only settings (the push function's URL and secret). Not exposed
-- through the API: only the database functions below read it.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.settings (key text primary key, value text not null);

alter table public.expense_events enable row level security;
alter table public.group_prefs enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "members see expense history" on public.expense_events;
create policy "members see expense history" on public.expense_events
  for select to authenticated using (public.is_member(group_id));
drop policy if exists "see own group prefs" on public.group_prefs;
create policy "see own group prefs" on public.group_prefs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "see own push subscriptions" on public.push_subscriptions;
create policy "see own push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.expense_events, public.group_prefs, public.push_subscriptions to authenticated;

-- Deleting an account keeps its profile as "Deleted user" so old expenses
-- still add up, so the profile can't be tied to the login any more
do $$
declare
  v_fk text;
begin
  select conname into v_fk from pg_constraint
  where conrelid = 'public.profiles'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass;
  if v_fk is not null then
    execute format('alter table public.profiles drop constraint %I', v_fk);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Push notifications
-- ---------------------------------------------------------------------------

-- "₹1,200" / "$40.50"
create or replace function public.fmt_money(p_amount numeric, p_currency text)
returns text
language sql immutable
as $$
  select case p_currency when 'INR' then '₹' when 'USD' then '$' when 'EUR' then '€' when 'GBP' then '£' when 'JPY' then '¥'
                         else p_currency || ' ' end
      || case when abs(p_amount) = trunc(abs(p_amount)) then to_char(abs(p_amount), 'FM999,999,999,990')
              else to_char(abs(p_amount), 'FM999,999,999,990.00') end;
$$;

-- Hands a notification to the push function (supabase/functions/push).
-- Does nothing until private.settings has push_url and push_secret, and
-- never lets a failed push undo the change that triggered it.
create or replace function public.push_to(p_users uuid[], p_title text, p_body text, p_url text, p_tag text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_url text;
  v_secret text;
  v_users uuid[];
begin
  select value into v_url from private.settings where key = 'push_url';
  select value into v_secret from private.settings where key = 'push_secret';
  if v_url is null or v_secret is null then return; end if;

  select array_agg(distinct u) into v_users
  from unnest(p_users) u
  where u is not null and exists (select 1 from push_subscriptions s where s.user_id = u);
  if v_users is null then return; end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('users', to_jsonb(v_users), 'title', p_title, 'body', p_body, 'url', p_url, 'tag', p_tag),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret)
  );
exception when others then
  raise warning 'push not sent: %', sqlerrm;
end;
$$;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'You need to sign in first'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'That browser subscription isn''t valid';
  end if;
  -- One browser, one person: signing in as someone else moves it to them
  insert into push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql security definer set search_path = public
as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- False when the server side hasn't been set up yet
create or replace function public.send_test_push()
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from private.settings where key = 'push_url') then return false; end if;
  perform push_to(array[auth.uid()], 'Notifications are on', 'This is how you''ll hear about payments and reminders.', '/settings', 'test');
  return true;
end;
$$;

-- An expense was added, edited or deleted: tell everyone in it except
-- whoever did it. p_also: splits from before an edit, so people taken out
-- of it hear about it too.
create or replace function public.push_expense(p_group_id uuid, p_expense_id uuid, p_action text, p_snap jsonb, p_also jsonb default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_group groups%rowtype;
  v_actor text;
  v_title text;
  r record;
begin
  if not exists (select 1 from private.settings where key = 'push_url') then return; end if;
  select * into v_group from groups where id = p_group_id;
  select display_name into v_actor from profiles where id = auth.uid();
  v_title := v_actor || ' ' || p_action || ' ' || (p_snap ->> 'bucket') || ' · '
          || fmt_money((p_snap ->> 'amount')::numeric, v_group.currency);

  for r in
    select u.uid,
           coalesce((select (x ->> 'amount')::numeric from jsonb_array_elements(p_snap -> 'splits') x
                     where (x ->> 'user_id')::uuid = u.uid), 0) as share
    from (
      select (x ->> 'user_id')::uuid as uid
      from jsonb_array_elements((p_snap -> 'splits') || coalesce(p_also, '[]'::jsonb)) x
      union
      select (p_snap ->> 'paid_by')::uuid
    ) u
    where u.uid is distinct from auth.uid()
  loop
    perform push_to(
      array[r.uid],
      v_title,
      case
        when p_action = 'deleted' then 'In ' || v_group.name || '. It no longer counts.'
        when r.share > 0 then v_group.name || ': your share is ' || fmt_money(r.share, v_group.currency)
        else 'In ' || v_group.name
      end,
      '/groups/' || p_group_id || '?tab=activity',
      'expense-' || p_expense_id
    );
  end loop;
end;
$$;

-- A payment waiting for someone to confirm it: one notification per batch
create or replace function public.push_on_settlement_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select n.batch_id, coalesce(n.confirm_by, n.to_user) as who, n.group_id, g.name as group_name, g.currency,
           p.display_name as by_name,
           sum(case when n.to_user = coalesce(n.confirm_by, n.to_user) then n.amount else -n.amount end) as total,
           count(*) as buckets, min(n.bucket) as bucket
    from new_rows n
    join groups g on g.id = n.group_id
    join profiles p on p.id = n.created_by
    where n.status = 'pending' and n.plan_id is null
    group by 1, 2, 3, 4, 5, 6
  loop
    if r.who is distinct from auth.uid() then
      perform push_to(
        array[r.who],
        'Payment to confirm',
        r.by_name || ' recorded ' || fmt_money(r.total, r.currency)
          || case when r.buckets = 1 then ' for ' || r.bucket else ' across ' || r.buckets || ' buckets' end
          || ' in ' || r.group_name || '. Confirm once it reaches you.',
        '/groups/' || r.group_id || '?tab=activity',
        'pay-' || r.batch_id
      );
    end if;
  end loop;
  return null;
end;
$$;

-- A payment was confirmed or declined: tell whoever sent it
create or replace function public.push_on_settlement_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select n.batch_id, n.created_by, n.status, n.group_id, g.name as group_name, g.currency,
           p.display_name as by_name, sum(n.amount) as total
    from new_rows n
    join old_rows o on o.id = n.id
    join groups g on g.id = n.group_id
    join profiles p on p.id = coalesce(n.confirm_by, n.to_user)
    where o.status = 'pending' and n.status in ('confirmed', 'rejected')
    group by 1, 2, 3, 4, 5, 6, 7
  loop
    if r.created_by is distinct from auth.uid() then
      perform push_to(
        array[r.created_by],
        r.by_name || case when r.status = 'confirmed' then ' confirmed your payment' else ' declined your payment' end,
        fmt_money(r.total, r.currency) || ' in ' || r.group_name
          || case when r.status = 'confirmed' then '. That debt is cleared.' else '. It didn''t count; check with them.' end,
        '/groups/' || r.group_id || '?tab=activity',
        'pay-' || r.batch_id
      );
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.push_on_nudge()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform push_to(
    array[new.to_user],
    (select display_name from profiles where id = new.from_user) || ' sent you a reminder',
    'You owe ' || fmt_money(new.amount, g.currency) || ' in ' || g.name || '. Tap to settle up.',
    '/groups/' || new.group_id || '?settle=' || new.from_user,
    'nudge-' || new.group_id
  )
  from groups g where g.id = new.group_id;
  return null;
end;
$$;

create or replace function public.push_on_join_request()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform push_to(
    array[g.owner_id],
    (select display_name from profiles where id = new.user_id) || ' wants to join ' || g.name,
    'Approve or decline in the group''s settings.',
    '/groups/' || new.group_id || '?tab=settings',
    'join-' || new.id
  )
  from groups g where g.id = new.group_id;
  return null;
end;
$$;

-- Someone proposed a smart settle: everyone who has to approve hears
create or replace function public.push_on_smart_members()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select p.id, p.group_id, g.name as group_name, pr.display_name as by_name, array_agg(n.user_id) as users,
           (select count(*) from smart_transfers t where t.plan_id = p.id) as transfers
    from new_rows n
    join smart_plans p on p.id = n.plan_id
    join groups g on g.id = p.group_id
    join profiles pr on pr.id = p.created_by
    where n.approved_at is null
    group by 1, 2, 3, 4
  loop
    perform push_to(
      r.users,
      'Smart settle in ' || r.group_name,
      r.by_name || ' proposed clearing everyone''s balances. Tap to approve or decline.',
      '/groups/' || r.group_id,
      'smart-' || r.id
    );
  end loop;
  return null;
end;
$$;

-- A smart settle transfer was marked paid: the receiver confirms it
create or replace function public.push_on_smart_transfer()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select n.id, n.to_user, n.amount, p.group_id, g.name as group_name, g.currency, pr.display_name as from_name
    from new_rows n
    join old_rows o on o.id = n.id
    join smart_plans p on p.id = n.plan_id
    join groups g on g.id = p.group_id
    join profiles pr on pr.id = n.from_user
    where o.paid_at is null and n.paid_at is not null and n.confirmed_at is null
  loop
    perform push_to(
      array[r.to_user],
      r.from_name || ' says they paid you ' || fmt_money(r.amount, r.currency),
      'Smart settle in ' || r.group_name || '. Confirm once it reaches you.',
      '/groups/' || r.group_id,
      'smart-pay-' || r.id
    );
  end loop;
  return null;
end;
$$;

-- Everyone approved (time to pay), or the last payment landed (all clear)
create or replace function public.push_on_smart_plan()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_group groups%rowtype;
  r record;
begin
  if new.status = old.status then return null; end if;
  select * into v_group from groups where id = new.group_id;
  if new.status = 'paying' then
    for r in
      select t.from_user, t.amount, pr.display_name as to_name
      from smart_transfers t join profiles pr on pr.id = t.to_user
      where t.plan_id = new.id
    loop
      perform push_to(
        array[r.from_user],
        'Smart settle approved in ' || v_group.name,
        'Pay ' || r.to_name || ' ' || fmt_money(r.amount, v_group.currency) || ', then mark it paid.',
        '/groups/' || new.group_id,
        'smart-' || new.id
      );
    end loop;
  elsif new.status = 'done' then
    perform push_to(
      array_remove(array(select user_id from smart_plan_members where plan_id = new.id), auth.uid()),
      v_group.name || ' is all settled',
      'The smart settle finished. Every balance is cleared.',
      '/groups/' || new.group_id,
      'smart-' || new.id
    );
  end if;
  return null;
end;
$$;

drop trigger if exists push_settlement_insert on public.settlements;
create trigger push_settlement_insert after insert on public.settlements
  referencing new table as new_rows for each statement execute function public.push_on_settlement_insert();
drop trigger if exists push_settlement_update on public.settlements;
create trigger push_settlement_update after update on public.settlements
  referencing old table as old_rows new table as new_rows for each statement execute function public.push_on_settlement_update();
drop trigger if exists push_nudge on public.nudges;
create trigger push_nudge after insert on public.nudges
  for each row execute function public.push_on_nudge();
drop trigger if exists push_join_request on public.join_requests;
create trigger push_join_request after insert on public.join_requests
  for each row execute function public.push_on_join_request();
drop trigger if exists push_smart_members on public.smart_plan_members;
create trigger push_smart_members after insert on public.smart_plan_members
  referencing new table as new_rows for each statement execute function public.push_on_smart_members();
drop trigger if exists push_smart_transfer on public.smart_transfers;
create trigger push_smart_transfer after update on public.smart_transfers
  referencing old table as old_rows new table as new_rows for each statement execute function public.push_on_smart_transfer();
drop trigger if exists push_smart_plan on public.smart_plans;
create trigger push_smart_plan after update on public.smart_plans
  for each row execute function public.push_on_smart_plan();

-- ---------------------------------------------------------------------------
-- Expenses: history and who can change them
-- ---------------------------------------------------------------------------

-- An expense and its splits as JSON, for the history
create or replace function public.expense_snapshot(p_expense_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'bucket', e.bucket,
    'note', e.note,
    'amount', e.amount,
    'paid_by', e.paid_by,
    'split_type', e.split_type,
    'expense_date', e.expense_date,
    'splits', coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'amount', s.amount) order by s.user_id)
                        from expense_splits s where s.expense_id = e.id), '[]'::jsonb)
  )
  from expenses e where e.id = p_expense_id;
$$;

drop function if exists public.save_expense(uuid, uuid, text, text, numeric, uuid, text, date, jsonb);
drop function if exists public.save_expense(uuid, uuid, text, text, numeric, uuid, text, date, jsonb, uuid);

-- Insert (p_expense_id null) or update an expense with its splits in one go.
-- p_splits: [{"user_id": "...", "amount": 123.45}, ...] summing to p_amount.
-- p_client_id: set by an offline save, so a retry returns the same expense.
-- Anyone in the group can add; only whoever added it, whoever paid, or the
-- owner can edit. Every change lands in expense_events.
create function public.save_expense(
  p_expense_id uuid,
  p_group_id uuid,
  p_bucket text,
  p_note text,
  p_amount numeric,
  p_paid_by uuid,
  p_split_type text,
  p_expense_date date,
  p_splits jsonb,
  p_client_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid := p_expense_id;
  v_existing expenses%rowtype;
  v_bucket text;
  v_sum numeric := 0;
  v_split jsonb;
  v_user uuid;
  v_amt numeric;
  v_count int := 0;
  v_before jsonb;
  v_after jsonb;
begin
  if not is_member(p_group_id) then raise exception 'Group not found'; end if;

  -- Already saved by an earlier try of the same offline save
  if v_id is null and p_client_id is not null then
    select id into v_id from expenses where client_id = p_client_id and group_id = p_group_id;
    if v_id is not null then return v_id; end if;
  end if;

  if v_id is not null then
    select * into v_existing from expenses where id = v_id and group_id = p_group_id;
    if not found then raise exception 'Expense not found'; end if;
    if auth.uid() not in (v_existing.created_by, v_existing.paid_by) and not is_owner(p_group_id) then
      raise exception 'Only whoever added it, whoever paid, or the owner can change this expense';
    end if;
    v_before := expense_snapshot(v_id);
  end if;

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
    insert into expenses (group_id, bucket, note, amount, paid_by, split_type, expense_date, created_by, client_id)
    values (p_group_id, v_bucket, nullif(trim(p_note), ''), p_amount, p_paid_by, p_split_type,
            coalesce(p_expense_date, current_date), auth.uid(), p_client_id)
    returning id into v_id;
  else
    update expenses
    set bucket = v_bucket, note = nullif(trim(p_note), ''), amount = p_amount, paid_by = p_paid_by,
        split_type = p_split_type, expense_date = coalesce(p_expense_date, expense_date)
    where id = v_id;
    delete from expense_splits where expense_id = v_id;
  end if;

  insert into expense_splits (expense_id, user_id, amount)
  select v_id, (x ->> 'user_id')::uuid, (x ->> 'amount')::numeric
  from jsonb_array_elements(p_splits) x
  where (x ->> 'amount')::numeric > 0;

  v_after := expense_snapshot(v_id);
  if v_before is null then
    insert into expense_events (group_id, expense_id, action, actor, after)
    values (p_group_id, v_id, 'created', auth.uid(), v_after);
    -- A new expense brings an archived group back for everyone in it
    update group_prefs set archived_at = null
    where group_id = p_group_id and archived_at is not null
      and (user_id = p_paid_by or user_id in (select (x ->> 'user_id')::uuid from jsonb_array_elements(v_after -> 'splits') x));
    perform push_expense(p_group_id, v_id, 'added', v_after);
  elsif v_before is distinct from v_after then
    update expenses set updated_at = now(), updated_by = auth.uid() where id = v_id;
    insert into expense_events (group_id, expense_id, action, actor, before, after)
    values (p_group_id, v_id, 'edited', auth.uid(), v_before, v_after);
    perform push_expense(p_group_id, v_id, 'edited', v_after, v_before -> 'splits');
  end if;

  return v_id;
end;
$$;

create or replace function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_row expenses%rowtype;
  v_snap jsonb;
begin
  select * into v_row from expenses where id = p_expense_id;
  if not found or not is_member(v_row.group_id) then raise exception 'Expense not found'; end if;
  if auth.uid() not in (v_row.created_by, v_row.paid_by) and not is_owner(v_row.group_id) then
    raise exception 'Only whoever added it, whoever paid, or the owner can delete this expense';
  end if;
  v_snap := expense_snapshot(p_expense_id);
  insert into expense_events (group_id, expense_id, action, actor, before)
  values (v_row.group_id, p_expense_id, 'deleted', auth.uid(), v_snap);
  delete from expenses where id = p_expense_id;
  perform push_expense(v_row.group_id, p_expense_id, 'deleted', v_snap);
end;
$$;

-- ---------------------------------------------------------------------------
-- Your groups: pins, order and archive
-- ---------------------------------------------------------------------------

drop function if exists public.my_groups();

-- The current user's groups with what they owe and are owed in each, in
-- their own order: pinned first, then their arrangement (new groups on
-- top), then most recent activity; archived ones last.
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
  avatar_color text,
  pinned boolean,
  archived boolean,
  sort_order int
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
    g.avatar_color,
    coalesce(gp.pinned, false),
    gp.archived_at is not null,
    gp.sort_order
  from groups g
  join group_members me on me.group_id = g.id and me.user_id = auth.uid()
  join profiles o on o.id = g.owner_id
  left join group_prefs gp on gp.group_id = g.id and gp.user_id = auth.uid()
  order by gp.archived_at is not null, coalesce(gp.pinned, false) desc, gp.sort_order nulls first, 10 desc;
$$;

-- Pinning brings a group back from the archive
create or replace function public.set_group_pinned(p_group_id uuid, p_pinned boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_member(p_group_id) then raise exception 'Group not found'; end if;
  insert into group_prefs (group_id, user_id, pinned)
  values (p_group_id, auth.uid(), coalesce(p_pinned, false))
  on conflict (group_id, user_id) do update
    set pinned = excluded.pinned,
        archived_at = case when excluded.pinned then null else group_prefs.archived_at end;
end;
$$;

-- Archiving only tidies the user's own list; the group carries on for
-- everyone else, and balances still count
create or replace function public.set_group_archived(p_group_id uuid, p_archived boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_member(p_group_id) then raise exception 'Group not found'; end if;
  insert into group_prefs (group_id, user_id, archived_at)
  values (p_group_id, auth.uid(), case when p_archived then now() end)
  on conflict (group_id, user_id) do update
    set archived_at = case when p_archived then coalesce(group_prefs.archived_at, now()) end,
        pinned = case when p_archived then false else group_prefs.pinned end;
end;
$$;

-- p_group_ids: the user's groups top to bottom
create or replace function public.reorder_groups(p_group_ids uuid[])
returns void
language sql security definer set search_path = public
as $$
  insert into group_prefs (group_id, user_id, sort_order)
  select x.id, auth.uid(), x.ord::int
  from unnest(p_group_ids) with ordinality as x(id, ord)
  where is_member(x.id)
  on conflict (group_id, user_id) do update set sort_order = excluded.sort_order;
$$;

-- ---------------------------------------------------------------------------
-- Deleting your account
-- ---------------------------------------------------------------------------

-- Only once the user is settled everywhere and owns no group with other
-- people in it. Groups they own alone are deleted. Their name on old
-- expenses becomes "Deleted user" so everyone else's history still adds up.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then raise exception 'You need to sign in first'; end if;

  select g.name into v_name from groups g
  where g.owner_id = v_uid and exists (select 1 from group_members m where m.group_id = g.id and m.user_id <> v_uid)
  limit 1;
  if v_name is not null then
    raise exception 'You own %. Hand it to someone else in its settings, or delete it, first.', v_name;
  end if;

  select g.name into v_name from groups g
  join group_members m on m.group_id = g.id and m.user_id = v_uid
  where exists (select 1 from bucket_debts(g.id) d where v_uid in (d.debtor, d.creditor))
     or exists (select 1 from settlements s where s.group_id = g.id and s.status = 'pending' and v_uid in (s.from_user, s.to_user))
     or exists (select 1 from smart_plans p join smart_plan_members pm on pm.plan_id = p.id
                where p.group_id = g.id and p.status in ('approving', 'paying') and pm.user_id = v_uid)
  limit 1;
  if v_name is not null then raise exception 'Settle up in % first', v_name; end if;

  delete from groups where owner_id = v_uid;
  delete from group_members where user_id = v_uid;
  delete from join_requests where user_id = v_uid;
  delete from nudges where v_uid in (from_user, to_user);
  delete from push_subscriptions where user_id = v_uid;
  update profiles
  set display_name = 'Deleted user', email = '', upi_id = null, avatar_emoji = null, avatar_color = null
  where id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Live updates: open screens refresh when someone else changes something
-- (Supabase Realtime still applies the read rules above)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['groups', 'group_members', 'expenses', 'expense_events', 'settlements', 'nudges',
                           'join_requests', 'smart_plans', 'smart_plan_members', 'smart_transfers'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.save_expense(uuid, uuid, text, text, numeric, uuid, text, date, jsonb, uuid),
  public.delete_expense(uuid),
  public.my_groups(),
  public.set_group_pinned(uuid, boolean),
  public.set_group_archived(uuid, boolean),
  public.reorder_groups(uuid[]),
  public.delete_my_account(),
  public.save_push_subscription(text, text, text),
  public.delete_push_subscription(text),
  public.send_test_push()
from public, anon;
grant execute on function
  public.save_expense(uuid, uuid, text, text, numeric, uuid, text, date, jsonb, uuid),
  public.delete_expense(uuid),
  public.my_groups(),
  public.set_group_pinned(uuid, boolean),
  public.set_group_archived(uuid, boolean),
  public.reorder_groups(uuid[]),
  public.delete_my_account(),
  public.save_push_subscription(text, text, text),
  public.delete_push_subscription(text),
  public.send_test_push()
to authenticated;

-- Internal only: sending pushes and reading any expense by id
revoke execute on function
  public.push_to(uuid[], text, text, text, text),
  public.push_expense(uuid, uuid, text, jsonb, jsonb),
  public.expense_snapshot(uuid)
from public, anon, authenticated;
