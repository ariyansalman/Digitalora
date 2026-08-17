import { supabase } from '../db/supabase.js';
import * as cache from './cache.js';

export type AdminAnalytics = {
  days: number;
  orders: number;
  units: number;
  revenue: number;
  buyers: number;
  aov: number;
  newUsers: number;
  approvedDeposits: number;
  approvedDepositAmount: number;
  pendingDeposits: number;
  failedPayments: number;
  lowStock: number;
  outOfStock: number;
  topCustomer: { userId: number; orders: number; spend: number } | null;
};

export async function getAdminAnalytics(days = 7): Promise<AdminAnalytics> {
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  const cacheKey = `admin-analytics:${safeDays}`;
  const cached = cache.get<AdminAnalytics>(cacheKey);
  if (cached) return cached;
  const since = new Date(Date.now() - safeDays * 86_400_000).toISOString();

  const [ordersR, depositsR, pendingR, failedR, usersR, productsR] = await Promise.all([
    supabase
      .from('orders')
      .select('user_id,qty,total')
      .eq('status', 'paid')
      .gte('created_at', since)
      .limit(5000),
    supabase
      .from('deposits')
      .select('amount')
      .eq('status', 'approved')
      .gte('created_at', since)
      .limit(5000),
    supabase
      .from('deposits')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('deposits')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'rejected')
      .gte('created_at', since),
    supabase
      .from('users')
      .select('telegram_id', { count: 'exact', head: true })
      .gte('joined_at', since),
    supabase
      .from('products')
      .select('id,stock,active')
      .eq('active', true),
  ]);

  const orders = (ordersR.data ?? []) as Array<{
    user_id: number;
    qty: number | string;
    total: number | string;
  }>;

  const deposits = (depositsR.data ?? []) as Array<{ amount: number | string }>;
  const revenue = orders.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const units = orders.reduce((sum, row) => sum + Number(row.qty ?? 0), 0);
  const buyers = new Set(orders.map((row) => Number(row.user_id))).size;
  const approvedDepositAmount = deposits.reduce(
    (sum, row) => sum + Number(row.amount ?? 0),
    0,
  );

  const customerMap = new Map<number, { orders: number; spend: number }>();
  for (const row of orders) {
    const userId = Number(row.user_id);
    const current = customerMap.get(userId) ?? { orders: 0, spend: 0 };
    current.orders += 1;
    current.spend += Number(row.total ?? 0);
    customerMap.set(userId, current);
  }

  let topCustomer: AdminAnalytics['topCustomer'] = null;
  for (const [userId, value] of customerMap) {
    if (!topCustomer || value.spend > topCustomer.spend) {
      topCustomer = { userId, orders: value.orders, spend: value.spend };
    }
  }

  const products = (productsR.data ?? []) as Array<{
    stock: number | string;
    active: boolean;
  }>;
  const lowStock = products.filter((p) => Number(p.stock ?? 0) > 0 && Number(p.stock) <= 5).length;
  const outOfStock = products.filter((p) => Number(p.stock ?? 0) <= 0).length;

  const result: AdminAnalytics = {
    days: safeDays,
    orders: orders.length,
    units,
    revenue: Number(revenue.toFixed(2)),
    buyers,
    aov: orders.length ? Number((revenue / orders.length).toFixed(2)) : 0,
    newUsers: usersR.count ?? 0,
    approvedDeposits: deposits.length,
    approvedDepositAmount: Number(approvedDepositAmount.toFixed(2)),
    pendingDeposits: pendingR.count ?? 0,
    failedPayments: failedR.count ?? 0,
    lowStock,
    outOfStock,
    topCustomer: topCustomer
      ? {
          ...topCustomer,
          spend: Number(topCustomer.spend.toFixed(2)),
        }
      : null,
  };

  // Analytics are advisory/admin-only; a short TTL avoids repeated expensive
  // aggregate reads while keeping the dashboard fresh. Admin cache-clear
  // actions invalidate this immediately when needed.
  cache.set(cacheKey, result, 15_000);
  return result;
}
