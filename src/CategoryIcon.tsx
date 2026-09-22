import type { Category } from './domain/calculation';

type Kind = Category | 'travel' | 'free';

export function CategoryIcon({ kind, size = 17 }: { kind: Kind; size?: number }) {
  const shared = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    className: `category-icon category-${kind}`, 'aria-hidden': true as const };
  switch (kind) {
    case 'sleep': return <svg {...shared}><path d="M20.4 15.5A8.5 8.5 0 0 1 8.5 3.6 8.6 8.6 0 1 0 20.4 15.5Z" /></svg>;
    case 'work': return <svg {...shared}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12c4 3 14 3 18 0M11 14h2" /></svg>;
    case 'study': return <svg {...shared}><path d="M12 6c-2.5-2-5.5-2.5-9-2v14c3.5-.5 6.5 0 9 2 2.5-2 5.5-2.5 9-2V4c-3.5-.5-6.5 0-9 2ZM12 6v14" /></svg>;
    case 'household': return <svg {...shared}><path d="m3 11 9-7 9 7v9H3v-9ZM9 20v-6h6v6" /></svg>;
    case 'health': return <svg {...shared}><path d="M20.8 8.5c0 5-8.8 11.5-8.8 11.5S3.2 13.5 3.2 8.5a4.5 4.5 0 0 1 8.8-1.3 4.5 4.5 0 0 1 8.8 1.3Z" /><path d="M7 11h3l1.5-2.5L13 13l1.5-2H17" /></svg>;
    case 'leisure': return <svg {...shared}><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></svg>;
    case 'travel': return <svg {...shared}><path d="M5 16 7 8a2 2 0 0 1 2-1h6a2 2 0 0 1 2 1l2 8M4 16h16v3H4zM5 12h14M7 19v2m10-2v2" /></svg>;
    case 'free': return <svg {...shared}><circle cx="12" cy="12" r="4" /><path d="M12 1.5v2m0 17v2M1.5 12h2m17 0h2M4.6 4.6 6 6m12 12 1.4 1.4m0-14.8L18 6M6 18l-1.4 1.4" /></svg>;
    case 'other': return <svg {...shared}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
  }
}
