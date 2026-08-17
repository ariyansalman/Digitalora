export type CurrencyCode =
  | 'USDT'
  | 'USD'
  | 'PKR'
  | 'INR'
  | 'BDT'
  | 'AED'
  | 'SAR'
  | 'TRY'
  | 'IDR'
  | 'PHP'
  | 'VND'
  | 'THB'
  | 'MYR'
  | 'SGD'
  | 'EUR'
  | 'GBP'
  | 'CAD'
  | 'AUD'
  | 'NGN'
  | 'EGP';

export type CurrencySpec = {
  code: CurrencyCode;
  label: string;
  symbol: string;
  ratePerUsdt: number;
  decimals: number;
};

export const CURRENCIES: CurrencySpec[] = [
  { code: 'USDT', label: 'USDT', symbol: '', ratePerUsdt: 1, decimals: 2 },
  { code: 'USD', label: 'United States Dollar', symbol: '$', ratePerUsdt: 1, decimals: 2 },
  { code: 'PKR', label: 'Pakistani Rupee', symbol: 'Rs ', ratePerUsdt: 278, decimals: 0 },
  { code: 'INR', label: 'Indian Rupee', symbol: '₹', ratePerUsdt: 84, decimals: 0 },
  { code: 'BDT', label: 'Bangladeshi Taka', symbol: '৳', ratePerUsdt: 122, decimals: 0 },
  { code: 'AED', label: 'UAE Dirham', symbol: 'د.إ ', ratePerUsdt: 3.67, decimals: 2 },
  { code: 'SAR', label: 'Saudi Riyal', symbol: '﷼ ', ratePerUsdt: 3.75, decimals: 2 },
  { code: 'TRY', label: 'Turkish Lira', symbol: '₺', ratePerUsdt: 32.3, decimals: 2 },
  { code: 'IDR', label: 'Indonesian Rupiah', symbol: 'Rp ', ratePerUsdt: 16200, decimals: 0 },
  { code: 'PHP', label: 'Philippine Peso', symbol: '₱', ratePerUsdt: 58, decimals: 0 },
  { code: 'VND', label: 'Vietnamese Dong', symbol: '₫', ratePerUsdt: 25400, decimals: 0 },
  { code: 'THB', label: 'Thai Baht', symbol: '฿', ratePerUsdt: 36.5, decimals: 2 },
  { code: 'MYR', label: 'Malaysian Ringgit', symbol: 'RM ', ratePerUsdt: 4.7, decimals: 2 },
  { code: 'SGD', label: 'Singapore Dollar', symbol: 'S$ ', ratePerUsdt: 1.35, decimals: 2 },
  { code: 'EUR', label: 'Euro', symbol: '€', ratePerUsdt: 0.92, decimals: 2 },
  { code: 'GBP', label: 'British Pound', symbol: '£', ratePerUsdt: 0.78, decimals: 2 },
  { code: 'CAD', label: 'Canadian Dollar', symbol: 'C$ ', ratePerUsdt: 1.37, decimals: 2 },
  { code: 'AUD', label: 'Australian Dollar', symbol: 'A$ ', ratePerUsdt: 1.52, decimals: 2 },
  { code: 'NGN', label: 'Nigerian Naira', symbol: '₦', ratePerUsdt: 1500, decimals: 0 },
  { code: 'EGP', label: 'Egyptian Pound', symbol: 'E£ ', ratePerUsdt: 48, decimals: 0 },
];

const byCode = new Map(CURRENCIES.map((c) => [c.code, c]));

export function normalizeCurrency(code: string | null | undefined): CurrencyCode {
  const upper = String(code ?? 'USDT').trim().toUpperCase();
  return byCode.has(upper as CurrencyCode) ? (upper as CurrencyCode) : 'USDT';
}

export function getCurrency(code: string | null | undefined): CurrencySpec {
  return byCode.get(normalizeCurrency(code)) ?? CURRENCIES[0]!;
}

function compactNumber(value: number, decimals: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

function displayCurrencyCode(code: CurrencyCode): string {
  if (code === 'USDT') return 'USDT';
  return code.charAt(0) + code.slice(1).toLowerCase();
}

export function formatUsdt(amount: number): string {
  return `${compactNumber(Number(amount), 2)}USDT`;
}

export function formatCurrencyOnly(amountUsdt: number, code: string | null | undefined): string {
  const currency = getCurrency(code);
  if (currency.code === 'USDT') return formatUsdt(amountUsdt);
  return `${compactNumber(amountUsdt * currency.ratePerUsdt, currency.decimals)}${displayCurrencyCode(currency.code)}`;
}

export function formatPriceWithCurrency(
  amountUsdt: number,
  code: string | null | undefined,
): string {
  const currency = getCurrency(code);
  if (currency.code === 'USDT') return formatUsdt(amountUsdt);
  return `${formatCurrencyOnly(amountUsdt, currency.code)} / ${formatUsdt(amountUsdt)}`;
}
