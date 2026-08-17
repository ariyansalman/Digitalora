-- =====================================================================
-- 0006_wallet_ledger.sql
-- Records every change to a user's wallet balance so the "My Deposits"
-- screen can show a Wallet Balance History (purchases / admin adjusts /
-- deposit credits).
--
-- Pre-existing balance changes are NOT back-filled.
-- =====================================================================

create table if not exists public.wallet_ledger (
    id          bigserial primary key,
    user_id     bigint not null references public.users(telegram_id) on delete cascade,
    type        text   not null,
    -- Signed amount: negative = debit, positive = credit.
    amount      numeric(14,2) not null,
    -- Free-form reference (e.g. 'order:42', 'pay:128…', 'admin_add_balance').
    reference   text,
    created_at  timestamptz not null default now()
);

create index if not exists wallet_ledger_user_idx
    on public.wallet_ledger(user_id, created_at desc);
