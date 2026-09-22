import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CATEGORIES, calculateWeek, type Activity, type Calculation, type Category, type Segment } from './domain/calculation';
import { deleteActivityForDay, saveActivityForDays } from './domain/activity-edit';
import { CategoryIcon } from './CategoryIcon';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const STORAGE_KEY = 'free-time-calculator.activities.v1';
const LABELS: Record<Category | 'travel' | 'free', string> = {
  sleep: 'Сон', work: 'Работа', study: 'Учёба', household: 'Быт', health: 'Здоровье',
  leisure: 'Отдых', other: 'Другое', travel: 'Дорога', free: 'Свободно',
};
const DEFAULTS: Record<Category, { title: string; start: string; end: string; mode: Activity['mode']; travel: number }> = {
  sleep: { title: 'Сон', start: '23:00', end: '07:00', mode: 'online', travel: 0 },
  work: { title: 'Работа', start: '09:00', end: '18:00', mode: 'offline', travel: 30 },
  study: { title: 'Учёба', start: '10:00', end: '16:00', mode: 'offline', travel: 30 },
  household: { title: 'Домашние дела', start: '18:00', end: '19:00', mode: 'online', travel: 0 },
  health: { title: 'Тренировка', start: '19:00', end: '20:00', mode: 'offline', travel: 20 },
  leisure: { title: 'Отдых', start: '20:00', end: '21:00', mode: 'online', travel: 0 },
  other: { title: 'Другое дело', start: '19:00', end: '20:00', mode: 'online', travel: 0 },
};

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? (rest ? `${hours} ч ${rest} мин` : `${hours} ч`) : `${rest} мин`;
}

function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function isStoredActivity(value: unknown): value is Activity {
  if (!value || typeof value !== 'object') return false;
  const item = value as Activity;
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  return typeof item.id === 'string' && item.id.length > 0 && typeof item.title === 'string'
    && CATEGORIES.includes(item.category) && Array.isArray(item.days) && item.days.length > 0
    && item.days.every(day => Number.isInteger(day) && day >= 0 && day < 7)
    && typeof item.start === 'string' && time.test(item.start)
    && typeof item.end === 'string' && time.test(item.end) && item.start !== item.end
    && (item.mode === 'online' || item.mode === 'offline')
    && Number.isInteger(item.travelBeforeMinutes) && Number.isInteger(item.travelAfterMinutes)
    && item.travelBeforeMinutes >= 0 && item.travelBeforeMinutes <= 240
    && item.travelAfterMinutes >= 0 && item.travelAfterMinutes <= 240;
}

function readActivities(): Activity[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isStoredActivity) : [];
  } catch { return []; }
}

function newActivity(day: number, category: Category = 'sleep'): Activity {
  const preset = DEFAULTS[category];
  const days = category === 'sleep' ? [0, 1, 2, 3, 4, 5, 6]
    : category === 'work' || category === 'study' ? [0, 1, 2, 3, 4] : [day];
  return { id: '', title: preset.title, category, days, start: preset.start, end: preset.end,
    mode: preset.mode, travelBeforeMinutes: preset.travel, travelAfterMinutes: preset.travel };
}
function suggestedActivity(day: number, activities: Activity[]): Activity {
  if (!activities.some(item => item.category === 'sleep' && item.days.includes(day))) return newActivity(day, 'sleep');
  if (day < 5 && !activities.some(item => item.category === 'work' && item.days.includes(day))) return newActivity(day, 'work');
  return newActivity(day, 'other');
}

