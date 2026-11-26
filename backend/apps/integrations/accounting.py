"""Accounting software connector.

`RestAccounting` talks to a small JSON bridge in front of the accounting package
(Sepidar / Holoo / Hamkaran expose SQL or COM; a thin bridge service is the usual
pattern). `MockAccounting` lets dev/demo run without it. Both implement the same
interface so the Celery tasks don't care which one is configured.
"""
import json
import random
import urllib.request

from django.conf import settings
from django.utils import timezone


class MockAccounting:
    def fetch_products(self):
        from apps.catalog.models import Product

        return [
            {"code": p.accounting_code or p.sku, "stock_cartons": max(0, p.stock_cartons + random.randint(-5, 10)),
             "base_price": int(p.base_price)}
            for p in Product.objects.filter(is_active=True)
        ]

    def push_order(self, order):
        return {"ref": f"ACC-{order.number}"}

    def fetch_invoices(self, since=None):
        from apps.orders.models import Order

        out = []
        for o in Order.objects.filter(status__in=["shipped", "delivered"]).exclude(accounting_ref="")[:200]:
            out.append({"external_id": f"INV-{o.number}", "customer_code": o.customer.accounting_code or str(o.customer_id),
                        "order_ref": o.accounting_ref, "number": f"F-{o.number}", "amount": int(o.total),
                        "issued_on": timezone.localtime(o.updated_at).date().isoformat()})
        return out


class RestAccounting:
    def _call(self, method, path, payload=None):
        req = urllib.request.Request(
            settings.ACCOUNTING_API_URL.rstrip("/") + path, method=method,
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={"Authorization": f"Bearer {settings.ACCOUNTING_API_TOKEN}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310 - configured host
            return json.loads(r.read() or b"null")

    def fetch_products(self):
        return self._call("GET", "/products")

    def push_order(self, order):
        return self._call("POST", "/orders", {
            "number": order.number, "customer_code": order.customer.accounting_code,
            "items": [{"code": i.product.accounting_code or i.sku, "cartons": i.cartons, "unit_price": int(i.unit_price)}
                      for i in order.items.select_related("product")],
            "discount": int(order.discount_amount), "total": int(order.total),
        })

    def fetch_invoices(self, since=None):
        return self._call("GET", f"/invoices?since={since or ''}")


def get_accounting():
    return RestAccounting() if settings.ACCOUNTING_BACKEND == "rest" else MockAccounting()
