import {
  addProduct,
  getProduct,
  getOrCreateCategory,
  getSupplierApiSource,
  getSupplierProductLinkBySupplierProduct,
  getSupplierProductLinkByProduct,
  recordSupplierOrderLog,
  setProductActive,
  updateProduct,
  updateSupplierApiSource,
  updateSupplierProductLink,
  upsertSupplierProductLink,
} from '../db/queries.js';
import { logger } from '../logger.js';
import type {
  DBSupplierApiSource,
  DBSupplierProductLink,
  SupplierAuthMode,
  SupplierOrderMethod,
} from '../types.js';

const DEFAULT_TIMEOUT_MS = 20_000;

export type SupplierCatalogProduct = {
  id: string;
  name: string;
  price: number | null;
  stock: number | null;
  raw: Record<string, unknown>;
};

export type SupplierImportResult = {
  localProductId: number;
  created: boolean;
  link: DBSupplierProductLink;
};

export type SupplierConnectionTest = {
  ok: boolean;
  balance: number | null;
  productsSeen: number;
  sampleProducts: SupplierCatalogProduct[];
  error: string | null;
};

export type SupplierOrderResult = {
  ok: boolean;
  items: string[];
  status: string | null;
  error: string | null;
  raw: Record<string, unknown>;
};

export type SupplierAutoOrderFailure = {
  supplierId: number;
  supplierName: string;
  supplierProductId: string;
  error: string;
  lowBalance: boolean;
};

export type SupplierSourceConfig = {
  name: string;
  base_url: string;
  api_key?: string;
  auth_mode?: SupplierAuthMode;
  key_header?: string;
  key_query_param?: string;
  products_path?: string;
  balance_path?: string;
  order_path?: string;
  order_method?: SupplierOrderMethod;
  balance_json_path?: string;
  products_json_path?: string;
  product_id_json_path?: string;
  product_name_json_path?: string;
  product_price_json_path?: string;
  product_stock_json_path?: string;
  order_items_json_path?: string;
  order_status_json_path?: string;
  order_request_template?: Record<string, unknown>;
  auto_import_new_products?: boolean;
  auto_import_active?: boolean;
  import_category_name?: string | null;
  markup_percent?: number;
  fixed_markup?: number;
  low_balance_threshold?: number;
  notes?: string | null;
};

export type SupplierLinkConfig = {
  local_product_id: number;
  supplier_id: number;
  supplier_product_id: string;
  supplier_product_name?: string | null;
  supplier_cost?: number | null;
  supplier_stock?: number | null;
  auto_order?: boolean;
  auto_sync_stock?: boolean;
  fallback_manual?: boolean;
};

export class SupplierApiError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function canbosoSupplierConfig(apiKey: string): SupplierSourceConfig {
  return {
    name: 'Canboso',
    base_url: 'https://canboso.com',
    api_key: apiKey.trim(),
    auth_mode: 'query',
    key_query_param: 'key',
    products_path: '/api/v2/telegram-buyer/products',
    balance_path: '/api/v2/telegram-buyer/balance',
    order_path: '/api/v2/telegram-buyer/purchase',
    order_method: 'POST',
    products_json_path: 'products',
    balance_json_path: 'balanceUsd',
    product_id_json_path: '_id',
    product_name_json_path: 'product_name',
    product_price_json_path: 'usdPricing',
    product_stock_json_path: 'stats.available',
    order_items_json_path: 'deliveredAccounts',
    order_status_json_path: 'success',
    order_request_template: {
      key: '{{api_key}}',
      product_id: '{{supplier_product_id}}',
      quantity: '{{qty}}',
    },
    markup_percent: 25,
    fixed_markup: 0,
    low_balance_threshold: 5,
    auto_import_new_products: false,
    auto_import_active: false,
    import_category_name: 'Canboso Supplier',
    notes: 'One-click Canboso v2 telegram-buyer supplier connector.',
  };
}

