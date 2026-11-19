-- Nguồn dữ liệu tư vấn. Chỉ Worker có quyền truy cập trực tiếp.
begin;

create table public.ktn_advisors (
  email text primary key check (email = lower(email)),
  name text not null,
  active boolean not null default true
);

create table public.ktn_consultations (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('web', 'messenger')),
  external_id text,
  owner_email text references public.ktn_advisors(email),
  status text not null default 'waiting' check (status in ('bot', 'waiting', 'open', 'closed')),
  outcome text check (outcome in ('registered', 'declined', 'no_response', 'other')),
  follow_up_at timestamptz,
  queued_at timestamptz,
  first_reply_at timestamptz,
  last_customer_at timestamptz,
  last_reply_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, external_id)
);
create index ktn_consultations_inbox_idx on public.ktn_consultations (owner_email, updated_at desc);
create index ktn_consultations_review_idx on public.ktn_consultations (next_review_at) where next_review_at is not null;

create table public.ktn_consultation_advisor_counters (
  email text primary key references public.ktn_advisors(email),
  last_assigned_at timestamptz not null default '-infinity'
);

create table public.ktn_consultation_messages (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.ktn_consultations(id) on delete cascade,
  sender text not null check (sender in ('customer', 'bot', 'advisor', 'manager', 'external', 'system')),
  actor_email text,
  body text not null check (char_length(body) between 1 and 4000),
  external_id text unique,
  delivery text not null default 'sent' check (delivery in ('queued', 'sending', 'sent', 'failed')),
  delivery_note text,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index ktn_consultation_messages_thread_idx on public.ktn_consultation_messages (consultation_id, created_at desc, id);
create index ktn_consultation_messages_delivery_idx on public.ktn_consultation_messages (delivery, created_at);

create table public.ktn_consultation_events (
  id bigint generated always as identity primary key,
  consultation_id uuid not null references public.ktn_consultations(id) on delete cascade,
  actor_email text,
  kind text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index ktn_consultation_events_thread_idx on public.ktn_consultation_events (consultation_id, created_at desc);

create table public.ktn_consultation_flags (
  message_id uuid primary key references public.ktn_consultation_messages(id) on delete cascade,
  consultation_id uuid not null references public.ktn_consultations(id) on delete cascade,
  category text not null check (category in ('price', 'promotion', 'fit')),
  reason text not null,
  excerpt text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed')),
  reviewed_by text,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index ktn_consultation_flags_thread_idx on public.ktn_consultation_flags (consultation_id);

create table public.ktn_consultation_guidance (
  id text primary key check (id = 'default'),
  course_ids text[] not null default '{}' check (cardinality(course_ids) <= 10),
  duration_presets jsonb not null default '{}',
  policy text not null default '',
  examples jsonb not null default '[]' check (jsonb_typeof(examples) = 'array' and jsonb_array_length(examples) <= 30),
  bot_enabled boolean not null default false,
  checkout_enabled boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.ktn_consultation_guidance (id) values ('default');

create table public.ktn_consultation_orders (
  order_id text primary key references public.ktn_orders(order_id) on delete cascade,
  consultation_id uuid not null references public.ktn_consultations(id) on delete cascade,
  request_id uuid not null,
  owner_email text,
  payment_info jsonb not null,
  created_at timestamptz not null default now(),
  unique (consultation_id, request_id)
);
create index ktn_consultation_orders_thread_idx on public.ktn_consultation_orders (consultation_id);

create function public.ktn_consultation_protect_order() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  -- Không để luồng tạo đơn cũ dùng lại mã đã cấp cho một khách tư vấn.
  if old.note like '%"source":"consultation"%' and
    (new.note is null or new.note not like '%"source":"consultation"%') and
    exists (select 1 from public.ktn_consultation_orders where order_id=old.order_id) then
    raise exception 'Consultation order cannot be replaced';
  end if;
  return new;
end $$;
create trigger ktn_consultation_protect_order before update on public.ktn_orders
for each row execute function public.ktn_consultation_protect_order();
revoke all on function public.ktn_consultation_protect_order() from public,anon,authenticated;

create table public.ktn_consultation_payments (
  transaction_id text primary key,
  order_id text not null references public.ktn_orders(order_id),
  amount bigint not null,
  status text not null check (status in ('mismatch', 'duplicate', 'accepted', 'done', 'needs_review')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  error text,
  created_at timestamptz not null default now()
);
create index ktn_consultation_payments_order_idx on public.ktn_consultation_payments (order_id, created_at desc);
create index ktn_consultation_payments_pending_idx on public.ktn_consultation_payments (next_attempt_at) where status = 'accepted';

create view public.ktn_consultation_inbox with (security_invoker=true) as
select c.*,
  coalesce(c.last_customer_at>coalesce(c.last_reply_at,'-infinity'),false) as reply_pending,
  exists (select 1 from public.ktn_consultation_orders l join public.ktn_orders o using (order_id)
    where l.consultation_id=c.id and o.payment_status='paid' and o.approval_status<>'approved') as has_paid_pending
from public.ktn_consultations c
where c.last_customer_at is not null or c.last_reply_at is not null
  or exists(select 1 from public.ktn_consultation_orders l where l.consultation_id=c.id);

create view public.ktn_consultation_paid_report with (security_invoker=true) as
select o.order_id,l.consultation_id,l.owner_email,c.channel,o.course_name,o.amount,o.approval_status,p.created_at as paid_at
from public.ktn_consultation_orders l join public.ktn_orders o using(order_id)
join public.ktn_consultations c on c.id=l.consultation_id
join lateral (select created_at from public.ktn_consultation_payments p where p.order_id=o.order_id and p.amount=o.amount
  and p.status in ('accepted','done','needs_review') order by created_at,transaction_id limit 1) p on true
where o.payment_status='paid';

create view public.ktn_consultation_assignment_report with (security_invoker=true) as
select distinct on (e.consultation_id,e.detail->>'to') e.consultation_id,e.detail->>'to' as owner_email,
  c.channel,e.created_at as assigned_at
from public.ktn_consultation_events e join public.ktn_consultations c on c.id=e.consultation_id
where e.kind='assigned' and e.detail->>'to' is not null
order by e.consultation_id,e.detail->>'to',e.created_at,e.id;

revoke all on public.ktn_consultation_inbox,public.ktn_consultation_paid_report,public.ktn_consultation_assignment_report from public,anon,authenticated;
grant select on public.ktn_consultation_inbox,public.ktn_consultation_paid_report,public.ktn_consultation_assignment_report to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array['ktn_advisors', 'ktn_consultations', 'ktn_consultation_messages',
    'ktn_consultation_events', 'ktn_consultation_flags', 'ktn_consultation_guidance',
    'ktn_consultation_orders', 'ktn_consultation_payments', 'ktn_consultation_advisor_counters'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
  end loop;
  grant usage,select on sequence public.ktn_consultation_events_id_seq to service_role;
end $$;

-- Khóa hàng hội thoại giữ việc nhận ca và gửi tin của bot nhất quán trên nhiều Worker.
create function public.ktn_consultation_action(
  p_id uuid, p_action text, p_actor text default null, p_admin boolean default false,
  p_payload jsonb default '{}'
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  c public.ktn_consultations;
  m public.ktn_consultation_messages;
  target text;
  text_body text := nullif(btrim(p_payload->>'body'), '');
  sender_type text;
  delivery_state text;
  clock_time timestamptz := now();
begin
  select * into c from public.ktn_consultations where id = p_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  if p_action = 'customer' then
    if c.channel = 'messenger' and nullif(p_payload->>'external_id', '') is null then
      return jsonb_build_object('error','invalid');
    end if;
    sender_type := 'customer';
  elsif p_action = 'external' then
    if c.channel <> 'messenger' or nullif(p_payload->>'external_id', '') is null then
      return jsonb_build_object('error','invalid');
    end if;
    sender_type := 'external';
    update public.ktn_consultation_messages set delivery='failed',delivery_note='Đã có phản hồi từ Fanpage'
      where consultation_id=c.id and sender='bot' and delivery='queued';
  elsif p_action = 'bot' then
    if c.status <> 'bot' or c.owner_email is not null or
       (p_payload->>'after_id') is distinct from (
         select id::text from public.ktn_consultation_messages
         where consultation_id = c.id order by created_at desc, id desc limit 1
       ) then return jsonb_build_object('error','conflict'); end if;
    sender_type := 'bot';
  elsif p_action = 'queue' then
    if c.status <> 'bot' or c.owner_email is not null or (p_payload->>'after_id') is distinct from (
      select id::text from public.ktn_consultation_messages
      where consultation_id = c.id order by created_at desc, id desc limit 1
    ) then return jsonb_build_object('error','conflict'); end if;
    update public.ktn_consultations set status='waiting', queued_at=coalesce(queued_at, clock_time), updated_at=clock_time where id=c.id returning * into c;
    if text_body is not null then
      insert into public.ktn_consultation_messages (consultation_id,sender,body,delivery)
        values(c.id,'system',text_body,case when c.channel='messenger' then 'queued' else 'sent' end);
    end if;
    insert into public.ktn_consultation_events (consultation_id, kind) values (c.id, 'queued');
    return jsonb_build_object('conversation',to_jsonb(c));
  else
    if not p_admin and (p_actor is null or not exists (select 1 from public.ktn_advisors where email=p_actor and active)) then
      return jsonb_build_object('error','forbidden');
    end if;
    if p_action = 'claim' or p_action = 'assign' then
      if (p_action = 'assign' and not p_admin) or c.status = 'closed' or
         (p_action = 'claim' and c.owner_email is not null) then
        return jsonb_build_object('error','conflict');
      end if;
      target := case when p_action = 'claim' then p_actor else nullif(p_payload->>'email','') end;
      if target is not null and not exists (select 1 from public.ktn_advisors where email=target and active) then
        return jsonb_build_object('error','invalid');
      end if;
      insert into public.ktn_consultation_events (consultation_id, actor_email, kind, detail)
      values (c.id,p_actor,'assigned',jsonb_build_object('from',c.owner_email,'to',target));
      update public.ktn_consultation_messages
        set delivery='failed', delivery_note='Đã chuyển cho tư vấn viên'
        where consultation_id=c.id and sender='bot' and delivery='queued';
      update public.ktn_consultations set owner_email=target, status=case when target is null then 'waiting' else 'open' end,
        queued_at=coalesce(queued_at, clock_time), updated_at=clock_time where id=c.id returning * into c;
      return jsonb_build_object('conversation',to_jsonb(c));
    end if;
    if not p_admin and c.owner_email is distinct from p_actor then
      return jsonb_build_object('error','forbidden');
    end if;
    if p_action in ('note', 'follow_up', 'close', 'reopen') then
      if p_action = 'note' and text_body is null then return jsonb_build_object('error','invalid'); end if;
      if p_action = 'close' and coalesce(p_payload->>'outcome','') not in ('registered','declined','no_response','other') then
        return jsonb_build_object('error','invalid');
      end if;
      if p_action='close' then
        update public.ktn_consultation_messages set delivery='failed',delivery_note='Đã đóng ca'
          where consultation_id=c.id and sender='bot' and delivery='queued';
      end if;
      if p_action='follow_up' and c.status='closed' then
        return jsonb_build_object('error','conflict');
      end if;
      update public.ktn_consultations set
        follow_up_at=case when p_action='follow_up' then (p_payload->>'at')::timestamptz when p_action='close' then null else follow_up_at end,
        outcome=case when p_action='close' then p_payload->>'outcome' when p_action='reopen' then null else outcome end,
        status=case when p_action='close' then 'closed' when p_action='reopen' then case when owner_email is null then 'waiting' else 'open' end else status end,
        updated_at=clock_time where id=c.id returning * into c;
      insert into public.ktn_consultation_events (consultation_id, actor_email, kind, detail) values(c.id,p_actor,p_action,p_payload);
      return jsonb_build_object('conversation',to_jsonb(c));
    end if;
    if p_action <> 'reply' or c.status = 'closed' or c.status = 'bot' then
      return jsonb_build_object('error','conflict');
    end if;
    sender_type := case when p_admin then 'manager' else 'advisor' end;
  end if;

  if text_body is null or length(text_body) > 4000 then return jsonb_build_object('error','invalid'); end if;
  if c.channel='messenger' and sender_type in ('advisor','manager','bot') then
    if c.last_customer_at is null or c.last_customer_at < clock_time - interval '24 hours' then
      return jsonb_build_object('error','window_closed');
    end if;
    delivery_state := 'queued';
  else
    delivery_state := 'sent';
  end if;
  insert into public.ktn_consultation_messages (consultation_id,sender,actor_email,body,external_id,delivery)
  values (c.id,sender_type,p_actor,text_body,p_payload->>'external_id',delivery_state)
  on conflict (external_id) do nothing returning * into m;
  if m.id is null then return jsonb_build_object('duplicate',true); end if;
  update public.ktn_consultations set
    last_customer_at=case when sender_type='customer' then greatest(last_customer_at, least(clock_time, coalesce((p_payload->>'at')::timestamptz,clock_time))) else last_customer_at end,
    status=case when sender_type='customer' and status='closed' then case when owner_email is null then 'waiting' else 'open' end
                when sender_type='external' and status='bot' then 'waiting' else status end,
    outcome=case when sender_type='customer' and status='closed' then null else outcome end,
    queued_at=case when status='waiting' or (sender_type='customer' and status='closed') or sender_type='external' then coalesce(queued_at,clock_time) else queued_at end,
    first_reply_at=case when sender_type in ('advisor','manager') and delivery_state='sent' then coalesce(first_reply_at,clock_time) else first_reply_at end,
    last_reply_at=case when delivery_state='sent' and sender_type in ('advisor','manager','bot','external') then clock_time else last_reply_at end,
    next_review_at=case when sender_type in ('advisor','manager') and delivery_state='sent' then clock_time else next_review_at end,
    updated_at=clock_time where id=c.id returning * into c;
  return jsonb_build_object('conversation',to_jsonb(c),'message',to_jsonb(m));
end
$$;

create function public.ktn_consultation_create_order(
  p_id uuid, p_request_id uuid, p_order jsonb, p_qr_base text
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  c public.ktn_consultations;
  o public.ktn_orders;
  candidate text;
begin
  select * into c from public.ktn_consultations where id=p_id for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  select ktn_orders.* into o from public.ktn_orders join public.ktn_consultation_orders using (order_id)
    where consultation_id=p_id and request_id=p_request_id;
  if found then return to_jsonb(o); end if;
  for counter in 1..10 loop
    candidate := 'ORD-' || (100000 + floor(random()*900000)::int)::text;
    insert into public.ktn_orders (order_id, student_name, student_email, phone, course_id, course_name, amount, note)
    values (candidate,p_order->>'student_name',p_order->>'student_email',p_order->>'phone',
      p_order->>'course_id',p_order->>'course_name',(p_order->>'amount')::int,p_order->>'note')
    on conflict (order_id) do nothing returning * into o;
    exit when o.order_id is not null;
  end loop;
  if o.order_id is null then raise exception 'Unable to allocate order ID'; end if;
  insert into public.ktn_consultation_orders (order_id,consultation_id,request_id,owner_email,payment_info)
    values(o.order_id,p_id,p_request_id,c.owner_email,p_order->'payment_info');
  insert into public.ktn_consultation_events (consultation_id,actor_email,kind,detail)
    values(p_id,c.owner_email,'order',jsonb_build_object('order_id',o.order_id));
  update public.ktn_consultations set updated_at=now() where id=c.id;
  if c.channel='messenger' and c.last_customer_at > now() - interval '24 hours' then
    insert into public.ktn_consultation_messages (consultation_id,sender,body,delivery)
      values(c.id,'system','Đơn ' || o.order_id || ' · ' || o.course_name || E'\nVietQR: ' ||
        replace(p_qr_base,'ORDER_CODE',o.order_id),'queued');
  end if;
  return to_jsonb(o);
end
$$;

create function public.ktn_consultation_record_payment(p_order text,p_transaction text,p_amount bigint)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare
  o public.ktn_orders;
  observed public.ktn_consultation_payments;
  next_status text;
begin
  select ktn_orders.* into o from public.ktn_orders join public.ktn_consultation_orders using (order_id)
    where order_id=p_order for update of ktn_orders;
  if not found then return jsonb_build_object('unknown',true); end if;
  next_status := case when o.payment_status in ('cancelled','refunded') or o.approval_status='rejected' then 'needs_review'
                      when o.payment_status='paid' then 'duplicate'
                      when o.amount<>p_amount then 'mismatch'
                      else 'accepted' end;
  insert into public.ktn_consultation_payments (transaction_id,order_id,amount,status)
    values(p_transaction,p_order,p_amount,next_status) on conflict(transaction_id) do nothing returning * into observed;
  if observed.transaction_id is null then
    select * into observed from public.ktn_consultation_payments where transaction_id=p_transaction;
    if observed.order_id<>p_order or observed.amount<>p_amount then return jsonb_build_object('conflict',true); end if;
    return to_jsonb(observed);
  end if;
  if observed.status='accepted' then update public.ktn_orders set payment_status='paid',updated_at=now() where order_id=p_order; end if;
  return to_jsonb(observed);
end
$$;

create function public.ktn_consultation_take_payment(p_order text default null)
returns setof public.ktn_consultation_payments language sql set search_path=public,pg_temp as $$
  update public.ktn_consultation_payments p set attempts=p.attempts+1,next_attempt_at=now()+interval '5 minutes'
  where p.transaction_id in (
    select transaction_id from public.ktn_consultation_payments
    where status='accepted' and next_attempt_at<=now() and (p_order is null or order_id=p_order)
    order by next_attempt_at limit 5 for update skip locked
  ) returning p.*;
$$;

create function public.ktn_consultation_auto_assign(p_id uuid)
returns boolean language plpgsql set search_path=public,pg_temp as $$
declare target text;
begin
  perform 1 from public.ktn_consultations where id=p_id and status='waiting' and owner_email is null for update;
  if not found then return false; end if;
  insert into public.ktn_consultation_advisor_counters(email)
    select email from public.ktn_advisors where active on conflict do nothing;
  select counter.email into target from public.ktn_consultation_advisor_counters counter
    join public.ktn_advisors advisor on advisor.email=counter.email
    where advisor.active order by counter.last_assigned_at,counter.email limit 1 for update of counter skip locked;
  if target is null then return false; end if;
  perform public.ktn_consultation_action(p_id,'assign',null,true,jsonb_build_object('email',target));
  update public.ktn_consultation_advisor_counters set last_assigned_at=clock_timestamp() where email=target;
  return true;
end $$;

create function public.ktn_consultation_take_outbox(p_id uuid default null)
returns setof public.ktn_consultation_messages language sql set search_path=public,pg_temp as $$
  update public.ktn_consultation_messages m set
    delivery=case when c.last_customer_at > now()-interval '24 hours' and
      (m.sender<>'bot' or c.status='bot') then 'sending' else 'failed' end,
    claimed_at=now(),
    delivery_note=case when c.last_customer_at <= now()-interval '24 hours' then 'Ngoài cửa sổ Messenger'
      when m.sender='bot' and c.status<>'bot' then 'Đã chuyển cho tư vấn viên' end
  from public.ktn_consultations c
  where m.consultation_id=c.id and m.id in (
    select id from public.ktn_consultation_messages
    where delivery='queued' and (p_id is null or consultation_id=p_id)
    order by created_at,id limit 10 for update skip locked
  ) returning m.*;
$$;

create function public.ktn_consultation_complete_send(p_id uuid,p_external_id text,p_error text default null)
returns void language plpgsql set search_path=public,pg_temp as $$
declare m public.ktn_consultation_messages;
begin
  -- Echo có thể về trước phản hồi Send API. Giữ bản ghi có người gửi nội bộ.
  if p_external_id is not null then
    delete from public.ktn_consultation_messages where external_id=p_external_id and sender='external'
      and consultation_id=(select consultation_id from public.ktn_consultation_messages where id=p_id);
  end if;
  update public.ktn_consultation_messages
    set delivery=case when p_error is null then 'sent' else 'failed' end,delivery_note=p_error,
      external_id=coalesce(p_external_id,external_id)
    where id=p_id and delivery='sending' returning * into m;
  if m.id is not null and p_error is null then
    update public.ktn_consultations set last_reply_at=greatest(last_reply_at,m.created_at),
      first_reply_at=case when m.sender in ('advisor','manager') then least(first_reply_at,m.created_at) else first_reply_at end,
      next_review_at=case when m.sender in ('advisor','manager') then now() else next_review_at end
    where id=m.consultation_id;
  end if;
end
$$;

create function public.ktn_consultation_review_flag(p_id uuid,p_message uuid,p_actor text,p_status text,p_note text)
returns boolean language plpgsql set search_path=public,pg_temp as $$
begin
  update public.ktn_consultation_flags set status=p_status,reviewed_by=p_actor,review_note=p_note,reviewed_at=now()
    where consultation_id=p_id and message_id=p_message and status='pending';
  if not found then return false; end if;
  insert into public.ktn_consultation_events(consultation_id,actor_email,kind,detail)
    values(p_id,p_actor,'review',jsonb_build_object('message_id',p_message,'decision',p_status));
  return true;
end
$$;

create function public.ktn_consultation_retry_payment(p_order text,p_transaction text,p_actor text)
returns boolean language plpgsql set search_path=public,pg_temp as $$
declare consultation uuid;
begin
  select consultation_id into consultation from public.ktn_consultation_orders where order_id=p_order;
  if consultation is null then return false; end if;
  update public.ktn_consultation_payments p set status='accepted',attempts=0,next_attempt_at=now(),error=null
    from public.ktn_orders o where o.order_id=p_order and o.payment_status='paid' and o.approval_status<>'rejected'
    and p.order_id=o.order_id and p.transaction_id=p_transaction and p.amount=o.amount and p.attempts>0 and p.status='needs_review';
  if not found then return false; end if;
  insert into public.ktn_consultation_events(consultation_id,actor_email,kind,detail)
    values(consultation,p_actor,'payment_retry',jsonb_build_object('order_id',p_order));
  return true;
end
$$;

do $$
declare signature text;
begin
  foreach signature in array array['ktn_consultation_action(uuid,text,text,boolean,jsonb)',
    'ktn_consultation_create_order(uuid,uuid,jsonb,text)','ktn_consultation_record_payment(text,text,bigint)',
    'ktn_consultation_take_payment(text)','ktn_consultation_take_outbox(uuid)',
    'ktn_consultation_complete_send(uuid,text,text)','ktn_consultation_review_flag(uuid,uuid,text,text,text)',
    'ktn_consultation_retry_payment(text,text,text)','ktn_consultation_auto_assign(uuid)'] loop
    execute 'revoke all on function public.'||signature||' from public, anon, authenticated';
    execute 'grant execute on function public.'||signature||' to service_role';
  end loop;
end $$;

commit;
