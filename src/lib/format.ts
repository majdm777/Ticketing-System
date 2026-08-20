import { SCHEDULING_TIMEZONE } from './timezone';

export function formatDate(date: Date | null): string {
  if (!date) {
    return '-';
  }
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: SCHEDULING_TIMEZONE,
  }).format(date);
}
