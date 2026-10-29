-- Adds "settle everything between two people": every bucket between them
-- clears in one batch and only the difference is paid. Only needed if you
-- ran schema.sql BEFORE this change (run 001–003 first if you haven't);
-- a fresh project just runs schema.sql. Safe to run more than once.
-- Supabase → SQL Editor → paste → Run.

alter table public.settlements
  add column if not exists confirm_by uuid references public.profiles (id);

drop function if exists public.my_pending_payments();
drop function if exists public.respond_payment(uuid, boolean);
drop function if exists public.settle_pair(uuid, uuid, uuid, text);
drop function if exists public.delete_settlement(uuid);

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

create function public.delete_settlement(p_settlement_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_row settlements%rowtype;
begin
  select * into v_row from settlements where id = p_settlement_id;
  if not found or not is_member(v_row.group_id) then raise exception 'Payment not found'; end if;
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

revoke execute on function public.my_pending_payments(), public.respond_payment(uuid, boolean),
  public.settle_pair(uuid, uuid, uuid, text), public.delete_settlement(uuid) from public, anon;
grant execute on function public.my_pending_payments(), public.respond_payment(uuid, boolean),
  public.settle_pair(uuid, uuid, uuid, text), public.delete_settlement(uuid) to authenticated;
