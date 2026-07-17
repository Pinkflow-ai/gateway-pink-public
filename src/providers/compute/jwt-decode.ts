import { ok, fail, type Provider } from '../_registry.js';

interface JwtInput {
  token: string;
}
interface JwtOutput {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
}

function decodeSegment(seg: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(seg, 'base64url').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** RFC 7519 decoder. Parse claims only — does NOT verify the signature. */
export const jwtDecodeProvider: Provider<JwtInput, JwtOutput> = {
  id: 'compute.jwt.decode',
  storagePolicy: 'none',
  source: {
    name: 'Pure compute (RFC 7519)',
    url: 'https://www.rfc-editor.org/rfc/rfc7519',
    license: 'Public standard',
  },
  async execute({ token }) {
    const parts = token.trim().split('.');
    if (parts.length < 2) {
      return fail('bad_input', 'not a jwt: expected header.payload[.signature]');
    }
    const header = decodeSegment(parts[0]);
    const payload = decodeSegment(parts[1]);
    if (!header || !payload) {
      return fail('bad_input', 'could not decode jwt segments');
    }
    return ok({ header, payload });
  },
};
