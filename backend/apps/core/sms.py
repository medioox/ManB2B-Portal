"""SMS provider adapter. Swap the backend via SMS_BACKEND without touching callers."""
import json
import logging
import urllib.parse
import urllib.request

from django.conf import settings

log = logging.getLogger(__name__)


class ConsoleBackend:
    def send(self, phone, text):
        log.info("SMS to %s: %s", phone, text)
        return True


class KavenegarBackend:
    def send(self, phone, text):
        url = f"https://api.kavenegar.com/v1/{settings.SMS_API_KEY}/sms/send.json"
        data = urllib.parse.urlencode({"receptor": phone, "message": text, "sender": settings.SMS_SENDER}).encode()
        with urllib.request.urlopen(url, data=data, timeout=10) as resp:  # noqa: S310 - fixed https host
            body = json.loads(resp.read())
        return body.get("return", {}).get("status") == 200


def get_backend():
    return {"kavenegar": KavenegarBackend}.get(settings.SMS_BACKEND, ConsoleBackend)()
