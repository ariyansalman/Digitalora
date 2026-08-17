-- =====================================================================
-- 0024_product_delivery_form.sql
--
-- Per-product post-purchase delivery form. For products where the
-- buyer has to submit their own details (email + password / code /
-- gift-card key / anything else) after paying, the admin can:
--   • Flip `delivery_form_enabled` to ON.
--   • Set an instruction message shown before the submission box.
--   • Declare a list of fields the buyer has to fill in.
--   • Set a success message shown when the buyer submits the form.
--   • Pick a vendor (Telegram chat id) the bot auto-DMs with the
--     submitted details + an order tag, every time the form is
--     submitted or resubmitted.
--
-- Submissions are stored 1:1 with `orders` so the buyer can tap
-- "Edit Details" later and resend a corrected version — we bump
-- `revision` and ping the vendor again with a "Resubmitted as
-- Corrected" header.
-- =====================================================================

alter table public.products
    add column if not exists delivery_form_enabled    boolean not null default false,
    add column if not exists delivery_instruction     text,
    add column if not exists delivery_fields          jsonb   not null default '[]'::jsonb,
    add column if not exists delivery_success_message text,
    add column if not exists delivery_vendor_chat_id  bigint,
    add column if not exists delivery_vendor_label    text;

create table if not exists public.order_delivery_submissions (
    id            bigserial primary key,
    order_id      bigint not null references public.orders(id) on delete cascade,
    user_id       bigint not null,
    product_id    bigint not null references public.products(id) on delete cascade,
    payload       jsonb  not null,
    revision      int    not null default 1,
    submitted_at  timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique(order_id)
);

create index if not exists order_delivery_submissions_user
    on public.order_delivery_submissions(user_id);
create index if not exists order_delivery_submissions_product
    on public.order_delivery_submissions(product_id);

alter table public.order_delivery_submissions enable row level security;
