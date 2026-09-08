export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const kmh = (ms: number) => ms * 3.6;
export const ms = (kmh: number) => kmh / 3.6;

/** Seconds since midnight → "HH:MM" or "HH:MM:SS". */
export function fmtTime(t: number, seconds = false): string {
  t = Math.max(0, Math.floor(t));
  const h = Math.floor(t / 3600) % 24;
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return seconds ? `${p(h)}:${p(m)}:${p(s)}` : `${p(h)}:${p(m)}`;
}

/** "HH:MM" → seconds since midnight. */
export function parseTime(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 3600 + m * 60;
}

export const fmtKm = (km: number) => km.toFixed(3);

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

let _id = 0;
export const uid = (prefix = "id") => `${prefix}${++_id}`;
