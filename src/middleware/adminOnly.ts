import type { MiddlewareFn } from 'grammy';
import { isAdmin } from '../db/queries.js';
import type { AppCtx } from './user.js';

export const adminOnly: MiddlewareFn<AppCtx> = async (ctx, next) => {
  if (!ctx.from || !(await isAdmin(ctx.from.id))) {
    await ctx.reply(ctx.t?.('admin.only') ?? '⛔ Admin only.');
    return;
  }
  return next();
};
