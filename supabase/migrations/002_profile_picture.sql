-- Adds profile pictures: an emoji and a background colour. Only needed if
-- you ran schema.sql BEFORE this change (run 001_upi_ids.sql first if you
-- haven't); a fresh project just runs schema.sql.
-- Supabase → SQL Editor → paste → Run.

alter table public.profiles
  add column if not exists avatar_emoji text
  check (char_length(avatar_emoji) between 1 and 16 and avatar_emoji !~ '[A-Za-z0-9<>&"]');

alter table public.profiles
  add column if not exists avatar_color text
  check (avatar_color ~ '^#[0-9a-fA-F]{6}$');

grant update (display_name, upi_id, avatar_emoji, avatar_color) on public.profiles to authenticated;

-- These now also return each person's emoji and colour
drop function if exists public.group_balances(uuid);
drop function if exists public.my_pending_payments();
drop function if exists public.my_nudges();

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
  select
    s.batch_id,
    s.group_id,
    g.name,
    g.currency,
    s.from_user,
    p.display_name,
    p.avatar_emoji,
    p.avatar_color,
    sum(s.amount),
    jsonb_agg(jsonb_build_object('bucket', s.bucket, 'amount', s.amount) order by s.amount desc),
    max(s.note),
    max(s.created_at)
  from settlements s
  join groups g on g.id = s.group_id
  join profiles p on p.id = s.from_user
  where s.to_user = auth.uid() and s.status = 'pending'
    and exists (select 1 from group_members m where m.group_id = s.group_id and m.user_id = auth.uid())
  group by s.batch_id, s.group_id, g.name, g.currency, s.from_user, p.display_name, p.avatar_emoji, p.avatar_color
  order by max(s.created_at) desc;
$$;

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

revoke execute on function public.group_balances(uuid), public.my_pending_payments(), public.my_nudges() from public, anon;
grant execute on function public.group_balances(uuid), public.my_pending_payments(), public.my_nudges() to authenticated;
