import { describe, expect, it } from 'vitest';
import { deleteActivityForDay, saveActivityForDays } from './activity-edit';
import type { Activity } from './calculation';

const sleep: Activity = { id: 'sleep', title: 'Сон', category: 'sleep', days: [0, 1, 2, 3, 4, 5, 6],
  start: '23:00', end: '07:00', mode: 'online', travelBeforeMinutes: 0, travelAfterMinutes: 0 };

describe('editing one day of a repeating activity', () => {
  it('changes only Tuesday sleep', () => {
    const next = saveActivityForDays([sleep], { ...sleep, days: [1], start: '22:30', end: '08:00' }, 1, () => 'tuesday');
    expect(next).toHaveLength(2);
    expect(next.find(item => item.id === 'sleep')).toMatchObject({ days: [0, 2, 3, 4, 5, 6], start: '23:00', end: '07:00' });
    expect(next.find(item => item.id === 'tuesday')).toMatchObject({ days: [1], start: '22:30', end: '08:00' });
  });
  it('replaces previous sleep instead of adding a duplicate', () => {
    const next = saveActivityForDays([sleep], { ...sleep, id: '', days: [1], start: '22:00', end: '06:00' }, null, () => 'new');
    expect(next.filter(item => item.category === 'sleep' && item.days.includes(1))).toHaveLength(1);
    expect(next.find(item => item.id === 'sleep')?.days).toEqual([0, 2, 3, 4, 5, 6]);
  });
  it('deletes only the selected occurrence', () => {
    const next = deleteActivityForDay([sleep], 'sleep', 1);
    expect(next).toHaveLength(1);
    expect(next[0].days).toEqual([0, 2, 3, 4, 5, 6]);
  });
});
