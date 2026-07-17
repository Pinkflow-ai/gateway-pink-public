import { ok, fail, type Provider } from '../_registry.js';

interface WhoisInput {
  domain: string;
}
interface WhoisOutput {
  domain: string;
  status: 'registered' | 'available' | 'unknown';
  registrar?: string;
  createdAt?: string;
  nameservers?: string[];
}

const RDAP_BOOTSTRAP = 'https://rdap.org/domain';

function pickFirst(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  return (obj as Record<string, unknown>)[key];
}

function findVcard(events: unknown): { created?: string } {
  if (!Array.isArray(events)) return {};
  const created = events.find((e) => (e as Record<string, unknown>).eventAction === 'registration');
  return { created: created ? String(pickFirst(created, 'eventDate')) : undefined };
}

/**
 * RDAP domain lookup (RFC 7483). Direct — queries the rdap.org bootstrap,
 * which redirects to the authoritative registry for the TLD. Public standard;
 * WhoisXML charges ~$26/1K for the same data.
 *
 * Behavior on missing data: a 404 from the registry means the domain is
 * available; any other failure returns `status: unknown` rather than erroring.
 *
 * Payload (the domain) is not stored. Per-route storagePolicy 'metadata-only'
 * because registry responses vary and aren't worth caching.
 */
export const rdapProvider: Provider<WhoisInput, WhoisOutput> = {
  id: 'whois.rdap',
  storagePolicy: 'metadata-only',
  source: {
    name: 'RDAP (RFC 7483)',
    url: 'https://www.rfc-editor.org/info/rfc7483',
    license: 'Public standard',
    notes: 'Uses the rdap.org bootstrap; availability varies by TLD.',
  },
  async execute({ domain }, ctx) {
    const clean = domain.toLowerCase().trim().replace(/\.$/, '');
    if (!clean || !clean.includes('.')) {
      return fail('bad_input', 'not a valid domain');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
    try {
      const res = await fetch(`${RDAP_BOOTSTRAP}/${clean}`, {
        headers: { Accept: 'application/rdap+json', 'User-Agent': ctx.userAgent },
        redirect: 'follow',
        signal: controller.signal,
      });
      if (res.status === 404) {
        return ok({ domain: clean, status: 'available' });
      }
      if (!res.ok) {
        return ok({ domain: clean, status: 'unknown' });
      }
      const body = (await res.json()) as Record<string, unknown>;
      const events = findVcard(body.events);
      const entities = (body.entities ?? []) as Record<string, unknown>[];
      const registrarEntity = entities.find((e) => {
        const roles = (e.roles ?? []) as string[];
        return roles.includes('registrar');
      });
      const nameservers = (body.nameservers ?? []) as Record<string, unknown>[];
      return ok({
        domain: clean,
        status: 'registered',
        registrar: registrarEntity
          ? String(pickFirst(registrarEntity, 'vcardArray') ?? registrarEntity.handle ?? 'unknown')
          : undefined,
        createdAt: events.created,
        nameservers: nameservers.map((n) => String(n.ldhName)).filter(Boolean),
      });
    } catch {
      return fail('upstream_error', 'rdap lookup failed');
    } finally {
      clearTimeout(timer);
    }
  },
};
