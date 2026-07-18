import { apiKeyDigest } from './keyHash.js';
import type { ApiKeyAuthenticator, ApiPrincipal } from './types.js';
import type { Queryable } from '../database/types.js';

interface ApiKeyRow {
  id: string;
  org_id: string;
  mcp_enabled: boolean;
}

export class PostgresApiKeyAuthenticator implements ApiKeyAuthenticator {
  constructor(
    private readonly database: Queryable,
    private readonly pepper: string,
  ) {
    if (!pepper) throw new Error('api key pepper is required');
  }

  async authenticate(token: string): Promise<ApiPrincipal | null> {
    const digest = apiKeyDigest(token, this.pepper);
    const result = await this.database.query<ApiKeyRow>(
      `select id, org_id, mcp_enabled
       from api_keys
       where key_hash = $1 and revoked_at is null
       limit 2`,
      [digest],
    );
    if (result.rows.length === 0) return null;
    if (result.rows.length !== 1) throw new Error('ambiguous api key digest');
    const row = result.rows[0];
    return { apiKeyId: row.id, orgId: row.org_id, mcpEnabled: row.mcp_enabled };
  }
}
