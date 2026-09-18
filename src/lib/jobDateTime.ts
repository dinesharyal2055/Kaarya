/**
 * Job date & time helpers.
 *
 * Kaarya operates in Nepal (UTC+5:45). All scheduling is expressed as an ISO
 * 8601 timestamp with the Nepal offset (e.g. `2026-09-20T10:30:00+05:45`) so the
 * user's selected local wall-clock time is preserved exactly — no UTC date
 * shifts. Wall-clock math is done on `now + 5:45` so "Today/Tomorrow" and the
 * past/future comparisons are all Nepal-relative regardless of device timezone.
 */

import { parseServerTime, formatNepalLong, formatNepalTime } from './time';

const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;
const NEPAL_OFFSET = '+05:45';

export type DatePreset = 'today' | 'tomorrow' | 'custom';

export type JobDateTimeError =
  | 'missingDate'
  | 'invalidDate'
  | 'pastDate'
  | 'invalidTime'
  | 'pastTime';

export interface JobDateTimeSelection {
  preset: DatePreset | null;
  customDateKey: string | null; // YYYY-MM-DD (Nepal) chosen from the picker
  customDateText: string; // manual typed date
  hourText: string; // 1-12
  minuteText: string; // 00-59
  period: 'AM' | 'PM';
}

export interface ScheduledBuild {
  iso: string | null;
  error: JobDateTimeError | null;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function nepalWall(ms: number): Date {
  return new Date(ms + NEPAL_OFFSET_MS);
}

function wallToKey(w: Date): string {
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
}

export function todayKeyNp(): string {
  return wallToKey(new Date(Date.now() + NEPAL_OFFSET_MS));
}

export function tomorrowKeyNp(): string {
  return wallToKey(new Date(Date.now() + NEPAL_OFFSET_MS + 86400000));
}

export function isTodayKeyNp(key: string): boolean {
  return key === todayKeyNp();
}

export function defaultSelection(): JobDateTimeSelection {
  return {
    preset: null,
    customDateKey: null,
    customDateText: '',
    hourText: '',
    minuteText: '',
    period: 'AM',
  };
}

/**
 * Accepts YYYY-MM-DD (ISO) or DD/MM/YYYY and returns an ISO date key, or null
 * when the text is not a real calendar date.
 */
export function parseDateText(text: string): string | null {
  const trimmed = text.trim();
  let m = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validKey(m[1], m[2], m[3]);
  m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return validKey(m[3], m[2], m[1]);
  return null;
}

function validKey(y: string, mo: string, d: string): string | null {
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = Date.UTC(year, month - 1, day);
  const w = new Date(check);
  if (w.getUTCFullYear() !== year || w.getUTCMonth() + 1 !== month || w.getUTCDate() !== day) {
    return null;
  }
  return `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Creates the stored ISO timestamp for a selection, applying all the same
 * validations the UI requires: a date must be present/valid and not in the
 * past; a valid 12h time must be entered; a "today" time must still be ahead
 * of the current Nepal time.
 */
export function buildScheduledIso(sel: JobDateTimeSelection): ScheduledBuild {
  let dateKey: string | null = null;

  if (sel.preset === 'today') {
    dateKey = todayKeyNp();
  } else if (sel.preset === 'tomorrow') {
    dateKey = tomorrowKeyNp();
  } else if (sel.preset === 'custom') {
    if (sel.customDateKey) {
      dateKey = sel.customDateKey;
    } else {
      dateKey = parseDateText(sel.customDateText);
      if (!dateKey) return { iso: null, error: 'invalidDate' };
    }
  }

  if (!dateKey) return { iso: null, error: 'missingDate' };

  const hour12 = parseInt(sel.hourText, 10);
  const minute = parseInt(sel.minuteText || '0', 10);
  if (isNaN(hour12) || hour12 < 1 || hour12 > 12 || isNaN(minute) || minute < 0 || minute > 59) {
    return { iso: null, error: 'invalidTime' };
  }
  const hour24 = sel.period === 'PM' ? (hour12 % 12) + 12 : hour12 % 12;

  const nowNp = Date.now() + NEPAL_OFFSET_MS;
  const todayKey = wallToKey(new Date(nowNp));
  if (dateKey < todayKey) return { iso: null, error: 'pastDate' };

  const [y, mo, d] = dateKey.split('-').map(Number);
  const wallMs = Date.UTC(y, mo - 1, d, hour24, minute, 0);
  if (dateKey === todayKey && wallMs <= nowNp) return { iso: null, error: 'pastTime' };

  return { iso: `${dateKey}T${pad(hour24)}:${pad(minute)}:00${NEPAL_OFFSET}`, error: null };
}

/** Reverses a stored ISO timestamp back into the selection shape (for edit). */
export function scheduledIsoToSelection(iso: string | null): JobDateTimeSelection {
  if (!iso) return defaultSelection();
  const ms = parseServerTime(iso);
  if (Number.isNaN(ms)) return defaultSelection();
  const w = nepalWall(ms);
  const dateKey = wallToKey(w);
  const rawHours = w.getUTCHours();
  const period: 'AM' | 'PM' = rawHours >= 12 ? 'PM' : 'AM';
  return {
    preset: dateKey === todayKeyNp() ? 'today' : dateKey === tomorrowKeyNp() ? 'tomorrow' : 'custom',
    customDateKey: dateKey,
    customDateText: dateKey,
    hourText: String(rawHours % 12 || 12),
    minuteText: pad(w.getUTCMinutes()),
    period,
  };
}

export function formatScheduledDate(iso: string): string {
  return formatNepalLong(parseServerTime(iso));
}

export function formatScheduledTime(iso: string): string {
  return formatNepalTime(parseServerTime(iso));
}

/** Converts a native picker Date into its Nepal wall-clock date key. */
export function dateToKeyNp(date: Date): string {
  return wallToKey(new Date(date.getTime() + NEPAL_OFFSET_MS));
}

/** The absolute Date whose Nepal wall-clock is midnight of the given key. */
export function nepalMidnightDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - NEPAL_OFFSET_MS);
}

/** Formats an ISO date key (YYYY-MM-DD) as e.g. "September 20, 2026". */
export function formatDateKey(key: string): string {
  return formatNepalLong(parseServerTime(`${key}T00:00:00+05:45`));
}