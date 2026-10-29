create table if not exists public.manual_payment_reviews (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid not null references public.payments(id),
    reviewer_id uuid not null references auth.users(id),
    decision text not null check (decision in ('APPROVE', 'REJECT')),
    reason text not null check (length(trim(reason)) between 1 and 500),
    created_at timestamptz not null default now(),
    unique (payment_id)
);
alter table public.manual_payment_reviews enable row level security;
revoke all on public.manual_payment_reviews from anon, authenticated;

create or replace function public.admin_review_manual_payment(p_payment_id uuid, p_decision text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payment public.payments%rowtype; v_decision text := upper(trim(coalesce(p_decision,'')));
begin
    if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if v_decision not in ('APPROVE', 'REJECT') or length(trim(coalesce(p_reason,''))) not between 1 and 500 then
        raise exception 'Valid decision and reason are required';
    end if;
    select * into v_payment from public.payments where id = p_payment_id for update;
    if v_payment.id is null then raise exception 'Payment not found'; end if;
    if v_payment.status <> 'pending' or lower(coalesce(v_payment.payment_method,'')) <> 'manual' then
        raise exception 'Only pending manual payments can be reviewed';
    end if;
    insert into public.manual_payment_reviews(payment_id, reviewer_id, decision, reason)
      values (p_payment_id, auth.uid(), v_decision, trim(p_reason));
    update public.payments set status = case when v_decision = 'APPROVE' then 'completed' else 'failed' end,
        paid_at = case when v_decision = 'APPROVE' then now() else null end, updated_at = now()
      where id = p_payment_id;
    return jsonb_build_object('status', case when v_decision = 'APPROVE' then 'completed' else 'failed' end);
end;
$$;
revoke all on function public.admin_review_manual_payment(uuid, text, text) from public, anon;
grant execute on function public.admin_review_manual_payment(uuid, text, text) to authenticated;
