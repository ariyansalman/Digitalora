-- Telegram Crypto Pay API wallet top-ups.

alter table public.payment_methods
    drop constraint if exists payment_methods_provider_check;

alter table public.payment_methods
    add constraint payment_methods_provider_check
    check (provider in (
        'manual',
        'binance_pay',
        'bybit_pay',
        'usdt_trc20',
        'usdt_bep20',
        'usdt_ton',
        'ltc',
        'cryptobot'
    ));

-- Atomically approve one Crypto Pay deposit and credit its wallet.
-- A false `credited` result means another request already resolved it.
create or replace function public.credit_cryptobot_deposit(
    p_deposit_id bigint,
    p_tx_hash text
)
returns table (
    credited boolean,
    user_id bigint,
    amount numeric,
    new_balance numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id bigint;
    v_amount numeric;
    v_balance numeric;
begin
    update public.deposits
       set status = 'approved',
           tx_hash = p_tx_hash,
           updated_at = now()
     where id = p_deposit_id
       and status = 'pending'
       and (tx_hash is null or tx_hash = p_tx_hash)
       and not exists (
           select 1
             from public.deposits d
            where d.tx_hash = p_tx_hash
              and d.id <> p_deposit_id
       )
    returning deposits.user_id, deposits.amount
      into v_user_id, v_amount;

    if not found then
        select d.user_id, d.amount
          into v_user_id, v_amount
          from public.deposits d
         where d.id = p_deposit_id
           and d.status = 'approved';

        if found then
            select u.balance into v_balance
              from public.users u
             where u.telegram_id = v_user_id;
            return query select false, v_user_id, v_amount, v_balance;
            return;
        end if;

        return query select false, null::bigint, null::numeric, null::numeric;
        return;
    end if;

    update public.users
       set balance = coalesce(balance, 0) + v_amount
     where telegram_id = v_user_id
    returning users.balance into v_balance;

    insert into public.wallet_ledger(user_id, type, amount, reference)
    values (v_user_id, 'deposit_credit', v_amount, p_tx_hash);

    return query select true, v_user_id, v_amount, v_balance;
end;
$$;
