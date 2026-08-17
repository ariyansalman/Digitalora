/** Pure/admin presentation helpers. Keep database and business logic out of this module. */
import type { DBOrder, DBUser, DBSupplierApiSource } from '../../types.js';
import type { SupplierCatalogProduct } from '../../services/supplierApi.js';
import { date as fmtDate, money as fmtMoney, userLabel as fmtUserLabel } from '../../ui/format.js';

/**
 * Thin aliases over the centralized formatters in `src/ui/format.ts`.
 * Kept exported under their original names so every existing admin call
 * site (and its tests) keeps working unchanged.
 */
export function apiMoney(n: number): string {
  return fmtMoney(n);
}

export function apiDate(iso: string | null): string {
  return fmtDate(iso);
}

export function apiUserLabel(user: {
  userId: number;
  username: string | null;
  firstName: string | null;
}): string {
  return fmtUserLabel(user);
}

export function supplierProductFilter(
  products: SupplierCatalogProduct[],
  mode: 'all' | 'stock',
): SupplierCatalogProduct[] {
  if (mode === 'stock') {
    return products.filter((p) => p.stock === null || p.stock > 0);
  }
  return products;
}

export function supplierStockLabel(product: SupplierCatalogProduct): string {
  return product.stock === null ? 'stock ?' : `stock ${product.stock}`;
}

export function supplierImportActive(source: DBSupplierApiSource): boolean {
  return Boolean(source.auto_import_active);
}

export function supplierImportCategory(source: DBSupplierApiSource): string {
  return source.import_category_name || `Supplier - ${source.name}`;
}

export function supplierImportUsesGroupCategory(source: DBSupplierApiSource): boolean {
  return /\b(all|plans?|subscription|bundle|variants?|section)\b/i.test(supplierImportCategory(source));
}

export function supplierGroupCategoryName(source: DBSupplierApiSource): string {
  const current = supplierImportCategory(source)
    .replace(/\s+(all\s+plans|plans?|all|subscription|bundle|variants?|section)\s*$/i, '')
    .trim();
  return `${current || source.name} All Plans`;
}

export function buyerHandle(u: DBUser | null, fallback_id: number): string {
  if (!u) return `id ${fallback_id}`;
  if (u.username) return `@${u.username}`;
  if (u.first_name) return u.first_name;
  return `id ${u.telegram_id}`;
}

export function isPendingPreorderOrder(order: DBOrder): boolean {
  return (
    order.status === 'paid' &&
    typeof order.delivered_items === 'string' &&
    order.delivered_items.startsWith('Preorder pending')
  );
}
