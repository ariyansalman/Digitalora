# Repository Boundaries

The bot historically concentrated Supabase access in `src/db/queries.ts`. That
file remains the backwards-compatible implementation for now, but new service
code should not grow its direct dependency on it.

## Current boundaries

- `src/db/repositories/users.ts` — user/admin reads used by services
- `src/db/repositories/products.ts` — product/catalog reads used by services
- `src/db/repositories/deposits.ts` — deposit/payment recovery operations
- `src/db/repositories/orders.ts` — order/direct-pay fulfilment operations

## Migration rule

When touching an existing service, move its required query imports to the
appropriate repository boundary instead of adding another direct import from
`db/queries.ts`.

The legacy query module is deliberately retained because the admin handler and
several older flows still depend on it. Removing it in one rewrite would create
an unnecessary regression risk. The migration is therefore incremental.
