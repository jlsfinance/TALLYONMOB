begin;

create table public.whatsapp_links (
    phone_key text primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    company_id text references public.companies(id) on delete set null
);

create index whatsapp_links_user_idx on public.whatsapp_links (user_id);

create table public.whatsapp_challenges (
    phone_key text primary key,
    code_hash text not null,
    expires_at timestamptz not null
);

create index whatsapp_challenges_expiry_idx on public.whatsapp_challenges (expires_at);

create table public.whatsapp_messages (
    id text primary key,
    received_at timestamptz not null default now(),
    lease_until timestamptz not null default (now() + interval '3 minutes'),
    delivered boolean not null default false
);

create index whatsapp_messages_received_idx on public.whatsapp_messages (received_at);

alter table public.whatsapp_links enable row level security;
alter table public.whatsapp_challenges enable row level security;
alter table public.whatsapp_messages enable row level security;

revoke all on public.whatsapp_links, public.whatsapp_challenges, public.whatsapp_messages
    from public, anon, authenticated;
grant select, insert, update, delete
    on public.whatsapp_links, public.whatsapp_challenges, public.whatsapp_messages to service_role;

create function public.whatsapp_confirm_link(p_phone_key text, p_code_hash text, p_user_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
    delete from public.whatsapp_challenges
    where phone_key = p_phone_key and code_hash = p_code_hash and expires_at > now();
    if not found then
        return false;
    end if;

    insert into public.whatsapp_links (phone_key, user_id)
    values (p_phone_key, p_user_id)
    on conflict (phone_key) do nothing;
    return exists (
        select 1 from public.whatsapp_links
        where phone_key = p_phone_key and user_id = p_user_id
    );
end;
$$;

create function public.whatsapp_claim_message(p_id text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
    delete from public.whatsapp_messages where received_at < now() - interval '8 days';
    delete from public.whatsapp_challenges where expires_at <= now();
    insert into public.whatsapp_messages (id) values (p_id)
    on conflict (id) do update set lease_until = excluded.lease_until
    where not whatsapp_messages.delivered and whatsapp_messages.lease_until <= now();
    if found then
        return 'claimed';
    end if;
    if exists (select 1 from public.whatsapp_messages where id = p_id and delivered) then
        return 'delivered';
    end if;
    return 'processing';
end;
$$;

create function public.whatsapp_report(
    p_phone_key text, p_company_id text, p_kind text,
    p_start date default null, p_end date default null, p_name text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    company public.companies%rowtype;
    result jsonb;
    voucher_kind text;
begin
    select c.* into company
    from public.whatsapp_links l
    join public.companies c on c.id = p_company_id and c.owner_id = l.user_id
    where l.phone_key = p_phone_key and (l.company_id is null or l.company_id = c.id);

    if not found then
        return null;
    end if;

    if p_kind in ('sales', 'purchase', 'receipt', 'payment') then
        voucher_kind := initcap(p_kind);
        select jsonb_build_object('count', count(*),
            'total', coalesce(sum(abs(coalesce(nullif(v.grand_total, 0), v.total_amount, 0))), 0))
        into result
        from public.vouchers v
        where v.company_id = company.id and v.voucher_type = voucher_kind
            and v.is_deleted is not true and v.voucher_date between p_start and p_end;
    elsif p_kind = 'balance' then
        select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) into result
        from (
            select l.name, l.current_balance,
                (select sum(abs(b.amount)) from public.outstanding_bills b
                 where b.company_id = company.id and b.ledger_name = l.name and b.direction = 'receivable') as receivable,
                (select sum(abs(b.amount)) from public.outstanding_bills b
                 where b.company_id = company.id and b.ledger_name = l.name and b.direction = 'payable') as payable
            from public.ledgers l
            where l.company_id = company.id
                and strpos(lower(l.name), lower(p_name)) > 0
            order by (lower(l.name) = lower(p_name)) desc, l.name, l.id
            limit 6
        ) rows;
    elsif p_kind = 'stock' then
        select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) into result
        from (
            select s.name, s.current_stock, s.unit
            from public.stock_items s
            where s.company_id = company.id
                and strpos(lower(s.name), lower(p_name)) > 0
            order by (lower(s.name) = lower(p_name)) desc, s.name, s.id
            limit 6
        ) rows;
    elsif p_kind = 'sync' then
        select jsonb_build_object('status', h.status, 'time', coalesce(h.completed_at, h.started_at))
        into result
        from public.sync_history h
        where h.company_id = company.id
        order by h.started_at desc nulls last
        limit 1;
    else
        return null;
    end if;

    return jsonb_build_object('company', company.name, 'last_sync', company.last_sync_at, 'result', result);
end;
$$;

revoke all on function public.whatsapp_confirm_link(text, text, uuid),
    public.whatsapp_claim_message(text), public.whatsapp_report(text, text, text, date, date, text)
    from public, anon, authenticated;
grant execute on function public.whatsapp_confirm_link(text, text, uuid),
    public.whatsapp_claim_message(text), public.whatsapp_report(text, text, text, date, date, text)
    to service_role;

commit;
