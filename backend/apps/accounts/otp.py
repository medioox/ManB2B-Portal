import secrets

from django.conf import settings
from django.core import signing
from django.core.cache import cache

MAX_ATTEMPTS = 5


def normalize_phone(phone):
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    trans = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
    digits = "".join(ch for ch in str(phone).translate(trans) if ch.isdigit()) or digits
    if digits.startswith("98"):
        digits = "0" + digits[2:]
    if digits.startswith("9") and len(digits) == 10:
        digits = "0" + digits
    return digits


def is_valid_phone(phone):
    return len(phone) == 11 and phone.startswith("09")


def issue_code(phone):
    code = f"{secrets.randbelow(900000) + 100000}"
    cache.set(f"otp:{phone}", {"code": code, "attempts": 0}, settings.OTP_TTL_SECONDS)
    return code


def check_code(phone, code):
    data = cache.get(f"otp:{phone}")
    if not data:
        return False
    if data["attempts"] >= MAX_ATTEMPTS:
        cache.delete(f"otp:{phone}")
        return False
    if secrets.compare_digest(str(code).strip(), data["code"]):
        cache.delete(f"otp:{phone}")
        return True
    data["attempts"] += 1
    cache.set(f"otp:{phone}", data, settings.OTP_TTL_SECONDS)
    return False


def make_registration_token(phone):
    return signing.dumps({"phone": phone}, salt="register")


def read_registration_token(token, max_age=1800):
    try:
        return signing.loads(token, salt="register", max_age=max_age)["phone"]
    except signing.BadSignature:
        return None
