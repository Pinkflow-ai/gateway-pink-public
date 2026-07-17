import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_POLICIES } from '../src/policy/registry.js';
import { PAYLOAD_LOG_FIELDS } from '../src/lib/payloadFields.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every .ts file under the compute route + provider trees. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

// Modules a 'none' route must never pull in. If any of these appear in a
// compute-only file, the guard test fails — those are the things that persist
// bytes (a database, a cache, an http write to our own store).
const FORBIDDEN_IMPORTS = [
  'pg',
  'postgres',
  'ioredis',
  'redis',
  'node:fs', // no disk writes from compute routes
  'aws-sdk',
  '@aws-sdk',
  'mongodb',
  'kafkajs',
];

const computeFiles = [
  ...listFiles(join(root, 'src', 'routes', 'compute')),
  ...listFiles(join(root, 'src', 'providers', 'compute')),
];

function sourceOf(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('no-payload guard (compute-only routes)', () => {
  it('has compute files to check', () => {
    expect(computeFiles.length).toBeGreaterThan(0);
  });

  it('every compute route is tagged storagePolicy none', () => {
    const computeRoutes = ROUTE_POLICIES.filter((r) => r.route.includes('/compute/'));
    for (const r of computeRoutes) {
      expect(r.storagePolicy).toBe('none');
      expect(r.storesPayload).toBe(false);
    }
  });

  for (const file of computeFiles) {
    const rel = file.replace(root + '/', '');
    const src = sourceOf(file);

    it(`${rel} does not import a persistence client`, () => {
      for (const bad of FORBIDDEN_IMPORTS) {
        // match `from 'pg'` / `from "redis"` / dynamic import('pg')
        const re = new RegExp(`from\\s+['"\`]${bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, '');
        const dyn = new RegExp(`import\\s*\\(\\s*['"\`]${bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, '');
        expect(src.match(re) ?? src.match(dyn), `forbidden import of ${bad}`).toBeNull();
      }
    });

    it(`${rel} does not log a payload field`, () => {
      // Look for log calls whose object literal includes a payload-like key.
      // Catches `log.info({ input: ... })`, `log.debug({ body })`, etc.
      const logCall = /\b(log|logger|requestLogger)\.[a-z]+\s*\(\s*\{([^}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = logCall.exec(src)) !== null) {
        const keys = m[1];
        for (const field of PAYLOAD_LOG_FIELDS) {
          expect(keys, `logs ${field} from ${rel}`).not.toMatch(
            new RegExp(`\\b${field}\\s*:`),
          );
        }
      }
    });

    it(`${rel} does not echo the raw request body back`, () => {
      // Routes may READ req.body (they have to, to parse input). What they must
      // not do is write the body back out or stash it. This catches
      // `reply.send(req.body)` and the like.
      expect(src).not.toMatch(/reply\.(send|serialize)\s*\(\s*req\.body/);
    });
  }
});
