-- Optional quantity-tiered per-unit pricing for promos.
-- A promo with no child rows remains the existing flat-discount promo.
create table if not exists public.promo_tiers (
    id         bigserial primary key,
    promo_id   bigint not null references public.promos(id) on delete cascade,
    min_qty    int not null check (min_qty >= 1),
    max_qty    int check (max_qty is null or max_qty >= min_qty),
    unit_price numeric(14,4) not null check (unit_price >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists promo_tiers_promo_idx
    on public.promo_tiers(promo_id);

create or replace function public.create_tiered_promo(
    p_product_id bigint,
    p_telegram_id bigint,
    p_name text,
    p_min_qty int,
    p_created_by bigint,
    p_tiers jsonb
) returns public.promos
language plpgsql
as $$
declare
    created public.promos;
begin
    insert into public.promos (
        product_id, telegram_id, name, min_qty, discount_amount, created_by
    ) values (
        p_product_id, p_telegram_id, p_name, p_min_qty, 0, p_created_by
    )
    returning * into created;

    insert into public.promo_tiers (promo_id, min_qty, max_qty, unit_price)
    select created.id, t.min_qty, t.max_qty, t.unit_price
    from jsonb_to_recordset(p_tiers) as t(
        min_qty int,
        max_qty int,
        unit_price numeric(14,4)
    );

    return created;
end;
$$;

create or replace function public.replace_promo_tiers(
    p_promo_id bigint,
    p_min_qty int,
    p_tiers jsonb
) returns void
language plpgsql
as $$
begin
    update public.promos
       set min_qty = p_min_qty,
           updated_at = now()
     where id = p_promo_id;
    if not found then
        raise exception 'promo % not found', p_promo_id;
    end if;

    delete from public.promo_tiers where promo_id = p_promo_id;
    insert into public.promo_tiers (promo_id, min_qty, max_qty, unit_price)
    select p_promo_id, t.min_qty, t.max_qty, t.unit_price
    from jsonb_to_recordset(p_tiers) as t(
        min_qty int,
        max_qty int,
        unit_price numeric(14,4)
    );
end;
$$;
