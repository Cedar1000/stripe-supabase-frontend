import type { Precision } from './types';

/** A date as the user entered it; month/day may be missing. */
export type PartialDate = { year: number; month?: number; day?: number };

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Turns a partial date into the stored value: the last day of whatever period
 * was given (year -> 31 Dec, month+year -> last day of that month).
 */
export function toStored(date: PartialDate): { date: string; precision: Precision } {
  const { year, month, day } = date;
  if (!month) return { date: `${year}-12-31`, precision: 'year' };
  if (!day) return { date: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`, precision: 'month' };
  return { date: `${year}-${pad(month)}-${pad(day)}`, precision: 'day' };
}

/** Reverses toStored, returning only the parts the user originally gave. */
export function fromStored(date: string | null, precision: Precision | null): PartialDate | null {
  if (!date || !precision) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (precision === 'year') return { year };
  if (precision === 'month') return { year, month };
  return { year, month, day };
}

/** Display only what was entered: "1950", "March 1950" or "4 March 1950". */
export function formatDate(date: string | null, precision: Precision | null) {
  const parts = fromStored(date, precision);
  if (!parts) return '';
  if (!parts.month) return String(parts.year);
  if (!parts.day) return `${MONTHS[parts.month - 1]} ${parts.year}`;
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}

export function validatePartial(date: PartialDate): string | null {
  const { year, month, day } = date;
  const thisYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1 || year > thisYear) return `Year must be between 1 and ${thisYear}.`;
  if (day && !month) return 'Choose a month when a day is given.';
  if (month && day && (day < 1 || day > daysInMonth(year, month))) return 'That day does not exist in the chosen month.';
  return null;
}

/**
 * Parses a search query such as "1950", "3/1950", "1950-03", "4/3/1950" or
 * "1950-03-04" (day/month/year order for slashes).
 */
export function parseSearchDate(text: string): PartialDate | null {
  const t = text.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})$/);
  if (m) return { year: +m[1] };
  m = t.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (m) return { year: +m[1], month: +m[2], day: m[3] ? +m[3] : undefined };
  m = t.match(/^(?:(\d{1,2})[/.])?(\d{1,2})[/.](\d{4})$/);
  if (m) return { year: +m[3], month: +m[2], day: m[1] ? +m[1] : undefined };
  return null;
}

/** What the day/month/year inputs hold while someone is typing. */
export type DateDraft = { day: string; month: string; year: string };

export const emptyDateDraft: DateDraft = { day: '', month: '', year: '' };

export function draftFromStored(date: string | null, precision: Precision | null): DateDraft {
  const p = fromStored(date, precision);
  return p ? { year: String(p.year), month: p.month ? String(p.month) : '', day: p.day ? String(p.day) : '' } : emptyDateDraft;
}

export function partialFromDraft(d: DateDraft): PartialDate | null {
  if (!d.year && !d.month && !d.day) return null;
  return { year: Number(d.year), month: d.month ? Number(d.month) : undefined, day: d.day ? Number(d.day) : undefined };
}

export type StoredDates = {
  birth_date: string | null;
  birth_precision: Precision | null;
  death_date: string | null;
  death_precision: Precision | null;
};

/** Validates the birth/death inputs and converts them to stored columns. */
export function datesFromDrafts(birth: DateDraft, deceased: boolean, death: DateDraft): { error: string } | StoredDates {
  const birthPartial = partialFromDraft(birth);
  const deathPartial = deceased ? partialFromDraft(death) : null;
  for (const [label, p] of [['Date of birth', birthPartial], ['Date of death', deathPartial]] as const) {
    const problem = p && validatePartial(p);
    if (problem) return { error: `${label}: ${problem}` };
  }
  if (birthPartial && deathPartial && comparePartial(deathPartial, birthPartial) < 0) {
    return { error: 'Date of death cannot be before date of birth.' };
  }
  const b = birthPartial && toStored(birthPartial);
  const d = deathPartial && toStored(deathPartial);
  return {
    birth_date: b?.date ?? null,
    birth_precision: b?.precision ?? null,
    death_date: d?.date ?? null,
    death_precision: d?.precision ?? null,
  };
}

/** Negative if `a` is certainly before `b`, comparing only the parts both have. */
export function comparePartial(a: PartialDate, b: PartialDate) {
  for (const key of ['year', 'month', 'day'] as const) {
    const x = a[key];
    const y = b[key];
    if (x === undefined || y === undefined) return 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** True when a stored date agrees with every part the searcher supplied. */
export function matchesPartial(date: string | null, precision: Precision | null, query: PartialDate) {
  const stored = fromStored(date, precision);
  if (!stored || stored.year !== query.year) return false;
  if (query.month && stored.month !== query.month) return false;
  if (query.day && stored.day !== query.day) return false;
  return true;
}

/** Days from today until the next birthday (0 = today), or null if no day/month known. */
export function daysUntilBirthday(date: string | null, precision: Precision | null, today = new Date()) {
  if (!date || precision !== 'day') return null;
  const [, month, day] = date.split('-').map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const nextIn = (year: number) => {
    // 29 Feb birthdays fall on 28 Feb in non-leap years.
    const d = Math.min(day, daysInMonth(year, month));
    return new Date(year, month - 1, d);
  };
  let next = nextIn(start.getFullYear());
  if (next < start) next = nextIn(start.getFullYear() + 1);
  return Math.round((next.getTime() - start.getTime()) / 86_400_000);
}

export function ageOn(birth: string, at = new Date()) {
  const [y, m, d] = birth.split('-').map(Number);
  let age = at.getFullYear() - y;
  if (at.getMonth() + 1 < m || (at.getMonth() + 1 === m && at.getDate() < d)) age -= 1;
  return age;
}
