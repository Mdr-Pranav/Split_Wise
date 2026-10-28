-- Adds UPI IDs. Only needed if you ran schema.sql BEFORE this change;
-- a fresh project just runs schema.sql (which already includes this).
-- Supabase → SQL Editor → paste → Run.

alter table public.profiles
  add column if not exists upi_id text
  check (upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,63}$');

grant update (display_name, upi_id) on public.profiles to authenticated;

-- group_balances now also returns each person's UPI ID
drop function if exists public.group_balances(uuid);

create function public.group_balances(p_group_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  upi_id text,
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
    exists (select 1 from group_members m where m.group_id = p_group_id and m.user_id = p.uid),
    g.owner_id = p.uid,
    coalesce((select sum(f.amt) from flows f where f.uid = p.uid), 0)
  from people p
  join profiles pr on pr.id = p.uid
  join groups g on g.id = p_group_id
  where is_member(p_group_id)
  order by 5 desc, 2;
$$;

revoke execute on function public.group_balances(uuid) from public, anon;
grant execute on function public.group_balances(uuid) to authenticated;
