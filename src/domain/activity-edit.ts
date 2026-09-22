import type { Activity } from './calculation';

/** Saves one occurrence of a repeating activity without changing its other days. */
export function saveActivityForDays(
  activities: Activity[], saved: Activity, occurrenceDay: number | null, createId: () => string,
): Activity[] {
  const original = activities.find(item => item.id === saved.id);
  let next: Activity[];
  let updated: Activity;
  if (original && occurrenceDay !== null) {
    const otherDays = original.days.filter(day => day !== occurrenceDay);
    updated = { ...saved, id: otherDays.length ? createId() : original.id, days: [occurrenceDay] };
    next = activities.filter(item => item.id !== original.id);
    if (otherDays.length) next.push({ ...original, days: otherDays });
    next.push(updated);
  } else if (original) {
    updated = saved;
    next = activities.map(item => item.id === original.id ? saved : item);
  } else {
    updated = { ...saved, id: saved.id || createId() };
    next = [...activities, updated];
  }

  // There is only one sleep interval per starting day. A new sleep time replaces
  // that day's previous sleep, including when the previous record repeats weekly.
  if (updated.category === 'sleep') {
    const replacementDays = new Set(updated.days);
    next = next.map(item => item.id !== updated.id && item.category === 'sleep'
      ? { ...item, days: item.days.filter(day => !replacementDays.has(day)) }
      : item).filter(item => item.days.length > 0);
  }
  return next;
}

export function deleteActivityForDay(activities: Activity[], id: string, occurrenceDay: number | null): Activity[] {
  if (occurrenceDay === null) return activities.filter(item => item.id !== id);
  return activities.map(item => item.id === id
    ? { ...item, days: item.days.filter(day => day !== occurrenceDay) } : item)
    .filter(item => item.days.length > 0);
}
