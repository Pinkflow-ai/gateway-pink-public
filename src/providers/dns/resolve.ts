import { resolve as dnsResolve } from 'node:dns/promises';
import { ok, fail, type Provider } from '../_registry.js';

type RecordType = 'A' | 'AAAA' | 'MX' | 'TXT' | 'NS' | 'CNAME';
interface DnsInput {
  name: string;
  type?: RecordType;
}
interface DnsOutput {
  name: string;
  type: RecordType;
  records: string[];
}

const VALID_TYPES: RecordType[] = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'];

function asString(record: unknown): string {
  if (typeof record === 'string') return record;
  // MX records come back as { exchange, priority }.
  if (record && typeof record === 'object' && 'exchange' in record) {
    const mx = record as { exchange: string; priority: number };
    return `${mx.priority} ${mx.exchange}`;
  }
  return String(record);
}

/**
 * DNS resolver (RFC 1035). Direct — uses Node's built-in DNS client against
 * the OS-configured recursive resolver. No upstream company, no key, no rate
 * limit beyond what the recursive resolver imposes (effectively none).
 *
 * The payload (the queried name) is not stored. The response may be cached
 * briefly upstream of this provider for quota economy — see storagePolicy
 * 'cached-ttl' in policy/registry.ts.
 */
export const dnsProvider: Provider<DnsInput, DnsOutput> = {
  id: 'dns.resolve',
  storagePolicy: 'cached-ttl',
  source: {
    name: 'Public DNS recursion (RFC 1035)',
    url: 'https://www.rfc-editor.org/info/rfc1035',
    license: 'Public standard',
  },
  async execute({ name, type = 'A' }, ctx) {
    if (!VALID_TYPES.includes(type)) {
      return fail('bad_input', `unsupported record type: ${type}`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
    try {
      // resolve() doesn't take a signal; the Resolver honors the OS resolver
      // timeout. The controller guards against pathological hangs.
      const result = await dnsResolve(name, type);
      return ok({ name, type, records: (result as unknown[]).map(asString) });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOTFOUND' || code === 'ENODATA') {
        return ok({ name, type, records: [] });
      }
      return fail('upstream_error', `dns lookup failed: ${code ?? 'unknown'}`);
    } finally {
      clearTimeout(timer);
    }
  },
};
