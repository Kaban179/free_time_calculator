import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CATEGORIES, calculateWeek, type Activity, type Calculation, type Category, type Segment } from './domain/calculation';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_NAMES = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
const STORAGE_KEY = 'free-time-calculator.activities.v1';
const LABELS: Record<Category | 'travel' | 'free', string> = {
  sleep: 'Сон', work: 'Работа', study: 'Учёба', household: 'Быт', health: 'Здоровье',
  leisure: 'Отдых', other: 'Другое', travel: 'Дорога', free: 'Свободно',
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

function newActivity(day: number): Activity {
  return { id: '', title: 'Сон', category: 'sleep', days: [day], start: '23:00', end: '07:00',
    mode: 'online', travelBeforeMinutes: 0, travelAfterMinutes: 0 };
}

export default function App() {
  const [activities, setActivities] = useState<Activity[]>(readActivities);
  const [selectedDay, setSelectedDay] = useState(0);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [result, setResult] = useState<Calculation | null>(null);
  const [resultIsOld, setResultIsOld] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (activities.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(activities));
    else localStorage.removeItem(STORAGE_KEY);
  }, [activities]);

  const preview = useMemo(() => calculateWeek(activities), [activities]);
  const dayActivities = activities.filter(item => item.days.includes(selectedDay))
    .sort((a, b) => a.start.localeCompare(b.start));
  const segments = preview.ok ? preview.days[selectedDay].segments : [];

  function openForm(activity: Activity) {
    returnFocus.current = document.activeElement as HTMLElement;
    setEditing(activity);
  }
  function closeForm() {
    setEditing(null);
    requestAnimationFrame(() => returnFocus.current?.focus());
  }
  function updateActivities(next: Activity[]) {
    setActivities(next);
    setResultIsOld(result !== null);
    setErrors([]);
  }
  function saveActivity(activity: Activity) {
    const saved: Activity = { ...activity, id: activity.id || crypto.randomUUID(),
      title: activity.category === 'sleep' ? 'Сон' : activity.title.trim(),
      mode: activity.category === 'sleep' ? 'online' : activity.mode,
      travelBeforeMinutes: activity.category === 'sleep' || activity.mode === 'online' ? 0 : activity.travelBeforeMinutes,
      travelAfterMinutes: activity.category === 'sleep' || activity.mode === 'online' ? 0 : activity.travelAfterMinutes };
    updateActivities(activity.id ? activities.map(item => item.id === activity.id ? saved : item) : [...activities, saved]);
    closeForm();
  }
  function deleteActivity(activity: Activity) {
    if (!window.confirm(`Удалить «${activity.title || LABELS[activity.category]}»?`)) return;
    updateActivities(activities.filter(item => item.id !== activity.id));
    closeForm();
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
  }

  return <main className="app">
    <header className="site-header"><div className="brand">◷ <span>Калькулятор<br />свободного времени</span></div>
      <nav aria-label="Основная навигация"><a href="#plan">План</a><a href="#results">Результат</a></nav></header>
    <section className="intro" aria-labelledby="page-title"><div><p className="eyebrow">ТВОЯ ТИПИЧНАЯ НЕДЕЛЯ</p>
      <h1 id="page-title">Оставь место для жизни</h1>
      <p className="lead">Добавь сон, работу, учёбу и другие дела. Узнай, сколько времени остаётся для себя.</p></div>
      <button className="primary" onClick={() => openForm(newActivity(selectedDay))}>＋ Добавить активность</button></section>

    <section id="plan" aria-labelledby="plan-title"><div className="section-heading"><h2 id="plan-title">Моя неделя</h2>
      <span>Выбери день, чтобы увидеть его план</span></div>
      <div className="day-grid" aria-label="Дни недели">{DAYS.map((name, index) => {
        const count = activities.filter(item => item.days.includes(index)).length;
        const total = result?.days[index];
        const categories = total ? Object.entries(total.categories)
          .filter(([, minutes]) => minutes > 0)
          .map(([category]) => LABELS[category as Category | 'travel']).join(', ') : '';
        return <button key={name} className={`day-card ${selectedDay === index ? 'selected' : ''}`}
          aria-pressed={selectedDay === index} onClick={() => setSelectedDay(index)}>
          <strong>{name}</strong><span>{total ? categories || 'Свободный день' : count ? `${count} ${count === 1 ? 'запись' : 'записи'}` : 'Нет записей'}</span>
          <span className="day-free">{total ? formatMinutes(total.freeMinutes) : '—'}</span>
          <small>{total ? (resultIsOld ? 'прошлый расчёт' : 'свободно') : 'после расчёта'}</small></button>;
      })}</div>
      <div className="workspace"><section className="panel day-panel" aria-labelledby="day-title">
        <div className="panel-heading"><div><p className="eyebrow">ПЛАН НА ДЕНЬ</p><h2 id="day-title">{DAYS[selectedDay]}</h2></div>
          <button className="secondary" onClick={() => openForm(newActivity(selectedDay))}>＋ Добавить</button></div>
        <h3>Занятия, начинающиеся в {DAY_NAMES[selectedDay]}</h3>
        {dayActivities.length ? <ul className="activity-list">{dayActivities.map(item => <li key={item.id} className="activity-item">
          <span className={`category-dot category-${item.category}`} aria-hidden="true" />
          <div className="activity-main"><strong>{item.title || LABELS[item.category]}</strong>
            <span>{LABELS[item.category]} · {item.start}–{item.end}{item.end < item.start ? ' (+1 день)' : ''}</span></div>
          <button className="text-button" onClick={() => openForm(item)}>Изменить</button>
          <button className="text-button danger" onClick={() => deleteActivity(item)}>Удалить</button></li>)}</ul>
          : <p className="empty">Пока нет занятий, начинающихся в этот день.</p>}
        <h3>Шкала дня</h3>
        {preview.ok ? (segments.length ? <ol className="timeline">{segments.map((segment: Segment, index) => <li
          key={`${segment.activityId}-${segment.startMinute}-${index}`} className="timeline-row">
          <time>{formatClock(segment.startMinute)}–{formatClock(segment.endMinute)}</time>
          <span className={`category-dot category-${segment.category}`} aria-hidden="true" />
          <span>{segment.category === 'travel' ? `Дорога · ${segment.title}` : segment.title || LABELS[segment.category]}</span>
        </li>)}</ol> : <p className="empty">В этот день пока нет занятых интервалов.</p>)
          : <p className="timeline-note">Исправь пересечения или время занятий, чтобы увидеть точную шкалу.</p>}
      </section><aside className="panel summary" aria-labelledby="summary-title"><p className="eyebrow">БАЛАНС НЕДЕЛИ</p>
        <h2 id="summary-title">Свободное время</h2>{result ? <>
          {resultIsOld && <p className="outdated" role="status">Предыдущий расчёт. План изменён — рассчитай снова.</p>}
          <div className="big-number">{formatMinutes(result.weeklyFreeMinutes)}</div><p>свободно за неделю</p>
          <div className="balance-bar" aria-label={`${formatMinutes(result.weeklyFreeMinutes)} свободно из 168 часов`}>
            <span style={{ width: `${result.weeklyFreeMinutes / 10080 * 100}%` }} /></div>
          <p><strong>{formatMinutes(result.weeklyOccupiedMinutes)}</strong> занято</p></>
          : <p className="empty">Добавь занятия или рассчитай пустую неделю, чтобы увидеть итог.</p>}</aside></div></section>

    <div className="actions"><button className="primary calculate" onClick={calculate}>Рассчитать неделю</button>
      <button className="text-button danger" onClick={clearActivities} disabled={!activities.length}>Очистить расписание</button></div>
    {errors.length > 0 && <div className="errors" role="alert"><strong>Не удалось рассчитать неделю</strong>
      <ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}

    <section id="results" className="panel result" aria-labelledby="results-title"><div className="panel-heading"><div>
      <p className="eyebrow">ИТОГ</p><h2 id="results-title">Как устроена твоя неделя</h2></div></div>
      {result ? <>{resultIsOld && <p className="outdated" role="status">Показан предыдущий расчёт. Расписание изменилось.</p>}
        <div className="result-totals"><div><span>Свободно</span><strong>{formatMinutes(result.weeklyFreeMinutes)}</strong></div>
          <div><span>Занято</span><strong>{formatMinutes(result.weeklyOccupiedMinutes)}</strong></div></div>
        <h3>По дням</h3><div className="day-results">{result.days.map((total, index) => <div className="day-result" key={index}>
          <strong>{DAYS[index]}</strong><div className="day-result-bar" aria-hidden="true">
            <span style={{ width: `${total.occupiedMinutes / 1440 * 100}%` }} /></div>
          <span>Занято {formatMinutes(total.occupiedMinutes)}</span><span>Свободно {formatMinutes(total.freeMinutes)}</span>
        </div>)}</div>
        <h3>Структура недели</h3><div className="category-grid">
          {Object.entries(result.categories).filter(([, minutes]) => minutes > 0).map(([key, minutes]) => <div className="category-row" key={key}>
            <span className={`category-dot category-${key}`} aria-hidden="true" />
            <span>{LABELS[key as Category | 'travel' | 'free']}</span>
            <div className="category-bar" aria-hidden="true"><span style={{ width: `${minutes / 10080 * 100}%` }} /></div>
            <strong>{formatMinutes(minutes)}</strong></div>)}</div></>
        : <p className="empty">Здесь появятся итоги по дням и категориям после расчёта.</p>}</section>
    <p className="privacy-note">Расписание сохраняется только в этом браузере. Очистить его можно в любой момент.</p>
    {editing && <ActivityForm key={editing.id || 'new'} initial={editing} onSave={saveActivity}
      onCancel={closeForm} onDelete={editing.id ? () => deleteActivity(editing) : undefined} />}
  </main>;
}

