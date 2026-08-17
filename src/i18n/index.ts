/**
 * Tiny i18n helper. Resolution order:
 *   1. Admin override from settings table (`text.<key>`)
 *   2. Locale string from config/locales/<lang>.ts
 *   3. English fallback
 *   4. The raw key (so missing strings are visible)
 *
 * Strings can use `{placeholder}` style interpolation.
 */
import { LOCALES, type Lang } from '../../config/index.js';
import { getTextOverride } from '../services/settings.js';

export function t(
  lang: Lang,
  key: string,
  vars: Record<string, string | number> = {},
): string {
  const override = getTextOverride(key);
  const tpl = override ?? LOCALES[lang]?.[key] ?? LOCALES.en[key] ?? key;
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}
