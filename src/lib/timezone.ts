export const SCHEDULING_TIMEZONE = process.env.SCHEDULING_TIMEZONE || 'Asia/Beirut';

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function wallClockInTz(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  };
}

function tzOffset(instant: Date, timeZone: string): number {
  const wall = wallClockInTz(instant, timeZone);
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  return instant.getTime() - wallAsUtc;
}

export function parseScheduledTime(value: string, timeZone = SCHEDULING_TIMEZONE): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return new Date(Number.NaN);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? '0');

  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const utcDate = new Date(wallAsUtc);
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() + 1 !== month ||
    utcDate.getUTCDate() !== day ||
    utcDate.getUTCHours() !== hour ||
    utcDate.getUTCMinutes() !== minute ||
    utcDate.getUTCSeconds() !== second
  ) {
    return new Date(Number.NaN);
  }

  const candidate = new Date(wallAsUtc + tzOffset(utcDate, timeZone));
  const instant = new Date(wallAsUtc + tzOffset(candidate, timeZone));
  const wall = wallClockInTz(instant, timeZone);
  if (
    wall.year !== year ||
    wall.month !== month ||
    wall.day !== day ||
    wall.hour !== hour ||
    wall.minute !== minute ||
    wall.second !== second
  ) {
    return new Date(Number.NaN);
  }
  return instant;
}

export function startOfTomorrow(now = new Date(), timeZone = SCHEDULING_TIMEZONE): Date {
  const today = wallClockInTz(now, timeZone);
  const target = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  const targetDay = target.getUTCDate();

  const naiveMidnight = target.getTime();
  const candidate = new Date(naiveMidnight + tzOffset(new Date(naiveMidnight), timeZone));

  for (let step = -6 * 60; step <= 36 * 60; step++) {
    const instant = new Date(candidate.getTime() + step * 60_000);
    const wall = wallClockInTz(instant, timeZone);
    if (wall.year === targetYear && wall.month === targetMonth && wall.day === targetDay) {
      return instant;
    }
  }
  return candidate;
}

export function toLocalDateTimeInput(
  date: Date,
  timeZone = SCHEDULING_TIMEZONE,
): string {
  const wall = wallClockInTz(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}
