/**
 * Centralized multi-step flow state teardown.
 *
 * Every screen that leaves a multi-step input flow used to clear the
 * session by hand (`ctx.session.userFlow = undefined`, sometimes plus
 * `delete ctx.session.qtyInput[id]`, sometimes not). Missing one of the
 * pieces is exactly how a user ends up in a "dead screen": the keyboard
 * shows the shop, but the bot still parses their next message as a
 * quantity / email / transaction id.
 *
 * `clearFlowState()` is the single teardown routine. It is additive and
 * backward-compatible: it only touches transient UI state, never
 * financial or order state (which lives in Supabase).
 */

export type FlowSessionData = {
  qty?: Record<number, number>;
  qtyInput?: Record<number, string>;
  userFlow?: unknown;
  adminFlow?: unknown;
  topupOriginBuyProductId?: number;
};

export type FlowCtx = { session: FlowSessionData };

/**
 * Flows that own external artifacts (a pinned Live Support panel, a
 * half-submitted delivery form tied to a paid order) must be ended by
 * their own Cancel/End button so those artifacts are cleaned up. Plain
 * navigation never silently drops them.
 */
export const PROTECTED_FLOW_TYPES = Object.freeze(['live_support', 'delivery_form']);

export type ClearFlowOptions = {
  /** Also clear the admin multi-step flow. Defaults to `false`. */
  admin?: boolean;
  /** Clear the pending custom-quantity digit buffers. Defaults to `true`. */
  quantityInput?: boolean;
  /** Clear the "topup was opened from a buy screen" back-link. Defaults to `false`. */
  topupOrigin?: boolean;
  /** Flow types that must survive this teardown. */
  preserve?: readonly string[];
};

/**
 * Drops the user's in-progress input flow so the next plain-text message
 * is no longer swallowed by a stale step handler.
 *
 * Safe to call unconditionally — including when no flow is active, and
 * when the session has not been fully initialised yet.
 */
export function clearFlowState(ctx: FlowCtx | undefined, options: ClearFlowOptions = {}): void {
  const session = ctx?.session as FlowSessionData | undefined;
  if (!session) return;

  const currentType = activeFlowType(ctx);
  const preserved = options.preserve ?? [];
  if (!(currentType && preserved.includes(currentType))) {
    session.userFlow = undefined;
  }
  if (options.admin) session.adminFlow = undefined;
  if (options.quantityInput !== false) session.qtyInput = {};
  if (options.topupOrigin) delete session.topupOriginBuyProductId;
}

/** True when the user currently has a multi-step input flow open. */
export function hasActiveFlow(ctx: FlowCtx | undefined): boolean {
  const session = ctx?.session as FlowSessionData | undefined;
  return Boolean(session?.userFlow ?? session?.adminFlow);
}

/** Reads the active user flow `type`, or `null` when no flow is open. */
export function activeFlowType(ctx: FlowCtx | undefined): string | null {
  const flow = (ctx?.session as FlowSessionData | undefined)?.userFlow as
    | { type?: unknown }
    | undefined;
  return typeof flow?.type === 'string' ? flow.type : null;
}

/**
 * Teardown used by ordinary navigation (Home, Store, Cart, Back). Wipes
 * transient input flows but leaves the flows listed in
 * `PROTECTED_FLOW_TYPES` alone.
 */
export function clearTransientFlowState(ctx: FlowCtx | undefined): void {
  clearFlowState(ctx, { preserve: PROTECTED_FLOW_TYPES });
}
