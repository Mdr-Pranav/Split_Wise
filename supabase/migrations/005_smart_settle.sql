-- Adds Smart settle: the fewest payments that clear every debt in a group,
-- approved by everyone involved. Only needed if you ran schema.sql BEFORE
-- this change (run 001–004 first if you haven't); a fresh project just runs
-- schema.sql. Safe to run more than once.
-- Supabase → SQL Editor → paste → Run.

alter table public.settlements add column if not exists plan_id uuid;

-- Smart settle: the fewest payments that clear every debt in a group.
-- A plan snapshots the group's bucket debts, works out the transfers, needs
-- everyone involved to approve, then each transfer is paid and confirmed.
-- When the last one is confirmed, every snapshotted bucket debt clears.
create table if not exists public.smart_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'approving' check (status in ('approving', 'paying', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
-- At most one open plan per group
create unique index if not exists smart_plans_one_open on public.smart_plans (group_id) where status in ('approving', 'paying');

-- The debts the plan clears, as they stood when it was proposed
create table if not exists public.smart_plan_items (
  plan_id uuid not null references public.smart_plans (id) on delete cascade,
  debtor uuid not null references public.profiles (id) on delete cascade,
  creditor uuid not null references public.profiles (id) on delete cascade,
  bucket text not null,
  amount numeric(12, 2) not null check (amount > 0)
);
create index if not exists smart_plan_items_plan_idx on public.smart_plan_items (plan_id);

-- Everyone whose balance the plan changes; all of them must approve
create table if not exists public.smart_plan_members (
  plan_id uuid not null references public.smart_plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  approved_at timestamptz,
  primary key (plan_id, user_id)
);

-- The actual payments: one per pair, as few as possible
create table if not exists public.smart_transfers (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.smart_plans (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  paid_at timestamptz,
  confirmed_at timestamptz
);
create index if not exists smart_transfers_plan_idx on public.smart_transfers (plan_id);


alter table public.smart_plans enable row level security;
alter table public.smart_plan_items enable row level security;
alter table public.smart_plan_members enable row level security;
alter table public.smart_transfers enable row level security;

drop policy if exists "members see smart plans" on public.smart_plans;
create policy "members see smart plans" on public.smart_plans
  for select to authenticated using (public.is_member(group_id));
drop policy if exists "members see smart plan items" on public.smart_plan_items;
create policy "members see smart plan items" on public.smart_plan_items
  for select to authenticated using (exists (select 1 from public.smart_plans p where p.id = plan_id and public.is_member(p.group_id)));
drop policy if exists "members see smart plan members" on public.smart_plan_members;
create policy "members see smart plan members" on public.smart_plan_members
  for select to authenticated using (exists (select 1 from public.smart_plans p where p.id = plan_id and public.is_member(p.group_id)));
drop policy if exists "members see smart transfers" on public.smart_transfers;
create policy "members see smart transfers" on public.smart_transfers
  for select to authenticated using (exists (select 1 from public.smart_plans p where p.id = plan_id and public.is_member(p.group_id)));

grant select on public.smart_plans, public.smart_plan_items, public.smart_plan_members, public.smart_transfers to authenticated;

create or replace function public.open_smart_plan(p_group_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from smart_plans where group_id = p_group_id and status in ('approving', 'paying');
$$;

create or replace function public.start_smart_settle(p_group_id uuid)
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

create or replace function public.respond_smart_plan(p_plan_id uuid, p_approve boolean)
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

create or replace function public.mark_transfer_paid(p_transfer_id uuid)
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

create or replace function public.confirm_transfer(p_transfer_id uuid)
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

create or replace function public.cancel_smart_plan(p_plan_id uuid)
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

create or replace function public.my_smart_tasks()
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

create or replace function public.check_payment_rights(p_group_id uuid, p_from uuid, p_to uuid)
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

create or replace function public.remove_member(p_group_id uuid, p_user_id uuid)
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

create or replace function public.delete_settlement(p_settlement_id uuid)
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

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.ping() to anon;
