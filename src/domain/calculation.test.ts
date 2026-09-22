import { describe, expect, it } from 'vitest';
import { calculateWeek, type Activity } from './calculation';

const activity = (x: Partial<Activity> = {}): Activity => ({ id: 'a', title: 'Занятие', category: 'work', days: [0], start: '09:00', end: '10:00', mode: 'online', travelBeforeMinutes: 0, travelAfterMinutes: 0, ...x });
const ok = (x: ReturnType<typeof calculateWeek>) => { expect(x.ok).toBe(true); if (!x.ok) throw new Error('calculation failed'); return x; };

describe('calculateWeek', () => {
  it('returns an empty week', () => { const r = ok(calculateWeek([])); expect(r.weeklyFreeMinutes).toBe(10080); expect(r.weeklyOccupiedMinutes).toBe(0); });
  it('calculates an ordinary block', () => { const r = ok(calculateWeek([activity()])); expect(r.days[0].occupiedMinutes).toBe(60); expect(r.categories.work).toBe(60); });
  it('splits overnight activity and wraps the week boundary', () => { const r = ok(calculateWeek([activity({ days: [6], start: '23:00', end: '01:00' })])); expect(r.days[6].categories.work).toBe(60); expect(r.days[0].categories.work).toBe(60); });
  it('moves offline travel across day boundaries', () => { const r = ok(calculateWeek([activity({ start: '00:10', end: '01:10', mode: 'offline', travelBeforeMinutes: 30, travelAfterMinutes: 40 })])); expect(r.days[6].categories.travel).toBe(20); expect(r.days[0].categories.travel).toBe(50); });
  it('does not add travel for online activities', () => { const r = ok(calculateWeek([activity({ travelBeforeMinutes: 30, travelAfterMinutes: 30 })])); expect(r.categories.travel).toBe(0); });
  it('rejects overlaps', () => { const r = calculateWeek([activity({ id: 'a' }), activity({ id: 'b', start: '09:30', end: '10:30' })]); expect(r.ok).toBe(false); if (!r.ok) expect(r.errors[0].code).toBe('conflict'); });
  it('allows touching boundaries', () => { const r = ok(calculateWeek([activity({ id: 'a' }), activity({ id: 'b', start: '10:00', end: '11:00' })])); expect(r.days[0].occupiedMinutes).toBe(120); });
  it('keeps category and free totals equal to a week', () => { const r = ok(calculateWeek([activity({ category: 'work' }), activity({ id: 'b', category: 'sleep', days: [1], start: '22:00', end: '06:00' })])); const total = Object.values(r.categories).reduce((a, b) => a + b, 0); expect(total).toBe(10080); });
  it('rejects invalid identity and travel values', () => { for (const value of [NaN, 1.5, -1, 241]) { const r = calculateWeek([activity({ travelBeforeMinutes: value })]); expect(r.ok).toBe(false); } expect(calculateWeek([activity({ id: '' })]).ok).toBe(false); expect(calculateWeek([activity({ title: 42 as unknown as string })]).ok).toBe(false); });
});
