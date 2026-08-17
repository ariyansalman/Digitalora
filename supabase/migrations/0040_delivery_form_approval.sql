-- Manual slot/invite fulfillment for selected products.
-- Extends the existing 0024 delivery-form feature with an admin
-- approval lifecycle and a separately editable buyer completion card.

alter table public.products
  add column if not exists delivery_completion_message text;

alter table public.order_delivery_submissions
  add column if not exists status text not null default 'pending',
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_delivery_submissions_status_check'
  ) then
    alter table public.order_delivery_submissions
      add constraint order_delivery_submissions_status_check
      check (status in ('pending', 'completed'));
  end if;
end $$;

create index if not exists order_delivery_submissions_status
  on public.order_delivery_submissions(status, submitted_at desc);

