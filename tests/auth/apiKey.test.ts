import { describe, expect, it, vi } from 'vitest';
import { apiKeyDigest } from '../../src/auth/keyHash.js';
import { PostgresApiKeyAuthenticator } from '../../src/auth/postgres.js';

describe('production API-key identity', () => {
  it('uses a stable keyed digest without retaining plaintext', () => {
    expect(apiKeyDigest('gp_live_example', 'pepper')).toBe(
      '161987ed60abacff5bdb00ced10c71c425163f83d4d74502f673f55b563acf47',
    );
    expect(apiKeyDigest('gp_live_example', 'another-pepper')).not.toContain('gp_live_example');
  });

  it('resolves only an active key through one indexed digest lookup', async () => {
    const query = vi.fn(async () => ({
      rows: [{ id: 'key-1', org_id: 'org-1', mcp_enabled: true }],
      rowCount: 1,
    }));
    const authenticator = new PostgresApiKeyAuthenticator({ query }, 'pepper');

    await expect(authenticator.authenticate('gp_live_example')).resolves.toEqual({
      apiKeyId: 'key-1',
      orgId: 'org-1',
      mcpEnabled: true,
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain('revoked_at is null');
    expect(query.mock.calls[0]?.[1]).toEqual([
      '161987ed60abacff5bdb00ced10c71c425163f83d4d74502f673f55b563acf47',
    ]);
    expect(JSON.stringify(query.mock.calls)).not.toContain('gp_live_example');
  });

  it('returns null for an unknown or revoked key', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const authenticator = new PostgresApiKeyAuthenticator({ query }, 'pepper');
    await expect(authenticator.authenticate('gp_live_missing')).resolves.toBeNull();
  });

  it('fails closed when the lookup returns an ambiguous digest', async () => {
    const query = vi.fn(async () => ({
      rows: [
        { id: 'key-1', org_id: 'org-1', mcp_enabled: false },
        { id: 'key-2', org_id: 'org-2', mcp_enabled: false },
      ],
      rowCount: 2,
    }));
    const authenticator = new PostgresApiKeyAuthenticator({ query }, 'pepper');
    await expect(authenticator.authenticate('gp_live_duplicate')).rejects.toThrow('ambiguous api key digest');
  });
});
