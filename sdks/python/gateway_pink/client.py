# Generated from config/pricing.manifest.json. Do not edit by hand.
import json
from urllib import error, parse, request

OPERATIONS = {
  "computeDummy": {
    "method": "GET",
    "path": "/v1/compute/dummy",
    "paid": False,
    "creditCeiling": 0
  },
  "computePassword": {
    "method": "GET",
    "path": "/v1/compute/password",
    "paid": False,
    "creditCeiling": 0
  },
  "computeTime": {
    "method": "GET",
    "path": "/v1/compute/time",
    "paid": False,
    "creditCeiling": 0
  },
  "computeUa": {
    "method": "GET",
    "path": "/v1/compute/ua",
    "paid": False,
    "creditCeiling": 0
  },
  "computeUuid": {
    "method": "GET",
    "path": "/v1/compute/uuid",
    "paid": False,
    "creditCeiling": 0
  },
  "currencyConvert": {
    "method": "GET",
    "path": "/v1/currency/convert",
    "paid": False,
    "creditCeiling": 0
  },
  "dnsResolve": {
    "method": "GET",
    "path": "/v1/dns/resolve",
    "paid": False,
    "creditCeiling": 0
  },
  "phoneLookup": {
    "method": "GET",
    "path": "/v1/phone/lookup",
    "paid": True,
    "creditCeiling": 40
  },
  "phoneValidate": {
    "method": "GET",
    "path": "/v1/phone/validate",
    "paid": False,
    "creditCeiling": 0
  },
  "weather": {
    "method": "GET",
    "path": "/v1/weather",
    "paid": False,
    "creditCeiling": 0
  },
  "whoisLookup": {
    "method": "GET",
    "path": "/v1/whois/lookup",
    "paid": False,
    "creditCeiling": 0
  },
  "aiSummarize": {
    "method": "POST",
    "path": "/v1/ai/summarize",
    "paid": True,
    "creditCeiling": 100
  },
  "browserMarkdown": {
    "method": "POST",
    "path": "/v1/browser/markdown",
    "paid": True,
    "creditCeiling": 3
  },
  "browserPdf": {
    "method": "POST",
    "path": "/v1/browser/pdf",
    "paid": True,
    "creditCeiling": 6
  },
  "browserScreenshot": {
    "method": "POST",
    "path": "/v1/browser/screenshot",
    "paid": True,
    "creditCeiling": 6
  },
  "computeBase64": {
    "method": "POST",
    "path": "/v1/compute/base64",
    "paid": False,
    "creditCeiling": 0
  },
  "computeColor": {
    "method": "POST",
    "path": "/v1/compute/color",
    "paid": False,
    "creditCeiling": 0
  },
  "computeCsv": {
    "method": "POST",
    "path": "/v1/compute/csv",
    "paid": False,
    "creditCeiling": 0
  },
  "computeHash": {
    "method": "POST",
    "path": "/v1/compute/hash",
    "paid": False,
    "creditCeiling": 0
  },
  "computeHmac": {
    "method": "POST",
    "path": "/v1/compute/hmac",
    "paid": False,
    "creditCeiling": 0
  },
  "computeHtml": {
    "method": "POST",
    "path": "/v1/compute/html",
    "paid": False,
    "creditCeiling": 0
  },
  "computeJson": {
    "method": "POST",
    "path": "/v1/compute/json",
    "paid": False,
    "creditCeiling": 0
  },
  "computeJsonSchema": {
    "method": "POST",
    "path": "/v1/compute/json-schema",
    "paid": False,
    "creditCeiling": 0
  },
  "computeJwtDecode": {
    "method": "POST",
    "path": "/v1/compute/jwt/decode",
    "paid": False,
    "creditCeiling": 0
  },
  "computeQr": {
    "method": "POST",
    "path": "/v1/compute/qr",
    "paid": False,
    "creditCeiling": 0
  },
  "computeSlug": {
    "method": "POST",
    "path": "/v1/compute/slug",
    "paid": False,
    "creditCeiling": 0
  },
  "computeTextStats": {
    "method": "POST",
    "path": "/v1/compute/text-stats",
    "paid": False,
    "creditCeiling": 0
  },
  "computeUnits": {
    "method": "POST",
    "path": "/v1/compute/units",
    "paid": False,
    "creditCeiling": 0
  },
  "computeUrl": {
    "method": "POST",
    "path": "/v1/compute/url",
    "paid": False,
    "creditCeiling": 0
  },
  "emailValidate": {
    "method": "POST",
    "path": "/v1/email/validate",
    "paid": True,
    "creditCeiling": 17
  },
  "screenshot": {
    "method": "POST",
    "path": "/v1/screenshot",
    "paid": True,
    "creditCeiling": 45
  },
  "securityPasswordExposure": {
    "method": "POST",
    "path": "/v1/security/password-exposure",
    "paid": False,
    "creditCeiling": 0
  }
}


