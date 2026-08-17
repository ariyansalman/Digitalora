-- 0044 created this function under the wrong name
-- (credit_cryptobot_deposit) while the bot calls
-- credit_cryptopay_deposit, so every Crypto Pay credit failed.
-- Recreate it under the name the bot calls and drop the orphan.
-- Explicit aliases and output casts also avoid PL/pgSQL
-- name-resolution ambiguity in UPDATE ... RETURNING / RETURN QUERY.

drop function if exists public.credit_cryptobot_deposit(bigint, text);

create or replace function public.credit_cryptopay_deposit(
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
    update public.deposits as dep
       set status = 'approved',
           tx_hash = p_tx_hash,
           updated_at = now()
     where dep.id = p_deposit_id
       and dep.status = 'pending'
       and (dep.tx_hash is null or dep.tx_hash = p_tx_hash)
       and not exists (
           select 1
             from public.deposits as other_dep
            where other_dep.tx_hash = p_tx_hash
              and other_dep.id <> p_deposit_id
       )
    returning dep.user_id, dep.amount
      into v_user_id, v_amount;

    if not found then
        select approved_dep.user_id, approved_dep.amount
          into v_user_id, v_amount
          from public.deposits as approved_dep
         where approved_dep.id = p_deposit_id
           and approved_dep.status = 'approved';

        if found then
            select wallet_user.balance
              into v_balance
              from public.users as wallet_user
             where wallet_user.telegram_id = v_user_id;

            return query
                select false::boolean,
                       v_user_id::bigint,
                       v_amount::numeric,
                       v_balance::numeric;
            return;
        end if;

        return query
            select false::boolean,
                   null::bigint,
                   null::numeric,
                   null::numeric;
        return;
    end if;

    update public.users as wallet_user
       set balance = coalesce(wallet_user.balance, 0) + v_amount
     where wallet_user.telegram_id = v_user_id
    returning wallet_user.balance
      into v_balance;

    insert into public.wallet_ledger(user_id, type, amount, reference)
    values (v_user_id, 'deposit_credit', v_amount, p_tx_hash);

    return query
        select true::boolean,
               v_user_id::bigint,
               v_amount::numeric,
               v_balance::numeric;
end;
$$;
