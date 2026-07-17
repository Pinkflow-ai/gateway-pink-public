import { describe, it, expect } from 'vitest';
import { uuidProvider } from '../../src/providers/compute/uuid.js';

const ctx = { requestId: 't', timeoutMs: 1000, userAgent: 'test' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('uuid', () => {
  it('generates a v4', async () => {
    const r = await uuidProvider.execute({ version: 'v4', count: 1 }, ctx);
    if (r.ok) {
      expect(r.data.uuids).toHaveLength(1);
      expect(r.data.uuids[0]).toMatch(UUID);
      expect(r.data.uuids[0][14]).toBe('4');
    }
  });

  it('v7 starts with the version nibble 7', async () => {
    const r = await uuidProvider.execute({ version: 'v7', count: 1 }, ctx);
    if (r.ok) {
      expect(r.data.uuids[0]).toMatch(UUID);
      expect(r.data.uuids[0][14]).toBe('7');
    }
  });

  it('caps count at 1000', async () => {
    const r = await uuidProvider.execute({ version: 'v4', count: 99999 }, ctx);
    if (r.ok) expect(r.data.uuids).toHaveLength(1000);
  });
});
