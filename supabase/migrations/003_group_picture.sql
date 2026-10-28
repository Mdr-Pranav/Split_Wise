-- Adds group pictures (emoji + background colour). Only needed if you ran
-- schema.sql BEFORE this change (run 001 and 002 first if you haven't);
-- a fresh project just runs schema.sql.
-- Supabase → SQL Editor → paste → Run.

alter table public.groups
  add column if not exists avatar_emoji text
  check (char_length(avatar_emoji) between 1 and 16 and avatar_emoji !~ '[A-Za-z0-9<>&"]');

alter table public.groups
  add column if not exists avatar_color text
  check (avatar_color ~ '^#[0-9a-fA-F]{6}$');

create or replace function public.set_group_avatar(p_group_id uuid, p_emoji text, p_color text)
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

-- my_groups now also returns the group picture
drop function if exists public.my_groups();

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

revoke execute on function public.set_group_avatar(uuid, text, text), public.my_groups() from public, anon;
grant execute on function public.set_group_avatar(uuid, text, text), public.my_groups() to authenticated;