type ActivityFormProps = { initial: Activity; onSave: (item: Activity) => void; onCancel: () => void; onDelete?: () => void };
function ActivityForm({ initial, onSave, onCancel, onDelete }: ActivityFormProps) {
  const [item, setItem] = useState(initial), [message, setMessage] = useState('');
  const dialogRef = useRef<HTMLFormElement>(null), messageRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);
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
  return <div className="modal-backdrop"><form ref={dialogRef} className="form panel" role="dialog"
    aria-modal="true" aria-labelledby="form-title" onSubmit={submit}>
    <div className="panel-heading"><h2 id="form-title">{item.id ? 'Изменить занятие' : 'Добавить занятие'}</h2>
      <button type="button" className="close-button" onClick={onCancel} aria-label="Закрыть форму">×</button></div>
    <label>Категория<select value={item.category} onChange={event => {
      const category = event.target.value as Category;
      update({ category, title: category === 'sleep' ? 'Сон' : item.category === 'sleep' ? '' : item.title,
        mode: category === 'sleep' ? 'online' : item.mode,
        travelBeforeMinutes: category === 'sleep' ? 0 : item.travelBeforeMinutes,
        travelAfterMinutes: category === 'sleep' ? 0 : item.travelAfterMinutes });
    }}>{CATEGORIES.map(category => <option key={category} value={category}>{LABELS[category]}</option>)}</select></label>
    {item.category !== 'sleep' && <label>Название<input value={item.title} required placeholder="Например, спорт или встреча"
      onChange={event => update({ title: event.target.value })} /></label>}
    <fieldset><legend>Дни недели</legend><div className="day-picker">{DAYS.map((name, index) => <button type="button"
      key={name} className={item.days.includes(index) ? 'picked' : ''} aria-pressed={item.days.includes(index)}
      onClick={() => update({ days: item.days.includes(index) ? item.days.filter(day => day !== index) : [...item.days, index] })}>
      {name}</button>)}</div></fieldset>
    <div className="form-grid"><label>Начало<input type="time" value={item.start} required
      onChange={event => update({ start: event.target.value })} /></label>
      <label>Конец<input type="time" value={item.end} required onChange={event => update({ end: event.target.value })} /></label></div>
    {item.category !== 'sleep' && <fieldset><legend>Формат</legend><div className="mode-picker">
      <label><input type="radio" name="mode" checked={item.mode === 'online'}
        onChange={() => update({ mode: 'online', travelBeforeMinutes: 0, travelAfterMinutes: 0 })} /> Онлайн</label>
      <label><input type="radio" name="mode" checked={item.mode === 'offline'} onChange={() => update({ mode: 'offline' })} /> Офлайн</label>
    </div></fieldset>}
    {item.category !== 'sleep' && item.mode === 'offline' && <div className="form-grid">
      <label>Дорога туда, мин<input type="number" min="0" max="240" step="1" value={item.travelBeforeMinutes}
        onChange={event => update({ travelBeforeMinutes: Number(event.target.value) })} /></label>
      <label>Дорога обратно, мин<input type="number" min="0" max="240" step="1" value={item.travelAfterMinutes}
        onChange={event => update({ travelAfterMinutes: Number(event.target.value) })} /></label></div>}
    {message && <p ref={messageRef} className="form-error" role="alert" tabIndex={-1}>{message}</p>}
    <div className="form-actions"><button type="button" className="text-button" onClick={onCancel}>Отмена</button>
      {onDelete && <button type="button" className="text-button danger" onClick={onDelete}>Удалить</button>}
      <button className="primary" type="submit">{item.id ? 'Сохранить изменения' : 'Добавить'}</button></div>
  </form></div>;
}