// The visual schedule stays visible when overlapping entries make calculation impossible.
function visualiseSchedule(activities: Activity[]): Segment[] {
  const segments: Segment[] = [];
  const dayMinutes = 1440, weekMinutes = 10080;
  for (const item of activities) {
    const start = Number(item.start.slice(0, 2)) * 60 + Number(item.start.slice(3));
    const end = Number(item.end.slice(0, 2)) * 60 + Number(item.end.slice(3));
    const duration = (end - start + dayMinutes) % dayMinutes;
    const before = item.mode === 'offline' && item.category !== 'sleep' ? item.travelBeforeMinutes : 0;
    const after = item.mode === 'offline' && item.category !== 'sleep' ? item.travelAfterMinutes : 0;
    for (const day of item.days) {
      const absolute = day * dayMinutes + start
        - (item.category === 'sleep' && end < start ? dayMinutes : 0);
      const ranges: [number, number, Segment['category']][] = [
        [absolute - before, absolute, 'travel'],
        [absolute, absolute + duration, item.category],
        [absolute + duration, absolute + duration + after, 'travel'],
      ];
      for (const [rangeStart, rangeEnd, category] of ranges) {
        for (let cursor = rangeStart; cursor < rangeEnd;) {
          const wrapped = ((cursor % weekMinutes) + weekMinutes) % weekMinutes;
          const segmentDay = Math.floor(wrapped / dayMinutes);
          const startMinute = wrapped % dayMinutes;
          const endMinute = Math.min(dayMinutes, startMinute + rangeEnd - cursor);
          segments.push({ day: segmentDay, sourceDay: day, startMinute, endMinute, category,
            activityId: item.id, title: item.title, mode: item.mode });
          cursor += endMinute - startMinute;
        }
      }
    }
  }
  return segments.sort((a, b) => a.day - b.day || a.startMinute - b.startMinute);
}

function cardItems(segments: Segment[], day: number) {
  const items = new Map<string, { title: string; category: Segment['category']; minutes: number }>();
  for (const segment of segments.filter(segment => segment.day === day && segment.category !== 'travel')) {
    const key = segment.category === 'sleep' ? 'sleep' : `${segment.activityId}:${segment.category}`;
    const previous = items.get(key);
    items.set(key, { title: segment.title || LABELS[segment.category], category: segment.category,
      minutes: (previous?.minutes ?? 0) + segment.endMinute - segment.startMinute });
  }
  return [...items.values()].sort((a, b) => b.minutes - a.minutes);
}

function TimeBlocks({ segments, activities, onEdit }: { segments: Segment[]; activities: Activity[]; onEdit: (item: Activity, day: number) => void }) {
  const positioned = segments.map(segment => ({ segment, lane: 0, lanes: 1 }));
  for (let groupStart = 0; groupStart < positioned.length;) {
    let groupEnd = groupStart + 1;
    let latestEnd = positioned[groupStart].segment.endMinute;
    while (groupEnd < positioned.length && positioned[groupEnd].segment.startMinute < latestEnd) {
      latestEnd = Math.max(latestEnd, positioned[groupEnd].segment.endMinute);
      groupEnd++;
    }
    const laneEnds: number[] = [];
    for (let index = groupStart; index < groupEnd; index++) {
      const segment = positioned[index].segment;
      let lane = laneEnds.findIndex(end => end <= segment.startMinute);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = segment.endMinute;
      positioned[index].lane = lane;
    }
    for (let index = groupStart; index < groupEnd; index++) positioned[index].lanes = laneEnds.length;
    groupStart = groupEnd;
  }
  return <div className="time-layout"><div className="time-labels" aria-hidden="true">
    {Array.from({ length: 13 }, (_, index) => <span key={index} style={{ top: `${index / 12 * 100}%` }}>{formatClock(index * 120)}</span>)}
  </div><div className="time-track">
    {Array.from({ length: 25 }, (_, index) => <div className="time-line" key={index} style={{ top: `${index / 24 * 100}%` }} />)}
    {positioned.map(({ segment, lane, lanes }, index) => {
      const activity = activities.find(item => item.id === segment.activityId);
      const minutes = segment.endMinute - segment.startMinute;
      const label = segment.category === 'travel' ? `Дорога · ${segment.title}`
        : segment.category === 'sleep' && segment.sourceDay !== segment.day ? `Сон · к ${DAYS[segment.sourceDay]}`
          : segment.title || LABELS[segment.category];
      const sharedOnline = segments.some((other, otherIndex) => otherIndex !== index
        && other.startMinute < segment.endMinute && segment.startMinute < other.endMinute
        && ((segment.mode === 'online' && segment.category !== 'sleep')
          || (other.mode === 'online' && other.category !== 'sleep')));
      return <button type="button" key={`${segment.activityId}-${segment.startMinute}-${index}`}
        className={`time-block category-${segment.category}${minutes < 45 ? ' short' : ''}${sharedOnline ? ' shared-online' : ''}${segment.mode === 'online' && segment.category !== 'sleep' ? ' online-block' : ''}`}
        style={{ top: `${segment.startMinute / 1440 * 100}%`, height: `${minutes / 1440 * 100}%`,
          left: `calc(${lane / lanes * 100}% + ${lane === 0 ? 9 : 4}px)`,
          right: `calc(${(lanes - lane - 1) / lanes * 100}% + 4px)` }}
        title={`${label}, ${formatClock(segment.startMinute)}–${formatClock(segment.endMinute)}${sharedOnline ? ', совмещено с другим занятием' : ''}`}
        aria-label={`${label}, ${formatClock(segment.startMinute)}–${formatClock(segment.endMinute)}${sharedOnline ? ', совмещено с другим занятием' : ''}`}
        onClick={() => activity && onEdit(activity, segment.sourceDay)}>
        <span className="time-block-title"><CategoryIcon kind={segment.category} size={14} /><strong>{label}</strong></span>
        {minutes >= 45 && <small>{formatClock(segment.startMinute)}–{formatClock(segment.endMinute)}</small>}
      </button>;
    })}
  </div></div>;
}

