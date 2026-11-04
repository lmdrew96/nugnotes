import { describe, expect, it } from 'vitest';
import { dateKeyToTime, formatDateKey, isDateKey, toDateKey } from '../convex/dateKey';

// Checked under more than one zone, e.g. TZ=America/Los_Angeles and TZ=Asia/Tokyo.
describe('dateKey', () => {
  it('uses the local calendar day, even late at night', () => {
    expect(toDateKey(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04');
    expect(toDateKey(new Date(2026, 10, 5, 0, 1))).toBe('2026-11-05');
  });

  it('formats from the key itself, never shifting a day', () => {
    expect(formatDateKey('2026-11-04')).toBe('Nov 4, 2026');
    expect(formatDateKey('2026-01-01')).toBe('Jan 1, 2026');
  });

  it('round-trips through local midnight', () => {
    expect(toDateKey(new Date(dateKeyToTime('2026-03-08')))).toBe('2026-03-08');
    expect(dateKeyToTime('2026-11-05')).toBeGreaterThan(dateKeyToTime('2026-11-04'));
  });

  it('rejects malformed and impossible dates', () => {
    expect(isDateKey('2026-11-04')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('11/4/2026')).toBe(false);
  });
});
