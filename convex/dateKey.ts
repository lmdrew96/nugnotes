/**
 * Class dates are local calendar days stored as YYYY-MM-DD strings, never as
 * timestamps, so a Monday class stays on Monday whatever the time zone. Shared
 * by the backend and the app (imported from ../../convex/dateKey).
 */

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Today (or the given moment) as a local YYYY-MM-DD key. */
export const toDateKey = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const isDateKey = (value: string): boolean => {
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

/** "Nov 4, 2026". Reads the key's own numbers, so no time zone can shift it. */
export const formatDateKey = (key: string): string => {
  const match = DATE_KEY.exec(key);
  if (!match) return key;
  const [, y, m, d] = match;
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
};

/** Local midnight of the key's day, for sorting alongside timestamps. */
export const dateKeyToTime = (key: string): number => {
  const match = DATE_KEY.exec(key);
  if (!match) return 0;
  const [, y, m, d] = match.map(Number);
  return new Date(y, m - 1, d).getTime();
};
