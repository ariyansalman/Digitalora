/**
 * Database repository boundaries.
 *
 * New application/service code should import domain operations from these
 * modules instead of importing the legacy monolithic `db/queries.ts` directly.
 * The underlying implementation remains backwards-compatible while the
 * repository split is migrated incrementally.
 */
export * from './users.js';
export * from './products.js';
export * from './deposits.js';
export * from './orders.js';
export * from './cart.js';