export function supabaseResellerSupplierConfig(apiKey: string): SupplierSourceConfig {
  return {
    name: 'Digitalora Reseller API',
    base_url: 'https://eygkdpfjrjwwbiackfpr.supabase.co/functions/v1/reseller-api',
    api_key: apiKey.trim(),
    auth_mode: 'bearer',
    products_path: '?action=products',
    balance_path: '?action=balance',
    order_path: '?action=order',
    order_method: 'POST',
    products_json_path: 'products',
    balance_json_path: 'reseller.balance',
    product_id_json_path: 'id',
    product_name_json_path: 'name',
    product_price_json_path: 'wholesale_price',
    product_stock_json_path: 'stock',
    order_items_json_path: 'order.items',
    order_status_json_path: 'ok',
    order_request_template: {
      product_id: '{{supplier_product_id}}',
      quantity: '{{qty}}',
      external_order_id: '{{request_id}}',
    },
    markup_percent: 25,
    fixed_markup: 0,
    low_balance_threshold: 5,
    auto_import_new_products: false,
    auto_import_active: false,
    import_category_name: 'Digitalora Reseller Products',
    notes: 'One-click Bearer-token supplier connector for Supabase reseller-api?action endpoints.',
  };
}

export function vexResellerSupplierConfig(apiKey: string): SupplierSourceConfig {
  return {
    name: 'VEX Reseller API',
    base_url: 'https://eismrrkygprctnwxmkbw.supabase.co/functions/v1/reseller-api',
    api_key: apiKey.trim(),
    auth_mode: 'bearer',
    products_path: '?action=products',
    balance_path: '?action=balance',
    order_path: '?action=order',
    order_method: 'POST',
    products_json_path: 'products',
    balance_json_path: 'balance',
    product_id_json_path: 'id',
    product_name_json_path: 'name',
    product_price_json_path: 'price',
    product_stock_json_path: 'stock',
    order_items_json_path: 'data',
    order_status_json_path: 'status',
    order_request_template: {
      product_id: '{{supplier_product_id}}',
      quantity: '{{qty}}',
      external_order_id: '{{request_id}}',
    },
    markup_percent: 25,
    fixed_markup: 0,
    low_balance_threshold: 5,
    auto_import_new_products: false,
    auto_import_active: false,
    import_category_name: 'VEX Reseller Products',
    notes: 'One-click VEX supplier connector for Supabase reseller-api?action endpoints.',
  };
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[$,\s]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBoolean(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    if (/^(true|yes|on|1)$/i.test(v.trim())) return true;
    if (/^(false|no|off|0)$/i.test(v.trim())) return false;
  }
  return fallback;
}

function cleanPath(path: string | null | undefined, fallback: string): string {
  const s = (path ?? '').trim();
  return s.length > 0 ? s : fallback;
}

function joinUrl(base: string, path: string): URL {
  const cleanBase = base.trim().replace(/\/+$/, '');
  const cleanSuffix = path.trim().replace(/^\/+/, '');
  if (cleanSuffix.startsWith('?') || cleanSuffix.startsWith('#')) {
    return new URL(`${cleanBase}${cleanSuffix}`);
  }
  return new URL(cleanSuffix ? `${cleanBase}/${cleanSuffix}` : cleanBase);
}

