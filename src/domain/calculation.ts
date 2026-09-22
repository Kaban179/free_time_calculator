export const MINUTES_PER_DAY = 1440;
export const MINUTES_PER_WEEK = 10080;
export const CATEGORIES = ['sleep', 'work', 'study', 'household', 'health', 'leisure', 'other'] as const;
export type Category = typeof CATEGORIES[number];
export type Mode = 'online' | 'offline';
export type Activity = {
  id: string;
  title: string;
  category: Category;
  days: number[];
  start: string;
  end: string;
  mode: Mode;
  travelBeforeMinutes: number;
  travelAfterMinutes: number;
};
export type Segment = {
  day: number;
  sourceDay: number;
  startMinute: number;
  endMinute: number;
  category: Category | 'travel';
  activityId: string;
  title: string;
  mode: Mode;
};
export type DayTotal = {
  day: number;
  occupiedMinutes: number;
  freeMinutes: number;
  overlapMinutes: number;
  categories: Record<Category | 'travel', number>;
  segments: Segment[];
};
export type Calculation = {
  ok: true;
  days: DayTotal[];
  weeklyOccupiedMinutes: number;
  weeklyFreeMinutes: number;
  overlapMinutes: number;
  categories: Record<Category | 'travel' | 'free', number>;
  segments: Segment[];
};
export type CalculationError = { code: 'validation' | 'conflict'; activityIds: string[]; message: string; day?: number };
export type CalculationResult = Calculation | { ok: false; errors: CalculationError[] };

const emptyCategories = (): Record<Category | 'travel', number> => ({
  sleep: 0, work: 0, study: 0, household: 0, health: 0, leisure: 0, other: 0, travel: 0,
});
function parseTime(value: string): number | null {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
function isFlexible(segment: Segment): boolean {
  return segment.mode === 'online' && segment.category !== 'sleep';
}
function addSegment(out: Segment[], activity: Activity, sourceDay: number,
  day: number, startMinute: number, endMinute: number, category: Segment['category']) {
  if (endMinute <= startMinute) return;
  out.push({ day, sourceDay, startMinute, endMinute, category,
    activityId: activity.id, title: activity.title, mode: activity.mode });
}

export function calculateWeek(activities: Activity[]): CalculationResult {
  const errors: CalculationError[] = [];
  const intervals: Segment[] = [];
  for (const activity of activities) {
    const start = parseTime(activity.start), end = parseTime(activity.end);
    const valid = typeof activity.id === 'string' && activity.id.trim() !== ''
      && typeof activity.title === 'string' && CATEGORIES.includes(activity.category)
      && Array.isArray(activity.days) && activity.days.length > 0
      && activity.days.every(day => Number.isInteger(day) && day >= 0 && day < 7)
      && start !== null && end !== null && start !== end
      && (activity.mode === 'online' || activity.mode === 'offline')
      && Number.isInteger(activity.travelBeforeMinutes) && activity.travelBeforeMinutes >= 0
      && activity.travelBeforeMinutes <= 240 && Number.isInteger(activity.travelAfterMinutes)
      && activity.travelAfterMinutes >= 0 && activity.travelAfterMinutes <= 240;
    if (!valid || start === null || end === null) {
      errors.push({ code: 'validation', activityIds: [activity.id],
        message: `Некорректная активность «${activity.title}»` });
      continue;
    }
    const duration = (end - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const before = activity.category === 'sleep' || activity.mode === 'online' ? 0 : activity.travelBeforeMinutes;
    const after = activity.category === 'sleep' || activity.mode === 'online' ? 0 : activity.travelAfterMinutes;
    for (const sourceDay of [...new Set(activity.days)]) {
      // For overnight sleep the selected day is the morning it ends.
      const absoluteStart = sourceDay * MINUTES_PER_DAY + start
        - (activity.category === 'sleep' && end < start ? MINUTES_PER_DAY : 0);
      const activeEnd = absoluteStart + duration;
      const ranges: [number, number, Segment['category']][] = [
        [absoluteStart - before, absoluteStart, 'travel'],
        [absoluteStart, activeEnd, activity.category],
        [activeEnd, activeEnd + after, 'travel'],
      ];
      for (const [rangeStart, rangeEnd, category] of ranges) {
        for (let cursor = rangeStart; cursor < rangeEnd;) {
          const wrapped = ((cursor % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
          const day = Math.floor(wrapped / MINUTES_PER_DAY);
          const startMinute = wrapped % MINUTES_PER_DAY;
          const endMinute = Math.min(MINUTES_PER_DAY, startMinute + rangeEnd - cursor);
          addSegment(intervals, activity, sourceDay, day, startMinute, endMinute, category);
          cursor += endMinute - startMinute;
        }
      }
    }
  }
  if (errors.length) return { ok: false, errors };

  for (let day = 0; day < 7; day++) {
    const segments = intervals.filter(segment => segment.day === day)
      .sort((a, b) => a.startMinute - b.startMinute);
    for (let index = 0; index < segments.length; index++) {
      for (let next = index + 1; next < segments.length && segments[next].startMinute < segments[index].endMinute; next++) {
        if (!isFlexible(segments[index]) && !isFlexible(segments[next])) {
          errors.push({ code: 'conflict', activityIds: [segments[index].activityId, segments[next].activityId],
            message: 'Активности пересекаются', day });
        }
      }
    }
  }
  if (errors.length) return { ok: false, errors };

  const totals = emptyCategories();
  const days: DayTotal[] = [];
  for (let day = 0; day < 7; day++) {
    const segments = intervals.filter(segment => segment.day === day)
      .sort((a, b) => a.startMinute - b.startMinute);
    const categories = emptyCategories();
    const owners: (Segment | null)[] = Array(MINUTES_PER_DAY).fill(null);
    const coverage = new Uint16Array(MINUTES_PER_DAY);
    // Non-online time, including travel, owns a shared minute before online time.
    for (const segment of [...segments].sort((a, b) => Number(isFlexible(a)) - Number(isFlexible(b)))) {
      for (let minute = segment.startMinute; minute < segment.endMinute; minute++) {
        coverage[minute]++;
        if (owners[minute] === null) owners[minute] = segment;
      }
    }
    let occupiedMinutes = 0, overlapMinutes = 0;
    for (let minute = 0; minute < MINUTES_PER_DAY; minute++) {
      const owner = owners[minute];
      if (owner === null) continue;
      occupiedMinutes++;
      if (coverage[minute] > 1) overlapMinutes++;
      categories[owner.category]++;
      totals[owner.category]++;
    }
    days.push({ day, occupiedMinutes, freeMinutes: MINUTES_PER_DAY - occupiedMinutes,
      overlapMinutes, categories, segments });
  }
  const weeklyOccupiedMinutes = days.reduce((sum, day) => sum + day.occupiedMinutes, 0);
  const weeklyFreeMinutes = MINUTES_PER_WEEK - weeklyOccupiedMinutes;
  return { ok: true, days, weeklyOccupiedMinutes, weeklyFreeMinutes,
    overlapMinutes: days.reduce((sum, day) => sum + day.overlapMinutes, 0),
    categories: { ...totals, free: weeklyFreeMinutes }, segments: intervals };
}
