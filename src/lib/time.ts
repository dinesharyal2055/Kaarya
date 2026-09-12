const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function nepalWall(ms: number): Date {
  return new Date(ms + NEPAL_OFFSET_MS);
}

export function parseServerTime(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const s = String(value).trim();
  if (/(z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? Date.now() : ms;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?/);
  if (m) {
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]) || 0);
  }
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? Date.now() : ms;
}

export function nepalDateKey(ms: number): string {
  const w = nepalWall(ms);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
}

export function nepalTodayKey(): string {
  return nepalDateKey(Date.now());
}

export function nepalHour(ms: number): number {
  return nepalWall(ms).getUTCHours();
}

export function formatNepalShort(ms: number): string {
  const w = nepalWall(ms);
  return `${MONTHS_SHORT[w.getUTCMonth()]} ${w.getUTCDate()}`;
}

export function formatNepalMedium(ms: number): string {
  const w = nepalWall(ms);
  return `${MONTHS_SHORT[w.getUTCMonth()]} ${w.getUTCDate()}, ${w.getUTCFullYear()}`;
}

export function formatNepalLong(ms: number): string {
  const w = nepalWall(ms);
  return `${MONTHS_LONG[w.getUTCMonth()]} ${w.getUTCDate()}, ${w.getUTCFullYear()}`;
}

export function formatNepalTime(ms: number): string {
  const w = nepalWall(ms);
  const rawHours = w.getUTCHours();
  const period = rawHours >= 12 ? 'PM' : 'AM';
  const hours = rawHours % 12 || 12;
  return `${pad(hours)}:${pad(w.getUTCMinutes())} ${period}`;
}