function deepGet(obj: unknown, path: string | null | undefined): unknown {
  const clean = (path ?? '').trim();
  if (!clean || clean === '$' || clean === '.') return obj;
  const parts = clean
    .replace(/^\$\.?/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((p) => p.trim())
    .filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return undefined;
      cur = cur[idx];
      continue;
    }
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function firstValue(obj: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = deepGet(obj, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function supplierResponseError(json: Record<string, unknown>, status: string | null): string {
  return (
    asString(
      firstValue(json, [
        'error',
        'message',
        'reason',
        'details',
        'data.error',
        'data.message',
        'data.reason',
        'response.error',
        'response.message',
      ]),
    ) ??
    (status ? `Supplier status: ${status}` : 'Supplier rejected the order')
  );
}

export function isSupplierLowBalanceMessage(message: string): boolean {
  return /balance|insufficient|not enough|low fund|wallet|credit|recharge|top[\s-]?up/i.test(message);
}

function replaceTemplate(value: unknown, vars: Record<string, string | number>): unknown {
  if (typeof value === 'string') {
    // Preserve the original variable type when the whole field is one
    // placeholder. Supplier schemas commonly require quantity/order_id
    // as JSON numbers, not numeric strings.
    const exact = value.match(/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/);
    if (exact) return vars[exact[1]!] ?? '';
    return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) =>
      String(vars[key] ?? ''),
    );
  }
  if (Array.isArray(value)) return value.map((item) => replaceTemplate(item, vars));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = replaceTemplate(val, vars);
    }
    return out;
  }
  return value;
}

function authHeaders(source: DBSupplierApiSource): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
  };
  const key = source.api_key.trim();
  if (!key) return headers;
  if (source.auth_mode === 'bearer') headers.authorization = `Bearer ${key}`;
  if (source.auth_mode === 'x-api-key') headers[source.key_header || 'x-api-key'] = key;
  return headers;
}

