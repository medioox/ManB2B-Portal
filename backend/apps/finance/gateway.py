"""Payment gateway adapters (Zarinpal-compatible API + a mock for dev/demo)."""
import json
import secrets
import urllib.request

from django.conf import settings


class MockGateway:
    name = "mock"

    def request(self, payment, callback_url):
        authority = "MOCK" + secrets.token_hex(8).upper()
        return authority, f"{settings.FRONTEND_URL}/pay/mock?authority={authority}&amount={int(payment.amount)}"

    def verify(self, payment, params):
        if params.get("Status") == "OK":
            return True, "MREF" + secrets.token_hex(4).upper()
        return False, ""


class ZarinpalGateway:
    name = "zarinpal"
    BASE = "https://payment.zarinpal.com/pg/v4/payment"

    def _post(self, path, payload):
        req = urllib.request.Request(f"{self.BASE}/{path}.json", data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as r:  # noqa: S310
            return json.loads(r.read())

    def request(self, payment, callback_url):
        res = self._post("request", {
            "merchant_id": settings.PAYMENT_MERCHANT_ID, "amount": int(payment.amount),
            "callback_url": callback_url, "description": f"پرداخت پرتال مَن #{payment.id}",
        })
        authority = res["data"]["authority"]
        return authority, f"https://payment.zarinpal.com/pg/StartPay/{authority}"

    def verify(self, payment, params):
        if params.get("Status") != "OK":
            return False, ""
        res = self._post("verify", {"merchant_id": settings.PAYMENT_MERCHANT_ID, "amount": int(payment.amount),
                                    "authority": payment.authority})
        data = res.get("data") or {}
        return data.get("code") in (100, 101), str(data.get("ref_id", ""))


def get_gateway():
    return {"zarinpal": ZarinpalGateway}.get(settings.PAYMENT_GATEWAY, MockGateway)()
