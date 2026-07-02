/**
 * Shared date formatting. UK app — en-GB everywhere, so "Tue, 1 Jul 2026"
 * and day-first numeric dates, never the en-US month-first forms.
 */
const LOCALE = 'en-GB';

/** "Tue, 1 Jul 2026" — list names, date pickers. */
export function formatDateLong(date: Date): string {
  return date.toLocaleDateString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "01/07/2026" */
export function formatDateShort(date: Date): string {
  return date.toLocaleDateString(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** "01/07/2026, 14:05" */
export function formatDateTime(date: Date): string {
  return date.toLocaleString(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
