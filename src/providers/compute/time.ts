import { fail, ok, type Provider } from '../_registry.js';

interface TimeInput {
  at?: string;
  timezone?: string;
}

interface TimeOutput {
  timezone: string;
  utc: string;
  unixSeconds: number;
  local: string;
  offset: string;
}

function zonedIso(date: Date, timezone: string): { local: string; offset: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', timeZoneName: 'longOffset',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const offset = parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName.replace('GMT', '');
  return {
    local: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`,
    offset,
  };
}

/** Convert an instant to any IANA timezone using the runtime timezone database. */
export const timeProvider: Provider<TimeInput, TimeOutput> = {
  id: 'compute.time',
  storagePolicy: 'none',
  source: {
    name: 'IANA Time Zone Database',
    url: 'https://www.iana.org/time-zones',
    license: 'Public domain',
  },
  async execute({ at, timezone = 'UTC' }) {
    const date = at ? new Date(at) : new Date();
    if (Number.isNaN(date.getTime())) return fail('bad_input', 'invalid ISO timestamp');
    try {
      const { local, offset } = zonedIso(date, timezone);
      return ok({
        timezone,
        utc: date.toISOString(),
        unixSeconds: Math.floor(date.getTime() / 1000),
        local,
        offset,
      });
    } catch (error) {
      if (error instanceof RangeError) return fail('bad_input', 'unknown IANA timezone');
      throw error;
    }
  },
};
