-- 0018_deposits_order_intent.sql
--
-- Phase B of the auto-verify rebuild. Adds a single nullable JSONB
-- column to `deposits` that — when populated — turns a deposit into
-- a *direct-pay-per-order* payment instead of a wallet top-up.
--
-- The column shape is opaque to the DB but the bot expects:
--
--   {
--     "product_id": 12,
--     "product_name": "Netflix Premium",
--     "qty": 2,
--     "unit_price": 5.99,
--     "discount": 0,
--     "promo_id": null,
--     "total": 11.98
--   }
--
-- When the auto-verify orchestrator finds a deposit whose
-- `order_intent` is non-null, it runs the order-fulfilment path
-- (create order, decrement stock, claim items, deliver, send invoice)
-- instead of the legacy wallet-credit path. When `order_intent` is
-- null the deposit behaves exactly as before — the existing Phase A
-- top-up flow is untouched.

alter table public.deposits
    add column if not exists order_intent jsonb;
