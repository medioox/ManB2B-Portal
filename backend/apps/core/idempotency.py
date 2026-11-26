import json
from functools import wraps

from django.core.serializers.json import DjangoJSONEncoder

from django.db import IntegrityError, transaction
from rest_framework.response import Response

from .models import IdempotencyRecord


def idempotent(scope):
    """Replay the first response for a repeated `Idempotency-Key` header (double-click / retry safe)."""

    def deco(fn):
        @wraps(fn)
        def wrapper(self, request, *args, **kwargs):
            key = request.headers.get("Idempotency-Key")
            if not key:
                return fn(self, request, *args, **kwargs)
            existing = IdempotencyRecord.objects.filter(key=key, user=request.user, scope=scope).first()
            if existing:
                return Response(existing.response_body, status=existing.response_status)
            response = fn(self, request, *args, **kwargs)
            if 200 <= response.status_code < 300:
                try:
                    with transaction.atomic():
                        IdempotencyRecord.objects.create(
                            key=key, user=request.user, scope=scope,
                            response_status=response.status_code,
                            response_body=json.loads(json.dumps(response.data, cls=DjangoJSONEncoder)),
                        )
                except IntegrityError:
                    pass
            return response

        return wrapper

    return deco