class GatewayError(Exception):
    def __init__(self, status, payload):
        super().__init__(f"Gateway request failed with HTTP {status}")
        self.status = status
        self.payload = payload


class GatewayClient:
    def __init__(self, api_key, base_url="https://api.gateway.pink", timeout=30):
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def call(self, operation_id, input=None, *, idempotency_key=None, max_credits=None):
        operation = OPERATIONS[operation_id]
        values = dict(input or {})
        if operation["paid"] and not idempotency_key:
            raise ValueError("idempotency_key is required for paid operations")
        if max_credits is not None:
            if not isinstance(max_credits, int) or max_credits < 1:
                raise ValueError("max_credits must be a positive integer")
            if operation["creditCeiling"] > max_credits:
                raise ValueError(f"operation credit ceiling {operation['creditCeiling']} exceeds max_credits")
        if operation_id == "aiSummarize" and max_credits is not None:
            values["max_credits"] = min(int(values.get("max_credits", max_credits)), max_credits)
        url = self.base_url + operation["path"]
        headers = {"Authorization": "Bearer " + self.api_key}
        data = None
        if operation["method"] == "GET":
            if values:
                url += "?" + parse.urlencode(values)
        else:
            headers["Content-Type"] = "application/json"
            data = json.dumps(values).encode("utf-8")
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        outgoing = request.Request(url, data=data, headers=headers, method=operation["method"])
        try:
            with request.urlopen(outgoing, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as failure:
            try:
                payload = json.loads(failure.read().decode("utf-8"))
            except Exception:
                payload = None
            raise GatewayError(failure.code, payload) from failure

    def compute_dummy(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeDummy", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_password(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computePassword", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_time(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeTime", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_ua(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeUa", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_uuid(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeUuid", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def currency_convert(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("currencyConvert", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def dns_resolve(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("dnsResolve", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def phone_lookup(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("phoneLookup", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def phone_validate(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("phoneValidate", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def weather(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("weather", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def whois_lookup(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("whoisLookup", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def ai_summarize(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("aiSummarize", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def browser_markdown(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("browserMarkdown", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def browser_pdf(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("browserPdf", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def browser_screenshot(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("browserScreenshot", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_base64(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeBase64", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_color(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeColor", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_csv(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeCsv", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_hash(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeHash", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_hmac(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeHmac", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_html(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeHtml", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_json(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeJson", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_json_schema(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeJsonSchema", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_jwt_decode(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeJwtDecode", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_qr(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeQr", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_slug(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeSlug", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_text_stats(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeTextStats", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_units(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeUnits", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def compute_url(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("computeUrl", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def email_validate(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("emailValidate", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def screenshot(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("screenshot", input, idempotency_key=idempotency_key, max_credits=max_credits)

    def security_password_exposure(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("securityPasswordExposure", input, idempotency_key=idempotency_key, max_credits=max_credits)

