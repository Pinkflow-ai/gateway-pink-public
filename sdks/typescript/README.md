# Gateway.pink TypeScript SDK

Generated, dependency-free client for every customer API operation.

```ts
import { GatewayClient } from '@gateway-pink/sdk';

const gateway = new GatewayClient({ apiKey: process.env.GATEWAY_API_KEY! });
const digest = await gateway.computeHash({ input: 'hello', algorithm: 'sha256' });
const validation = await gateway.emailValidate(
  { email: 'dev@example.com' },
  { idempotencyKey: crypto.randomUUID(), maxCredits: 17 },
);
```

Paid methods require an idempotency key. `maxCredits` rejects a request locally
when the published reservation ceiling exceeds the caller's budget; AI requests
also send that ceiling as `max_credits` to the API.
