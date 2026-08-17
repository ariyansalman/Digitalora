alter table public.users
  add column if not exists currency text not null default 'USDT';

update public.users
set currency = 'USDT'
where currency is null or trim(currency) = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_currency_code_check'
  ) then
    alter table public.users
      add constraint users_currency_code_check
      check (currency in (
        'USDT', 'USD', 'PKR', 'INR', 'BDT', 'AED', 'SAR', 'TRY',
        'IDR', 'PHP', 'VND', 'THB', 'MYR', 'SGD', 'EUR', 'GBP',
        'CAD', 'AUD', 'NGN', 'EGP'
      ));
  end if;
end $$;
