import { describe, expect, it } from 'vitest';
import { calculateWeek, type Activity } from './calculation';

const activity = (x: Partial<Activity> = {}): Activity => ({ id: 'a', title: 'Занятие', category: 'work', days: [0], start: '09:00', end: '10:00', mode: 'online', travelBeforeMinutes: 0, travelAfterMinutes: 0, ...x });
const ok = (x: ReturnType<typeof calculateWeek>) => { expect(x.ok).toBe(true); if (!x.ok) throw new Error('calculation failed'); return x; };

describe('calculateWeek', () => {
  it('returns an empty week', () => { const r = ok(calculateWeek([])); expect(r.weeklyFreeMinutes).toBe(10080); expect(r.weeklyOccupiedMinutes).toBe(0); });
  it('calculates an ordinary block', () => { const r = ok(calculateWeek([activity()])); expect(r.days[0].occupiedMinutes).toBe(60); expect(r.categories.work).toBe(60); });
  it('splits overnight activity and wraps the week boundary', () => { const r = ok(calculateWeek([activity({ days: [6], start: '23:00', end: '01:00' })])); expect(r.days[6].categories.work).toBe(60); expect(r.days[0].categories.work).toBe(60); });
  it('treats the selected sleep day as the morning it ends', () => {
    const night = activity({ category: 'sleep', days: [1], start: '23:00', end: '07:00' });
    const overnight = ok(calculateWeek([night]));
    expect(overnight.days[0].categories.sleep).toBe(60);
    expect(overnight.days[1].categories.sleep).toBe(420);
    const afterMidnight = ok(calculateWeek([{ ...night, start: '00:00', end: '08:00' }]));
    expect(afterMidnight.days[0].categories.sleep).toBe(0);
    expect(afterMidnight.days[1].categories.sleep).toBe(480);
  });
  it('moves offline travel across day boundaries', () => { const r = ok(calculateWeek([activity({ start: '00:10', end: '01:10', mode: 'offline', travelBeforeMinutes: 30, travelAfterMinutes: 40 })])); expect(r.days[6].categories.travel).toBe(20); expect(r.days[0].categories.travel).toBe(50); });
  it('does not add travel for online activities', () => { const r = ok(calculateWeek([activity({ travelBeforeMinutes: 30, travelAfterMinutes: 30 })])); expect(r.categories.travel).toBe(0); });
  it('rejects overlapping offline activities', () => { const r = calculateWeek([activity({ id: 'a', mode: 'offline' }), activity({ id: 'b', mode: 'offline', start: '09:30', end: '10:30' })]); expect(r.ok).toBe(false); if (!r.ok) expect(r.errors[0].code).toBe('conflict'); });
  it('allows online activities during work and travel without double counting', () => {
    const r = ok(calculateWeek([
      activity({ id: 'office', mode: 'offline', start: '09:00', end: '10:00', travelBeforeMinutes: 30, travelAfterMinutes: 30 }),
      activity({ id: 'lesson', category: 'study', mode: 'online', start: '08:45', end: '09:15' }),
    ]));
    expect(r.days[0].occupiedMinutes).toBe(120);
    expect(r.days[0].overlapMinutes).toBe(30);
    expect(r.categories.travel).toBe(60);
    expect(r.categories.work).toBe(60);
    expect(r.categories.study).toBe(0);
    expect(Object.values(r.categories).reduce((sum, minutes) => sum + minutes, 0)).toBe(10080);
  });
  it('counts shared time from two online activities once', () => {
    const r = ok(calculateWeek([activity({ id: 'a' }), activity({ id: 'b', category: 'study', start: '09:30', end: '10:30' })]));
    expect(r.days[0].occupiedMinutes).toBe(90);
    expect(r.days[0].overlapMinutes).toBe(30);
  });
  it('allows touching boundaries', () => { const r = ok(calculateWeek([activity({ id: 'a' }), activity({ id: 'b', start: '10:00', end: '11:00' })])); expect(r.days[0].occupiedMinutes).toBe(120); });
  it('counts only free intervals longer than 30 minutes', () => {
    const thirty = ok(calculateWeek([
      activity({ id: 'before', start: '00:00', end: '10:00' }),
      activity({ id: 'after', start: '10:30', end: '00:00' }),
    ]));
    expect(thirty.days[0].freeMinutes).toBe(0);
    const thirtyOne = ok(calculateWeek([
      activity({ id: 'before', start: '00:00', end: '10:00' }),
      activity({ id: 'after', start: '10:31', end: '00:00' }),
    ]));
    expect(thirtyOne.days[0].freeMinutes).toBe(31);
  });
  it('keeps a qualifying free interval continuous across midnight', () => {
    const r = ok(calculateWeek([activity({ days: [0, 1, 2, 3, 4, 5, 6], start: '00:40', end: '23:50' })]));
    expect(r.days[0].freeMinutes).toBe(50);
    expect(r.weeklyFreeMinutes).toBe(350);
  });
  it('keeps category and free totals equal to a week', () => { const r = ok(calculateWeek([activity({ category: 'work' }), activity({ id: 'b', category: 'sleep', days: [1], start: '22:00', end: '06:00' })])); const total = Object.values(r.categories).reduce((a, b) => a + b, 0); expect(total).toBe(10080); });
  it('rejects invalid identity and travel values', () => { for (const value of [NaN, 1.5, -1, 241]) { const r = calculateWeek([activity({ travelBeforeMinutes: value })]); expect(r.ok).toBe(false); } expect(calculateWeek([activity({ id: '' })]).ok).toBe(false); expect(calculateWeek([activity({ title: 42 as unknown as string })]).ok).toBe(false); });
});
