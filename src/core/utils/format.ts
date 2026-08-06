export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000) return `${Math.round(n)}`;
  if (abs < 1_000_000) {
    const v = n / 1000;
    return `${v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')}K`;
  }
  if (abs < 1_000_000_000) {
    const v = n / 1_000_000;
    return `${v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')}M`;
  }
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

export function withCommas(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a));

export function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function uid(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
