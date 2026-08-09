/** Display formatting — pure, shared by app and sim. */

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'] as const;

/** 1234 → "$1.2K"; small amounts stay whole dollars. */
export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1000) return `${sign}$${Math.floor(abs)}`;
  let value = abs;
  let tier = 0;
  while (value >= 1000 && tier < SUFFIXES.length - 1) {
    value /= 1000;
    tier++;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  // 1.50 → 1.5 · 12.30 → 12.3 · 100.00 → 100
  const rounded = parseFloat(value.toFixed(digits)).toString();
  return `${sign}$${rounded}${SUFFIXES[tier]}`;
}

/** 1234 → "1.2K" (no currency symbol). */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1000) return `${sign}${Math.floor(abs)}`;
  let value = abs;
  let tier = 0;
  while (value >= 1000 && tier < SUFFIXES.length - 1) {
    value /= 1000;
    tier++;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  const rounded = parseFloat(value.toFixed(digits)).toString();
  return `${sign}${rounded}${SUFFIXES[tier]}`;
}

/** 3725 → "1h 2m"; 90 → "1m 30s"; 45 → "45s". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
