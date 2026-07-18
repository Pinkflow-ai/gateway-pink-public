import { isIP } from 'node:net';
import { resolve as dnsResolve } from 'node:dns/promises';
import { ok, fail, type Provider } from '../_registry.js';
import { TtlCache } from '../../lib/ttlCache.js';

type RecordType = 'A' | 'AAAA' | 'MX' | 'TXT' | 'NS' | 'CNAME';
interface DnsInput { name: string; type?: RecordType }
interface DnsOutput { name: string; type: RecordType; records: string[]; ttl: number }
type Resolver = (name: string, type: RecordType) => Promise<unknown[]>;

const VALID_TYPES: RecordType[] = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'];

function asString(record: unknown): string {
  if (typeof record === 'string') return record;
  if (Array.isArray(record)) return record.join('');
  if (record && typeof record === 'object' && 'exchange' in record) {
    const mx = record as { exchange: string; priority: number };
    return `${mx.priority} ${mx.exchange}`;
  }
  return String(record);
}

function publicDnsName(value: string): string | null {
  const name = value.trim().toLowerCase().replace(/\.$/, '');
  if (!name.includes('.') || isIP(name)) return null;
  if (/(?:^|\.)(?:localhost|local|internal|lan|home)$/.test(name)) return null;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) return null;
  return name;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('dns timeout'), { code: 'ETIMEDOUT' })), timeoutMs);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

export function createDnsProvider(
  resolver: Resolver = (name, type) => dnsResolve(name, type) as Promise<unknown[]>,
  cache = new TtlCache<DnsOutput>(1_000),
): Provider<DnsInput, DnsOutput> {
  return {
    id: 'dns.resolve',
    storagePolicy: 'cached-ttl',
    source: { name: 'Public DNS recursion (RFC 1035)', url: 'https://www.rfc-editor.org/info/rfc1035', license: 'Public standard' },
    async execute({ name: rawName, type = 'A' }, ctx) {
      if (!VALID_TYPES.includes(type)) return fail('bad_input', `unsupported record type: ${type}`);
      const name = publicDnsName(rawName);
      if (!name) return fail('bad_input', 'name must be a public multi-label DNS name');
      const key = `${type}:${name}`;
      const cached = cache.get(key);
      if (cached) return ok(cached);
      try {
        const result = await withTimeout(resolver(name, type), ctx.timeoutMs);
        const data = { name, type, records: result.map(asString), ttl: 60 };
        cache.set(key, data, 60_000);
        return ok(data);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOTFOUND' || code === 'ENODATA') {
          const data = { name, type, records: [], ttl: 60 };
          cache.set(key, data, 60_000);
          return ok(data);
        }
        if (code === 'ETIMEDOUT' || (error as Error).name === 'TimeoutError') {
          return fail('upstream_timeout', 'dns lookup timed out');
        }
        return fail('upstream_error', `dns lookup failed: ${code ?? 'unknown'}`);
      }
    },
  };
}

export const dnsProvider = createDnsProvider();
