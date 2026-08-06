export const SCHEDULING_TIMEZONE = process.env.SCHEDULING_TIMEZONE || 'Asia/Beirut';

function tzOffset(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return instant.getTime() - wallAsUtc;
}

export function parseScheduledTime(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return new Date(Number.NaN);
  }
  const wallAsUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? '0'),
  );
  return new Date(wallAsUtc + tzOffset(new Date(wallAsUtc)));
}

export function startOfTomorrow(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const year = part('year');
  const month = part('month');
  const day = part('day');
  const noonProbe = new Date(Date.UTC(year, month - 1, day + 1, 12));
  const midnightUtc = Date.UTC(year, month - 1, day + 1);
  return new Date(midnightUtc + tzOffset(noonProbe));
}

export function toLocalDateTimeInput(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
