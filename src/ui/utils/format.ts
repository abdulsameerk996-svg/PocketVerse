/** Compact number formatting — self-contained, no app core. */

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

/** 1234 → "1.2K", 9876543 → "9.9M". Always at most 3 significant digits. */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  let tier = 0;
  let value = abs;
  while (value >= 1000 && tier < SUFFIXES.length - 1) {
    value /= 1000;
    tier++;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  const rounded = value.toFixed(digits);
  return `${n < 0 ? '-' : ''}${rounded}${SUFFIXES[tier]}`;
}

/** 1234 → "1,234". */
export function withCommas(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