async function supplierFetch(
  source: DBSupplierApiSource,
  path: string,
  method: SupplierOrderMethod = 'GET',
  payload?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Promise<unknown> {
  const url = joinUrl(source.base_url, path);
  if (source.auth_mode === 'query' && source.api_key.trim()) {
    url.searchParams.set(source.key_query_param || 'api_key', source.api_key.trim());
  }
  if (method === 'GET' && payload) {
    for (const [key, val] of Object.entries(payload)) {
      if (val !== undefined && val !== null) url.searchParams.set(key, String(val));
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: { ...authHeaders(source), ...extraHeaders },
      body: method === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
      signal: controller.signal,
    });
    const bodyText = await res.text();
    let json: unknown = {};
    try {
      json = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      json = { raw: bodyText.slice(0, 1000) };
    }
    if (!res.ok) {
      const sample = bodyText.replace(/\s+/g, ' ').slice(0, 300);
      throw new SupplierApiError(`HTTP ${res.status} from ${url.hostname}: ${sample || res.statusText}`);
    }
    return json;
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new SupplierApiError(`Timeout after ${Math.round(DEFAULT_TIMEOUT_MS / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeCatalogProduct(
  source: DBSupplierApiSource,
  raw: unknown,
): SupplierCatalogProduct | null {
  const row = asRecord(raw);
  const id = asString(
    firstValue(row, [
      source.product_id_json_path,
      'product_id',
      'id',
      'pid',
      'service_id',
      'sku',
    ]),
  );
  if (!id) return null;
  const name =
    asString(
      firstValue(row, [
        source.product_name_json_path,
        'product_name',
        'name',
        'title',
        'service',
      ]),
    ) ?? id;
  const price = asNumber(
    firstValue(row, [
      source.product_price_json_path,
      'price',
      'wholesale_price',
      'cost',
      'rate',
      'amount',
    ]),
  );
  const stock = asNumber(
    firstValue(row, [
      source.product_stock_json_path,
      'stock',
      'quantity',
      'qty',
      'available',
      'count',
    ]),
  );
  return {
    id,
    name,
    price,
    stock: stock === null ? null : Math.max(0, Math.floor(stock)),
    raw: row,
  };
}

export async function fetchSupplierBalance(
  source: DBSupplierApiSource,
): Promise<number | null> {
  const json = await supplierFetch(source, cleanPath(source.balance_path, '/balance'));
  return asNumber(
    firstValue(json, [
      source.balance_json_path,
      'balance',
      'api_balance',
      'reseller.balance',
      'reseller.api_balance',
      'wallet.balance',
      'data.balance',
      'data.api_balance',
    ]),
  );
}

export async function fetchSupplierProducts(
  source: DBSupplierApiSource,
): Promise<SupplierCatalogProduct[]> {
  const json = await supplierFetch(source, cleanPath(source.products_path, '/products'));
  const rawProducts =
    deepGet(json, source.products_json_path) ??
    deepGet(json, 'products') ??
    deepGet(json, 'data.products') ??
    deepGet(json, 'data') ??
    json;
  const arr = Array.isArray(rawProducts) ? rawProducts : [];
  return arr
    .map((p) => normalizeCatalogProduct(source, p))
    .filter((p): p is SupplierCatalogProduct => p !== null);
}

export function supplierSellPrice(
  source: DBSupplierApiSource,
  product: SupplierCatalogProduct,
): number {
  const base = Number(product.price ?? 0);
  return Number(
    (base * (1 + Number(source.markup_percent) / 100) + Number(source.fixed_markup)).toFixed(3),
  );
}

export async function importSupplierProduct(args: {
  source: DBSupplierApiSource;
  product: SupplierCatalogProduct;
  active?: boolean;
  categoryName?: string;
}): Promise<SupplierImportResult> {
  const existing = await getSupplierProductLinkBySupplierProduct(
    args.source.id,
    args.product.id,
  ).catch((err) => {
    if (isSupplierMigrationError(err)) throw err;
    logger.warn({ err, supplierId: args.source.id, productId: args.product.id }, 'supplier import lookup failed');
    return null;
  });
  if (existing) {
    const product = await getProduct(existing.local_product_id);
    if (product) {
      return { localProductId: product.id, created: false, link: existing };
    }
  }

  const category = await getOrCreateCategory(
    args.categoryName ?? args.source.import_category_name ?? `Supplier - ${args.source.name}`,
    '🔌',
  );
  const stock = args.product.stock ?? 0;
  const description =
    asString(firstValue(args.product.raw, ['description', 'description_raw', 'note'])) ??
    `Supplier product from ${args.source.name}.`;
  const local = await addProduct({
    category_id: category.id,
    name: args.product.name,
    price: supplierSellPrice(args.source, args.product),
    stock,
    warranty: 'Supplier auto delivery',
    description,
    emoji: '',
    unlimited_stock: false,
  });
  if (args.active === false || (args.active === undefined && args.source.auto_import_active === false)) {
    await setProductActive(local.id, false);
  }
  const link = await upsertSupplierProductLink({
    local_product_id: local.id,
    supplier_id: args.source.id,
    supplier_product_id: args.product.id,
    supplier_product_name: args.product.name,
    supplier_cost: args.product.price,
    supplier_stock: args.product.stock,
    auto_order: true,
    auto_sync_stock: true,
    fallback_manual: true,
  });
  return { localProductId: local.id, created: true, link };
}

export async function testSupplierConnection(
  source: DBSupplierApiSource,
): Promise<SupplierConnectionTest> {
  const balanceResult = await fetchSupplierBalance(source).then(
    (balance) => ({ ok: true as const, balance }),
    (err: unknown) => ({ ok: false as const, error: err }),
  );
  const productsResult = await fetchSupplierProducts(source).then(
    (products) => ({ ok: true as const, products }),
    (err: unknown) => ({ ok: false as const, error: err }),
  );
  const errors: string[] = [];
  if (!balanceResult.ok) errors.push(`balance: ${errorMessage(balanceResult.error)}`);
  if (!productsResult.ok) errors.push(`products: ${errorMessage(productsResult.error)}`);
  const products = productsResult.ok ? productsResult.products : [];
  const balance = balanceResult.ok ? balanceResult.balance : null;
  const out: SupplierConnectionTest = {
    ok: errors.length === 0,
    balance,
    productsSeen: products.length,
    sampleProducts: products.slice(0, 5),
    error: errors.length > 0 ? errors.join(' | ') : null,
  };
  await updateSupplierApiSource(source.id, {
    last_balance: balance,
    last_sync_at: new Date().toISOString(),
    last_error: out.error,
  });
  return out;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const HIDDEN_DELIVERY_KEY_RX =
  /^(?:product[_-]?item[_-]?id|delivered[_-]?at|created[_-]?at|updated[_-]?at)$/i;

function sanitizeDeliveryString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return sanitizeDeliveryValue(JSON.parse(trimmed));
    } catch {
      // Keep treating it as a normal supplier payload.
    }
  }
  return trimmed
    .split(/\r?\n/)
    .filter((line) => {
      const key = line.split(':', 1)[0]?.trim() ?? '';
      return !HIDDEN_DELIVERY_KEY_RX.test(key);
    })
    .join('\n')
    .trim();
}

function sanitizeDeliveryValue(value: unknown): string {
  if (typeof value === 'string') return sanitizeDeliveryString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const row = asRecord(value);
  const direct = asString(firstValue(row, ['payload', 'item', 'code', 'link', 'account']));
  if (direct) return sanitizeDeliveryString(direct);
  return Object.entries(row)
    .filter(([key, item]) => {
      if (item === null || item === undefined || item === '') return false;
      return !HIDDEN_DELIVERY_KEY_RX.test(key.replace(/\s+/g, '_'));
    })
    .map(([key, item]) => `${key}: ${typeof item === 'object' ? JSON.stringify(item) : String(item)}`)
    .join('\n')
    .trim();
}

function normalizeItems(source: DBSupplierApiSource, json: Record<string, unknown>): string[] {
  // Try multiple common paths for order items
  const paths = [
    source.order_items_json_path,
    'items',
    'data.items',
    'order.items',
    'order.delivery',
    'delivery',
    'data.delivery',
    'result.items',
    'result.delivery',
    'data.data',
    'data',
    'codes',
    'accounts',
    'credentials',
    'code',
    'account',
  ];
  
  let raw: unknown = undefined;
  for (const path of paths) {
    raw = deepGet(json, path);
    if (raw !== undefined && raw !== null) break;
  }
  
  // If raw is a string, split by newlines to get multiple items
  if (typeof raw === 'string') {
    const lines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length > 1) {
      return lines
        .map(line => sanitizeDeliveryString(line))
        .filter(s => s.length > 0);
    }
    const clean = sanitizeDeliveryString(raw);
    return clean ? [clean] : [];
  }
  
  // If raw is an array, process each item
  if (Array.isArray(raw)) {
    return raw
      .map(item => {
        // If item is a string, sanitize it
        if (typeof item === 'string') {
          const lines = item.split(/\r?\n/);
          return lines.map(line => sanitizeDeliveryString(line)).filter(s => s.length > 0);
        }
        // If item is an object, try to extract the value
        return [sanitizeDeliveryValue(item)].filter(s => s.length > 0);
      })
      .flat()
      .filter(s => s.length > 0);
  }
  
  // If raw is an object, sanitize it
  if (raw && typeof raw === 'object') {
    return [sanitizeDeliveryValue(raw)].filter(s => s.length > 0);
  }
  
  return [];
}

/**
 * Strip the supplier API key out of an order payload before it is
 * persisted to `supplier_order_logs`. Matches both well-known
 * credential field names and any value equal to the live key.
 */
function redactSupplierSecrets(
  payload: Record<string, unknown>,
  apiKey: string,
): Record<string, unknown> {
  const secretKeys = new Set(['key', 'api_key', 'apikey', 'token', 'secret', 'authorization']);
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(payload)) {
    const isSecretField = secretKeys.has(field.toLowerCase());
    const isSecretValue = apiKey.length > 0 && value === apiKey;
    out[field] = isSecretField || isSecretValue ? '***' : value;
  }
  return out;
}

export async function placeSupplierOrder(args: {
  source: DBSupplierApiSource;
  link: DBSupplierProductLink;
  qty: number;
  localOrderId: number;
  requestId?: string;
}): Promise<SupplierOrderResult> {
  const requestId = args.requestId ?? `ord_${args.localOrderId}_${Date.now()}`;
  const vars = {
    api_key: args.source.api_key.trim(),
    supplier_product_id: args.link.supplier_product_id,
    local_product_id: args.link.local_product_id,
    qty: args.qty,
    quantity: args.qty,
    order_id: args.localOrderId,
    request_id: requestId,
  };
  const payload = asRecord(replaceTemplate(args.source.order_request_template, vars));
  // Order templates may inject the supplier credential into the body
  // (e.g. Canboso's `key`). Never persist it in the order log.
  const loggedPayload = redactSupplierSecrets(payload, args.source.api_key.trim());
  try {
    const rawJson = await supplierFetch(
      args.source,
      cleanPath(args.source.order_path, '/order'),
      args.source.order_method,
      payload,
      { 'Idempotency-Key': requestId },
    );
    const json = asRecord(rawJson);
    const statusValue =
      firstValue(json, [
        args.source.order_status_json_path,
        'status',
        'data.status',
        'success',
        'ok',
      ]);
    const status =
      asString(
        statusValue,
      ) ?? null;
    const failed =
      statusValue === false ||
      statusValue === 0 ||
      (status ? /^(false|0)$|fail|error|reject|cancel/i.test(status) : false);
    const items = normalizeItems(args.source, json);
    const error = failed ? supplierResponseError(json, status) : null;
    
    // Log order result for debugging
    logger.info({ 
      supplierName: args.source.name,
      localOrderId: args.localOrderId,
      requestedQty: args.qty,
      receivedItems: items.length,
      itemsPreview: items.slice(0, 5),
      status,
      ok: !failed,
      rawJsonKeys: Object.keys(json),
      rawJsonString: JSON.stringify(json).slice(0, 1000)
    }, 'placeSupplierOrder result');
    
    await recordSupplierOrderLog({
      supplier_id: args.source.id,
      local_order_id: args.localOrderId,
      local_product_id: args.link.local_product_id,
      supplier_product_id: args.link.supplier_product_id,
      status: failed ? 'failed' : 'success',
      request_payload: loggedPayload,
      response_payload: Array.isArray(rawJson) ? { data: rawJson } : json,
      error,
    });
    return { ok: !failed, items, status, error, raw: Array.isArray(rawJson) ? { data: rawJson } : json };
  } catch (err) {
    const msg = errorMessage(err);
    await recordSupplierOrderLog({
      supplier_id: args.source.id,
      local_order_id: args.localOrderId,
      local_product_id: args.link.local_product_id,
      supplier_product_id: args.link.supplier_product_id,
      status: 'failed',
      request_payload: loggedPayload,
      response_payload: {},
      error: msg,
    }).catch((logErr) => logger.warn({ err: logErr }, 'supplier order failure log failed'));
    throw err;
  }
}

export async function trySupplierAutoOrder(args: {
  localProductId: number;
  qty: number;
  localOrderId: number;
  onFailure?: (failure: SupplierAutoOrderFailure) => void | Promise<void>;
}): Promise<{ items: string[]; status: string | null; supplierName: string } | null> {
  const link = await getSupplierProductLinkByProduct(args.localProductId).catch((err) => {
    if (isSupplierMigrationError(err)) {
      logger.debug('supplier tables not migrated; normal checkout fallback remains active');
      return null;
    }
    logger.warn({ err, localProductId: args.localProductId }, 'supplier link lookup failed');
    return null;
  });
  if (!link || !link.auto_order) return null;
  const source = await getSupplierApiSource(link.supplier_id);
  if (!source || !source.enabled) return null;
  try {
    const result = await placeSupplierOrder({
      source,
      link,
      qty: args.qty,
      localOrderId: args.localOrderId,
      requestId: `order_${args.localOrderId}`,
    });
    if (!result.ok) {
      const error = result.error ?? `Supplier status: ${result.status ?? 'failed'}`;
      await updateSupplierProductLink(link.id, {
        last_error: error,
      }).catch((updateErr) => logger.warn({ err: updateErr }, 'supplier link error update failed'));
      await args.onFailure?.({
        supplierId: source.id,
        supplierName: source.name,
        supplierProductId: link.supplier_product_id,
        error,
        lowBalance: isSupplierLowBalanceMessage(error),
      });
      return null;
    }
    return { items: result.items, status: result.status, supplierName: source.name };
  } catch (err) {
    const error = errorMessage(err);
    logger.warn(
      { err, localProductId: args.localProductId, orderId: args.localOrderId, supplierId: source.id },
      'supplier auto-order failed; falling back to local/manual delivery',
    );
    await updateSupplierProductLink(link.id, {
      last_error: error,
    }).catch((updateErr) => logger.warn({ err: updateErr }, 'supplier link error update failed'));
    await args.onFailure?.({
      supplierId: source.id,
      supplierName: source.name,
      supplierProductId: link.supplier_product_id,
      error,
      lowBalance: isSupplierLowBalanceMessage(error),
    });
    return null;
  }
}

export async function syncSupplierProductLink(link: DBSupplierProductLink): Promise<{
  matched: SupplierCatalogProduct | null;
  updatedLocal: boolean;
}> {
  const source = await getSupplierApiSource(link.supplier_id);
  if (!source) throw new SupplierApiError('Supplier not found.');
  const products = await fetchSupplierProducts(source);
  const matched = products.find((p) => p.id === link.supplier_product_id) ?? null;
  if (!matched) {
    await updateSupplierProductLink(link.id, {
      last_error: 'Supplier product id not found in catalog.',
    });
    return { matched: null, updatedLocal: false };
  }
  await updateSupplierProductLink(link.id, {
    supplier_product_name: matched.name,
    supplier_cost: matched.price,
    supplier_stock: matched.stock,
    last_sync_at: new Date().toISOString(),
    last_error: null,
  });
  let updatedLocal = false;
  const local = await getProduct(link.local_product_id);
  if (local && link.auto_sync_stock && matched.stock !== null) {
    await updateProduct(link.local_product_id, { stock: matched.stock });
    updatedLocal = true;
  }
  return { matched, updatedLocal };
}

export function isSupplierMigrationError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const body = [e?.code, e?.message, e?.details, e?.hint].map(String).join(' ');
  return (
    body.includes('42P01') ||
    body.includes('42703') ||
    /supplier_(api_sources|product_links|order_logs)/i.test(body) ||
    /relation .* does not exist/i.test(body) ||
    /schema cache/i.test(body)
  );
}

export function parseSupplierSourceConfig(text: string): SupplierSourceConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SupplierApiError('Send valid JSON. Use double quotes around keys and strings.');
  }
  const cfg = asRecord(raw);
  const name = asString(cfg.name);
  const baseUrl = asString(cfg.base_url ?? cfg.baseUrl ?? cfg.endpoint);
  if (!name) throw new SupplierApiError('Missing `name`.');
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    throw new SupplierApiError('Missing `base_url` starting with http:// or https://.');
  }
  const authMode = asString(cfg.auth_mode ?? cfg.authMode) ?? 'x-api-key';
  if (!['none', 'bearer', 'x-api-key', 'query'].includes(authMode)) {
    throw new SupplierApiError('`auth_mode` must be one of: none, bearer, x-api-key, query.');
  }
  const orderMethod = (asString(cfg.order_method ?? cfg.orderMethod) ?? 'POST').toUpperCase();
  if (orderMethod !== 'GET' && orderMethod !== 'POST') {
    throw new SupplierApiError('`order_method` must be GET or POST.');
  }
  return {
    name,
    base_url: baseUrl,
    api_key: asString(cfg.api_key ?? cfg.apiKey ?? cfg.key) ?? '',
    auth_mode: authMode as SupplierAuthMode,
    key_header: asString(cfg.key_header ?? cfg.keyHeader) ?? 'x-api-key',
    key_query_param: asString(cfg.key_query_param ?? cfg.keyQueryParam) ?? 'api_key',
    products_path: asString(cfg.products_path ?? cfg.productsPath) ?? '/products',
    balance_path: asString(cfg.balance_path ?? cfg.balancePath) ?? '/balance',
    order_path: asString(cfg.order_path ?? cfg.orderPath) ?? '/order',
    order_method: orderMethod as SupplierOrderMethod,
    balance_json_path: asString(cfg.balance_json_path ?? cfg.balanceJsonPath) ?? 'balance',
    products_json_path: asString(cfg.products_json_path ?? cfg.productsJsonPath) ?? 'products',
    product_id_json_path: asString(cfg.product_id_json_path ?? cfg.productIdJsonPath) ?? 'id',
    product_name_json_path: asString(cfg.product_name_json_path ?? cfg.productNameJsonPath) ?? 'name',
    product_price_json_path: asString(cfg.product_price_json_path ?? cfg.productPriceJsonPath) ?? 'price',
    product_stock_json_path: asString(cfg.product_stock_json_path ?? cfg.productStockJsonPath) ?? 'stock',
    order_items_json_path: asString(cfg.order_items_json_path ?? cfg.orderItemsJsonPath) ?? 'items',
    order_status_json_path: asString(cfg.order_status_json_path ?? cfg.orderStatusJsonPath) ?? 'status',
    order_request_template: asRecord(
      cfg.order_request_template ??
        cfg.orderRequestTemplate ?? {
          product_id: '{{supplier_product_id}}',
          quantity: '{{qty}}',
          request_id: '{{request_id}}',
        },
    ),
    auto_import_new_products: asBoolean(cfg.auto_import_new_products ?? cfg.autoImportNewProducts, false),
    auto_import_active: asBoolean(cfg.auto_import_active ?? cfg.autoImportActive, false),
    import_category_name: asString(cfg.import_category_name ?? cfg.importCategoryName),
    markup_percent: asNumber(cfg.markup_percent ?? cfg.markupPercent) ?? 25,
    fixed_markup: asNumber(cfg.fixed_markup ?? cfg.fixedMarkup) ?? 0,
    low_balance_threshold: asNumber(cfg.low_balance_threshold ?? cfg.lowBalanceThreshold) ?? 5,
    notes: asString(cfg.notes),
  };
}

export function parseSupplierLinkConfig(
  text: string,
  fallbackSupplierId?: number,
): SupplierLinkConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SupplierApiError('Send valid JSON. Use double quotes around keys and strings.');
  }
  const cfg = asRecord(raw);
  const localProductId = asNumber(cfg.local_product_id ?? cfg.localProductId ?? cfg.product_id);
  const supplierId = asNumber(cfg.supplier_id ?? cfg.supplierId) ?? fallbackSupplierId ?? null;
  const supplierProductId = asString(cfg.supplier_product_id ?? cfg.supplierProductId ?? cfg.id);
  if (!localProductId || !Number.isInteger(localProductId) || localProductId <= 0) {
    throw new SupplierApiError('Missing valid `local_product_id`.');
  }
  if (!supplierId || !Number.isInteger(supplierId) || supplierId <= 0) {
    throw new SupplierApiError('Missing valid `supplier_id`.');
  }
  if (!supplierProductId) throw new SupplierApiError('Missing `supplier_product_id`.');
  return {
    local_product_id: localProductId,
    supplier_id: supplierId,
    supplier_product_id: supplierProductId,
    supplier_product_name: asString(cfg.supplier_product_name ?? cfg.supplierProductName),
    supplier_cost: asNumber(cfg.supplier_cost ?? cfg.supplierCost),
    supplier_stock: asNumber(cfg.supplier_stock ?? cfg.supplierStock),
    auto_order: asBoolean(cfg.auto_order, true),
    auto_sync_stock: asBoolean(cfg.auto_sync_stock, true),
    fallback_manual: asBoolean(cfg.fallback_manual, true),
  };
}
