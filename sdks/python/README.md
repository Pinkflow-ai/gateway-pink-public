# Gateway.pink Python SDK

Generated client using only the Python standard library.

```python
from gateway_pink import GatewayClient

gateway = GatewayClient(api_key="gp_live_...")
digest = gateway.compute_hash({"input": "hello", "algorithm": "sha256"})
validation = gateway.email_validate(
    {"email": "dev@example.com"},
    idempotency_key="email-1",
    max_credits=17,
)
```