export default function App() {
  const [activities, setActivities] = useState<Activity[]>(readActivities);
  const [selectedDay, setSelectedDay] = useState(0);
  const [editing, setEditing] = useState<Activity>(() => suggestedActivity(0, activities));
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [result, setResult] = useState<Calculation | null>(null);
  const [resultIsOld, setResultIsOld] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (activities.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(activities));
    else localStorage.removeItem(STORAGE_KEY);
  }, [activities]);

  const preview = useMemo(() => calculateWeek(activities), [activities]);
  const visualSegments = useMemo(() => visualiseSchedule(activities), [activities]);
  const dayActivities = activities.filter(item => item.days.includes(selectedDay))
    .sort((a, b) => a.start.localeCompare(b.start));
  const segments = visualSegments.filter(segment => segment.day === selectedDay);

  function openForm(activity: Activity, occurrenceDay?: number) {
    returnFocus.current = document.activeElement as HTMLElement;
    const day = activity.id && occurrenceDay !== undefined ? occurrenceDay : null;
    setEditing(day === null ? activity : { ...activity, days: [day] });
    setEditingDay(day);
    setFormVersion(version => version + 1);
    requestAnimationFrame(() => {
      document.getElementById('activity-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      document.querySelector<HTMLInputElement>('#activity-form input:not([disabled])')?.focus({ preventScroll: true });
    });
  }
  function closeForm(nextActivities: Activity[] = activities) {
    setEditing(suggestedActivity(selectedDay, nextActivities));
    setEditingDay(null);
    setFormVersion(version => version + 1);
    requestAnimationFrame(() => returnFocus.current?.focus());
  }
  function updateActivities(next: Activity[]) {
    setActivities(next);
    setResultIsOld(result !== null);
    setErrors([]);
  }
  function saveActivity(activity: Activity) {
    const saved: Activity = { ...activity,
      title: activity.category === 'sleep' ? 'Сон' : activity.title.trim(),
      mode: activity.category === 'sleep' ? 'online' : activity.mode,
      travelBeforeMinutes: activity.category === 'sleep' || activity.mode === 'online' ? 0 : activity.travelBeforeMinutes,
      travelAfterMinutes: activity.category === 'sleep' || activity.mode === 'online' ? 0 : activity.travelAfterMinutes };
    const next = saveActivityForDays(activities, saved, editingDay, () => crypto.randomUUID());
    updateActivities(next);
    closeForm(next);
  }
  function deleteActivity(activity: Activity) {
    const dayLabel = editingDay === null ? '' : `, ${DAYS[editingDay]}`;
    if (!window.confirm(`Удалить «${activity.title || LABELS[activity.category]}»${dayLabel}?`)) return;
    const next = deleteActivityForDay(activities, activity.id, editingDay);
    updateActivities(next);
    closeForm(next);
  }
  function calculate() {
    const calculated = calculateWeek(activities);
    if (calculated.ok) { setResult(calculated); setResultIsOld(false); setErrors([]); return; }
    const firstConflict = calculated.errors.find(error => error.day !== undefined);
    if (firstConflict?.day !== undefined) setSelectedDay(firstConflict.day);
    setErrors(calculated.errors.map(error => {
      const names = [...new Set(error.activityIds)].map(id => activities.find(item => item.id === id))
        .map(item => item?.title || (item ? LABELS[item.category] : 'запись'));
      return `${error.message}${error.day === undefined ? '' : `, ${DAYS[error.day]}`}: ${names.join(' и ')}`;
    }));
  }
  function clearActivities() {
    if (!window.confirm('Очистить всё расписание на этом устройстве?')) return;
    setActivities([]); setResult(null); setResultIsOld(false); setErrors([]); setSelectedDay(0);
    setEditing(newActivity(0)); setEditingDay(null); setFormVersion(version => version + 1);
  }

  return <main className="app">
    <header className="site-header"><div className="brand"><span>Калькулятор<br />свободного времени</span></div>
      <nav aria-label="Основная навигация"><a href="#plan">План</a><a href="#results">Результат</a></nav></header>
    <section className="intro" aria-labelledby="page-title"><div><p className="eyebrow">ТВОЯ ТИПИЧНАЯ НЕДЕЛЯ</p>
      <h1 id="page-title">Оставь место для жизни</h1>
      <p className="lead">Добавь сон, работу, учёбу и другие дела. Узнай, сколько времени остаётся для себя.</p></div>
      <button className="primary" onClick={() => openForm(suggestedActivity(selectedDay, activities))}>＋ Добавить активность</button></section>

    <section id="plan" aria-labelledby="plan-title"><div className="section-heading"><h2 id="plan-title">Моя неделя</h2>
      <span>Выбери день, чтобы увидеть его план</span></div>
      <div className="mobile-day-tabs" aria-label="Дни недели">{DAYS.map((day, index) => <button key={day}
        type="button" aria-pressed={selectedDay === index} aria-controls="day-details"
        className={selectedDay === index ? 'selected' : ''} onClick={() => setSelectedDay(index)}>{day}</button>)}</div>
      <div className="day-grid" aria-label="Дни недели">{DAYS.map((name, index) => {
        const items = cardItems(visualSegments, index);
        const total = result?.days[index];
        return <button key={name} className={`day-card ${selectedDay === index ? 'selected' : ''}`}
          aria-pressed={selectedDay === index} aria-controls="day-details" onClick={() => setSelectedDay(index)}>
          <span className="day-card-heading"><strong>{name}</strong><span aria-hidden="true">{selectedDay === index ? '⌃' : '⌄'}</span></span>
          <span className="day-card-activities">{items.length ? items.slice(0, 3).map((item, itemIndex) =>
            <span className="day-card-activity" key={`${item.title}-${itemIndex}`}>
              <CategoryIcon kind={item.category} size={16} />
              <span className="day-card-name">{item.title}</span><b>{formatMinutes(item.minutes)}</b></span>)
            : <span className="day-card-empty">Пока нет занятий</span>}
            {items.length > 3 && <small>Ещё {items.length - 3}</small>}</span>
          <span className="day-card-footer"><span className={`free-ring${total ? '' : ' pending'}`} aria-hidden="true" />
            <span><small>Свободно</small><strong>{total ? formatMinutes(total.freeMinutes) : 'После расчёта'}</strong>
              {total && resultIsOld && <small>прошлый расчёт</small>}</span></span></button>;
      })}</div>
      <div className="workspace"><section id="day-details" className="panel day-panel" aria-labelledby="day-title">
        <div className="panel-heading"><div><p className="eyebrow">ПЛАН НА ДЕНЬ</p><h2 id="day-title">{DAYS[selectedDay]}</h2></div>
          <button className="secondary" onClick={() => openForm(suggestedActivity(selectedDay, activities))}>＋ Добавить</button></div>
        {dayActivities.length > 0 && <p className="day-context">Записей на этот день: {dayActivities.length}</p>}
        {!dayActivities.length && segments.length > 0 && <p className="day-context">Занятие продолжается с предыдущего дня.</p>}
        {segments.length ? <TimeBlocks segments={segments} activities={activities} onEdit={openForm} />
          : <div className="empty-plan"><p>Этот день пока свободен.</p><button className="secondary" onClick={() => openForm(suggestedActivity(selectedDay, activities))}>Добавить занятие</button></div>}
        {!preview.ok && <p className="timeline-note" role="status">В расписании есть пересечения. Блоки показаны, но итог появится после исправления ошибок.</p>}
        {segments.length > 0 && <p className="timeline-hint">Нажми на блок, чтобы изменить занятие.</p>}
        {dayActivities.length > 0 && <div className="day-entries"><h3>Занятия дня</h3>
          {dayActivities.map(item => <div className="day-entry" key={item.id}>
            <CategoryIcon kind={item.category} size={17} />
            <span>{item.title}<small>{item.start}–{item.end}{item.category === 'sleep' && item.end < item.start
              ? ` · ночь на ${DAYS[selectedDay]}` : item.end < item.start ? ' · до следующего дня' : ''}</small></span>
            <button className="text-button" onClick={() => openForm(item, selectedDay)}>Изменить</button></div>)}</div>}
      </section><ActivityForm key={`${editing.id || 'new'}-${formVersion}`} initial={editing} fixedDay={editingDay} selectedDay={selectedDay} onSave={saveActivity}
        onCancel={() => closeForm()} onDelete={editing.id ? () => deleteActivity(editing) : undefined} />
      <aside id="results" className="panel summary" aria-labelledby="summary-title"><p className="eyebrow">БАЛАНС НЕДЕЛИ</p>
        <h2 id="summary-title">Свободное время</h2>{result ? <>
          <div className="donut-row"><div className="donut" style={{ '--free-percent': `${result.weeklyFreeMinutes / 10080 * 100}%` } as React.CSSProperties}>
            <span><strong>{formatMinutes(result.weeklyFreeMinutes)}</strong><small>свободно</small></span></div>
            <div className="donut-caption"><strong>{Math.round(result.weeklyFreeMinutes / 10080 * 100)}%</strong><span>недели<br />для себя</span></div></div>
          {result.overlapMinutes > 0 && <p className="overlap-note">Совмещено {formatMinutes(result.overlapMinutes)}. Эти минуты учтены один раз.</p>}
          {resultIsOld && <p className="outdated" role="status">План изменён — рассчитай снова.</p>}
          <h3>Свободно по дням</h3><div className="week-bars">{result.days.map((day, index) => <div className="week-bar-item" key={index}>
            <strong>{formatMinutes(day.freeMinutes)}</strong><div className="week-bar-track"><span style={{ height: `${day.freeMinutes / 1440 * 100}%` }} /></div><small>{DAYS[index]}</small>
          </div>)}</div>
          <h3>Структура недели</h3><div className="category-grid">{Object.entries(result.categories).filter(([, minutes]) => minutes > 0)
            .map(([key, minutes]) => <div className="category-row" key={key}>
              <CategoryIcon kind={key as Category | 'travel' | 'free'} size={16} /><span>{LABELS[key as Category | 'travel' | 'free']}</span>
              <strong>{formatMinutes(minutes)}</strong><div className="category-bar" aria-hidden="true"><span className={`category-${key}`} style={{ width: `${minutes / 10080 * 100}%` }} /></div>
            </div>)}</div></>
          : <div className="summary-empty"><span className="summary-placeholder" aria-hidden="true" /><p>Добавь занятия и рассчитай неделю. Здесь появится итог.</p></div>}
        <button className="primary calculate" onClick={calculate}>Рассчитать неделю</button>
        {errors.length > 0 && <div className="errors" role="alert"><strong>Не удалось рассчитать неделю</strong>
          <ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
      </aside></div></section>
    <footer className="site-footer"><p>Расписание сохраняется только в этом браузере.</p>
      <button className="text-button danger" onClick={clearActivities} disabled={!activities.length}>Очистить расписание</button></footer>
  </main>;
}

type ActivityFormProps = { initial: Activity; fixedDay: number | null; selectedDay: number;
  onSave: (item: Activity) => void; onCancel: () => void; onDelete?: () => void };
function ActivityForm({ initial, fixedDay, selectedDay, onSave, onCancel, onDelete }: ActivityFormProps) {
  const [item, setItem] = useState(initial), [message, setMessage] = useState('');
  const [returnTravelEdited, setReturnTravelEdited] = useState(initial.travelBeforeMinutes !== initial.travelAfterMinutes);
  const [timeEdited, setTimeEdited] = useState(Boolean(initial.id));
  const [titleEdited, setTitleEdited] = useState(initial.title !== DEFAULTS[initial.category].title);
  const [daysEdited, setDaysEdited] = useState(Boolean(initial.id));
  const [modeEdited, setModeEdited] = useState(Boolean(initial.id) && initial.category !== 'sleep');
  const dialogRef = useRef<HTMLFormElement>(null), messageRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (message) messageRef.current?.focus(); }, [message]);
  function update(changes: Partial<Activity>) { setItem(current => ({ ...current, ...changes })); setMessage(''); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item.days.length) { setMessage('Выбери хотя бы один день недели.'); return; }
    if (!item.start || !item.end || item.start === item.end) { setMessage('Укажи разное время начала и окончания.'); return; }
    if (item.category !== 'sleep' && !item.title.trim()) { setMessage('Введи название занятия.'); return; }
    if (!Number.isInteger(item.travelBeforeMinutes) || !Number.isInteger(item.travelAfterMinutes)
      || item.travelBeforeMinutes < 0 || item.travelAfterMinutes < 0
      || item.travelBeforeMinutes > 240 || item.travelAfterMinutes > 240) {
      setMessage('Время дороги должно быть целым числом от 0 до 240 минут.'); return;
    }
    onSave(item);
  }
  return <form id="activity-form" ref={dialogRef} className="form panel"
    aria-labelledby="form-title" onSubmit={submit}>
    <div className="panel-heading"><h2 id="form-title">{item.id ? 'Изменить занятие' : 'Добавить занятие'}</h2>
      {item.id && <button type="button" className="close-button" onClick={onCancel} aria-label="Закрыть редактирование">×</button>}</div>
    {item.category !== 'sleep' && <label>Название<input value={item.title} required placeholder="Например, спорт или встреча"
      onChange={event => { setTitleEdited(true); update({ title: event.target.value }); }} /></label>}
    <fieldset><legend>Категория</legend><div className="category-picker">{CATEGORIES.map(category => <button type="button" key={category}
      className={item.category === category ? 'picked' : ''} aria-pressed={item.category === category}
      onClick={() => { const preset = DEFAULTS[category];
        const presetDays = category === 'sleep' ? [0, 1, 2, 3, 4, 5, 6]
          : category === 'work' || category === 'study' ? [0, 1, 2, 3, 4] : [selectedDay];
        update({ category, ...(!titleEdited ? { title: preset.title } : {}),
          ...(!timeEdited ? { start: preset.start, end: preset.end } : {}),
          ...(!daysEdited && fixedDay === null ? { days: presetDays } : {}),
          mode: category === 'sleep' ? 'online' : modeEdited ? item.mode : preset.mode,
          travelBeforeMinutes: category === 'sleep' ? 0 : modeEdited ? item.travelBeforeMinutes : preset.travel,
          travelAfterMinutes: category === 'sleep' ? 0 : modeEdited ? item.travelAfterMinutes : preset.travel });
        setReturnTravelEdited(false); }}>
      <CategoryIcon kind={category} size={19} />{LABELS[category]}</button>)}</div></fieldset>
    <fieldset><legend>Дни недели</legend>{fixedDay === null ? <>
      <div className="day-shortcuts"><button type="button" onClick={() => { setDaysEdited(true); update({ days: [selectedDay] }); }}>Этот день</button>
        <button type="button" onClick={() => { setDaysEdited(true); update({ days: [0, 1, 2, 3, 4] }); }}>Будни</button>
        <button type="button" onClick={() => { setDaysEdited(true); update({ days: [0, 1, 2, 3, 4, 5, 6] }); }}>Каждый день</button></div>
      {item.category === 'sleep' && <small className="sleep-day-help">Для сна выбери день, когда просыпаешься.</small>}
      <div className="day-picker">{DAYS.map((name, index) => <button type="button"
      key={name} className={item.days.includes(index) ? 'picked' : ''} aria-pressed={item.days.includes(index)}
      onClick={() => { setDaysEdited(true); update({ days: item.days.includes(index) ? item.days.filter(day => day !== index) : [...item.days, index] }); }}>
      {name}</button>)}</div></> : <p className="edit-day-note">{item.category === 'sleep' ? `Изменения только для ночи на ${DAYS[fixedDay]}.` : `Изменения только для ${DAYS[fixedDay]}.`} Остальные дни сохранят своё время.</p>}</fieldset>
    <div className="form-grid"><label>Начало<input type="time" value={item.start} required
      onChange={event => { setTimeEdited(true); update({ start: event.target.value }); }} /></label>
      <label>Конец<input type="time" value={item.end} required onChange={event => { setTimeEdited(true); update({ end: event.target.value }); }} /></label></div>
    {item.category !== 'sleep' && <fieldset><legend>Формат</legend><div className="mode-picker">
      <label><input type="radio" name="mode" checked={item.mode === 'online'}
        onChange={() => { setModeEdited(true); update({ mode: 'online', travelBeforeMinutes: 0, travelAfterMinutes: 0 }); }} /> Онлайн</label>
      <label><input type="radio" name="mode" checked={item.mode === 'offline'} onChange={() => {
        setModeEdited(true); const travel = item.travelBeforeMinutes || DEFAULTS[item.category].travel;
        update({ mode: 'offline', travelBeforeMinutes: travel, travelAfterMinutes: returnTravelEdited ? item.travelAfterMinutes : travel });
      }} /> Офлайн</label>
    </div></fieldset>}
    {item.category !== 'sleep' && item.mode === 'offline' && <div className="form-grid">
      <label>Дорога туда, мин<input type="number" min="0" max="240" step="1" value={item.travelBeforeMinutes}
        onChange={event => { const value = Number(event.target.value);
          update({ travelBeforeMinutes: value, ...(!returnTravelEdited ? { travelAfterMinutes: value } : {}) }); }} /></label>
      <label>Дорога обратно, мин<input type="number" min="0" max="240" step="1" value={item.travelAfterMinutes}
        onChange={event => { setReturnTravelEdited(true); update({ travelAfterMinutes: Number(event.target.value) }); }} /></label></div>}
    {message && <p ref={messageRef} className="form-error" role="alert" tabIndex={-1}>{message}</p>}
    <div className="form-actions">{item.id && <button type="button" className="text-button" onClick={onCancel}>Отмена</button>}
      {onDelete && <button type="button" className="text-button danger" onClick={onDelete}>Удалить</button>}
      <button className="primary" type="submit">{item.id ? 'Сохранить изменения' : 'Добавить'}</button></div>
  </form>;
}
