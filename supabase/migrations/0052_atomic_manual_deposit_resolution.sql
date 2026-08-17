-- 0052_atomic_manual_deposit_resolution.sql
-- Make manual admin deposit approval/rejection race-safe.
-- Approval reuses the existing atomic approval primitive so wallet top-ups
-- are credited exactly once, while direct-pay deposits remain uncredited and
-- can proceed through the durable fulfilment state machine.

create or replace function public.reject_deposit_atomic(
    p_deposit_id bigint
)
returns table (rejected boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.deposits
       set status = 'rejected',
           updated_at = now()
     where id = p_deposit_id
       and status = 'pending';

    return query select found;
end;
$$;

revoke execute on function public.reject_deposit_atomic(bigint) from public, anon, authenticated;
grant execute on function public.reject_deposit_atomic(bigint) to service_role;
