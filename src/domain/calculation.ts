export const MINUTES_PER_DAY = 1440;
export const MINUTES_PER_WEEK = 10080;
export const CATEGORIES = ['sleep', 'work', 'study', 'household', 'health', 'leisure', 'other'] as const;
export type Category = typeof CATEGORIES[number];
export type Mode = 'online' | 'offline';
export type Activity = { id: string; title: string; category: Category; days: number[]; start: string; end: string; mode: Mode; travelBeforeMinutes: number; travelAfterMinutes: number };
export type Segment = { day: number; startMinute: number; endMinute: number; category: Category | 'travel'; activityId: string; title: string };
export type DayTotal = { day: number; occupiedMinutes: number; freeMinutes: number; categories: Record<Category | 'travel', number>; segments: Segment[] };
export type Calculation = { ok: true; days: DayTotal[]; weeklyOccupiedMinutes: number; weeklyFreeMinutes: number; categories: Record<Category | 'travel' | 'free', number>; segments: Segment[] };
export type CalculationError = { code: 'validation' | 'conflict'; activityIds: string[]; message: string; day?: number };
export type CalculationResult = Calculation | { ok: false; errors: CalculationError[] };

const emptyCategories = (): Record<Category | 'travel', number> => ({ sleep: 0, work: 0, study: 0, household: 0, health: 0, leisure: 0, other: 0, travel: 0 });
function parseTime(value: string): number | null { const m = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value); return m ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null; }
function addSegment(out: Segment[], activity: Activity, day: number, start: number, end: number, category: Segment['category']) { if (end > start) out.push({ day, startMinute: start, endMinute: end, category, activityId: activity.id, title: activity.title }); }

export function calculateWeek(activities: Activity[]): CalculationResult {
  const errors: CalculationError[] = [];
  const intervals: Segment[] = [];
  for (const a of activities) {
    const start = parseTime(a.start), end = parseTime(a.end);
    if (typeof a.id !== 'string' || a.id.trim() === '' || typeof a.title !== 'string' || !CATEGORIES.includes(a.category) || !Array.isArray(a.days) || a.days.length === 0 || a.days.some(d => !Number.isInteger(d) || d < 0 || d > 6) || start === null || end === null || start === end || (a.mode !== 'online' && a.mode !== 'offline') || !Number.isFinite(a.travelBeforeMinutes) || !Number.isInteger(a.travelBeforeMinutes) || a.travelBeforeMinutes < 0 || a.travelBeforeMinutes > 240 || !Number.isFinite(a.travelAfterMinutes) || !Number.isInteger(a.travelAfterMinutes) || a.travelAfterMinutes < 0 || a.travelAfterMinutes > 240) {
      errors.push({ code: 'validation', activityIds: [a.id], message: `Некорректная активность «${a.title}»` }); continue;
    }
    const duration = (end - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    for (const day of [...new Set(a.days)]) {
      const absoluteStart = day * MINUTES_PER_DAY + start;
      const activeEnd = absoluteStart + duration;
      const before = a.category === 'sleep' || a.mode === 'online' ? 0 : a.travelBeforeMinutes;
      const after = a.category === 'sleep' || a.mode === 'online' ? 0 : a.travelAfterMinutes;
      for (const [s, e, cat] of [[absoluteStart - before, absoluteStart, 'travel'], [absoluteStart, activeEnd, a.category], [activeEnd, activeEnd + after, 'travel']] as [number, number, Segment['category']][]) {
        for (let cursor = s; cursor < e; ) { const wrapped = ((cursor % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK; const d = Math.floor(wrapped / MINUTES_PER_DAY); const partStart = wrapped % MINUTES_PER_DAY; const partEnd = Math.min(e - cursor + partStart, MINUTES_PER_DAY); addSegment(intervals, a, d, partStart, partEnd, cat); cursor += partEnd - partStart; }
      }
    }
  }
  if (errors.length) return { ok: false, errors };
  for (let day = 0; day < 7; day++) { const daySegments = intervals.filter(s => s.day === day).sort((a, b) => a.startMinute - b.startMinute); for (let i = 1; i < daySegments.length; i++) if (daySegments[i].startMinute < daySegments[i - 1].endMinute) errors.push({ code: 'conflict', activityIds: [daySegments[i - 1].activityId, daySegments[i].activityId], message: 'Активности пересекаются', day }); }
  if (errors.length) return { ok: false, errors };
  const days: DayTotal[] = []; const totals = emptyCategories();
  for (let day = 0; day < 7; day++) { const segments = intervals.filter(s => s.day === day).sort((a, b) => a.startMinute - b.startMinute); const categories = emptyCategories(); segments.forEach(s => { categories[s.category] += s.endMinute - s.startMinute; totals[s.category] += s.endMinute - s.startMinute; }); const occupiedMinutes = segments.reduce((n, s) => n + s.endMinute - s.startMinute, 0); days.push({ day, occupiedMinutes, freeMinutes: MINUTES_PER_DAY - occupiedMinutes, categories, segments }); }
  const weeklyOccupiedMinutes = days.reduce((n, d) => n + d.occupiedMinutes, 0); return { ok: true, days, weeklyOccupiedMinutes, weeklyFreeMinutes: MINUTES_PER_WEEK - weeklyOccupiedMinutes, categories: { ...totals, free: MINUTES_PER_WEEK - weeklyOccupiedMinutes }, segments: intervals };
}
