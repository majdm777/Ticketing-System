import { SCHEDULING_TIMEZONE } from './timezone';

export function formatDate(date: Date | null, locale = 'en'): string {
  if (!date) {
    return '-';
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: SCHEDULING_TIMEZONE,
  }).format(date);
}
