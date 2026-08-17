# Inventory & Fulfilment Integrity (migration 0061)

## Audit summary

| Area | Before | After |
| --- | --- | --- |
| `products.stock` | decremented in its own call, restored ad hoc on failure | reserved via `reserve_product_stock`, committed or released as one unit |
| `product_items` | binary (`consumed_at` null / set) | explicit `state`: `available` → `reserved` → `consumed`, plus `expired` |
| Unlimited stock | bypassed stock math entirely | still bypasses counting; reservation returns `unlimited: true` and no units move |
| Supplier stock | synced by the supplier link job | unchanged; reservations sit on top of the synced number |
| Direct delivery | claim + deliver across several calls | single-winner `begin_order_delivery` guard around claim + deliver |
| Reseller fulfilment | could re-run on verifier retry | same delivery guard closes the order before a retry can deliver again |
| Manual fulfilment | pending orders held claimed items with no state | items stay `reserved` until the admin delivers, then `consumed` |
| Post-purchase forms | form-gated orders held stock implicitly | reservation stays active while the form is pending, released if abandoned |

## Guarantees

- **No overselling** — `reserve_product_stock` locks the product row (`FOR UPDATE`) and refuses to go below zero.
- **No duplicate key delivery** — a partial unique index allows at most one non-released owner per item.
- **No duplicate fulfilment** — `begin_order_delivery` returns `should_process = false` to every attempt but the first.
- **No two users receiving the same item** — claiming happens inside the reservation, under the same lock.
- **No stock mismatch** — every path either commits or releases its reservation; expired reservations are reaped.

## Inventory states

`available` (📦) · `reserved` (🔒) · `consumed` (✅ delivered) · `expired`

## Logging

Digital payloads never reach the logs. `maskPayload` / `redactItems` in `src/services/inventory.ts` are the only way item content is rendered for diagnostics, and a contract test fails the build if a log call takes a raw payload field.

## Low-stock thresholds

`products.low_stock_threshold` overrides the global `inventory.low_stock_threshold` setting. The admin product editor exposes it as **🟠 Low-stock alert**, and the analytics card lists the products currently at or under their threshold.

## Backwards compatibility

Every new data-access helper detects a missing table/function and falls back to the previous behaviour, so the app keeps working before `0061` is applied.
