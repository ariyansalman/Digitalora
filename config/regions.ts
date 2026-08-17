/**
 * Region picker — list of countries shown on the profile "Region"
 * button. We focus on countries with the highest Telegram user base
 * plus a "More…" search-like fallback for everything else.
 *
 * Each entry maps to an IANA timezone so the bot can render local
 * times for the user (e.g., "Joined: 25 Apr 2026, 10:23 PKT").
 *
 * Order matches Telegram penetration / market share (rough public
 * data, 2024); feel free to re-order.
 */
export type Region = {
  code: string; // Two-letter ISO country code (used as cache/DB key)
  flag: string; // Unicode flag emoji
  name: string; // Display name
  timezone: string; // IANA timezone (e.g. 'Asia/Karachi')
};

export const POPULAR_REGIONS: Region[] = [
  { code: 'IN', flag: '🇮🇳', name: 'India', timezone: 'Asia/Kolkata' },
  { code: 'RU', flag: '🇷🇺', name: 'Russia', timezone: 'Europe/Moscow' },
  { code: 'ID', flag: '🇮🇩', name: 'Indonesia', timezone: 'Asia/Jakarta' },
  { code: 'US', flag: '🇺🇸', name: 'United States', timezone: 'America/New_York' },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil', timezone: 'America/Sao_Paulo' },
  { code: 'IR', flag: '🇮🇷', name: 'Iran', timezone: 'Asia/Tehran' },
  { code: 'UZ', flag: '🇺🇿', name: 'Uzbekistan', timezone: 'Asia/Tashkent' },
  { code: 'EG', flag: '🇪🇬', name: 'Egypt', timezone: 'Africa/Cairo' },
  { code: 'PK', flag: '🇵🇰', name: 'Pakistan', timezone: 'Asia/Karachi' },
  { code: 'BD', flag: '🇧🇩', name: 'Bangladesh', timezone: 'Asia/Dhaka' },
  { code: 'TR', flag: '🇹🇷', name: 'Turkey', timezone: 'Europe/Istanbul' },
  { code: 'UA', flag: '🇺🇦', name: 'Ukraine', timezone: 'Europe/Kyiv' },
  { code: 'SA', flag: '🇸🇦', name: 'Saudi Arabia', timezone: 'Asia/Riyadh' },
  { code: 'AE', flag: '🇦🇪', name: 'UAE', timezone: 'Asia/Dubai' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany', timezone: 'Europe/Berlin' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom', timezone: 'Europe/London' },
  { code: 'FR', flag: '🇫🇷', name: 'France', timezone: 'Europe/Paris' },
  { code: 'IT', flag: '🇮🇹', name: 'Italy', timezone: 'Europe/Rome' },
  { code: 'ES', flag: '🇪🇸', name: 'Spain', timezone: 'Europe/Madrid' },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands', timezone: 'Europe/Amsterdam' },
  { code: 'PL', flag: '🇵🇱', name: 'Poland', timezone: 'Europe/Warsaw' },
  { code: 'KZ', flag: '🇰🇿', name: 'Kazakhstan', timezone: 'Asia/Almaty' },
  { code: 'TH', flag: '🇹🇭', name: 'Thailand', timezone: 'Asia/Bangkok' },
  { code: 'VN', flag: '🇻🇳', name: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh' },
  { code: 'PH', flag: '🇵🇭', name: 'Philippines', timezone: 'Asia/Manila' },
  { code: 'MY', flag: '🇲🇾', name: 'Malaysia', timezone: 'Asia/Kuala_Lumpur' },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore', timezone: 'Asia/Singapore' },
  { code: 'JP', flag: '🇯🇵', name: 'Japan', timezone: 'Asia/Tokyo' },
  { code: 'KR', flag: '🇰🇷', name: 'South Korea', timezone: 'Asia/Seoul' },
  { code: 'CN', flag: '🇨🇳', name: 'China', timezone: 'Asia/Shanghai' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada', timezone: 'America/Toronto' },
  { code: 'MX', flag: '🇲🇽', name: 'Mexico', timezone: 'America/Mexico_City' },
  { code: 'AR', flag: '🇦🇷', name: 'Argentina', timezone: 'America/Argentina/Buenos_Aires' },
  { code: 'NG', flag: '🇳🇬', name: 'Nigeria', timezone: 'Africa/Lagos' },
  { code: 'ZA', flag: '🇿🇦', name: 'South Africa', timezone: 'Africa/Johannesburg' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia', timezone: 'Australia/Sydney' },
];

/** How many regions to show per page in the picker. */
export const REGIONS_PER_PAGE = 12;

/** Look up a region descriptor by its 2-letter code. */
export function getRegion(code: string): Region | undefined {
  return POPULAR_REGIONS.find((r) => r.code === code);
}

/**
 * Format the current time in the given IANA timezone as e.g.
 * "10:23 (UTC+05:00)". Falls back to UTC if the zone is invalid.
 */
export function formatLocalTime(timezone: string): string {
  try {
    const now = new Date();
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(now);

    // Compute the offset in minutes between the timezone and UTC.
    const dtf = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    const parts = dtf.formatToParts(now);
    const off = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'UTC';
    return `${time} (${off})`;
  } catch {
    return new Date().toISOString().slice(11, 16) + ' (UTC)';
  }
}
