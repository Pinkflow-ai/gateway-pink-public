import { randomUUID, randomFillSync } from 'node:crypto';
import { ok, type Provider } from '../_registry.js';

interface UuidInput {
  version?: 'v4' | 'v7';
  count?: number;
}
interface UuidOutput {
  version: 'v4' | 'v7';
  uuids: string[];
}

/** RFC 9562 v7 — time-ordered, recommended for new systems. */
function uuidV7(): string {
  const buf = new Uint8Array(16);
  randomFillSync(buf);
  const ms = BigInt(Date.now());
  const view = new DataView(buf.buffer);
  // 48-bit unix ts in the high bytes
  view.setUint32(0, Number(ms >> 16n));
  view.setUint16(4, Number(ms & 0xffffn));
  // version + variant bits
  buf[6] = (buf[6] & 0x0f) | 0x70;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const hex = Buffer.from(buf).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** RFC 9562. Pure CPU — uses the runtime CSPRNG. */
export const uuidProvider: Provider<UuidInput, UuidOutput> = {
  id: 'compute.uuid',
  storagePolicy: 'none',
  source: {
    name: 'Pure compute (RFC 9562)',
    url: 'https://www.rfc-editor.org/rfc/rfc9562',
    license: 'Public standard',
  },
  async execute({ version = 'v4', count = 1 }) {
    const n = Math.min(Math.max(1, count), 1000);
    const uuids = Array.from({ length: n }, () =>
      version === 'v7' ? uuidV7() : randomUUID(),
    );
    return ok({ version, uuids });
  },
};
