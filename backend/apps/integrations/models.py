from django.db import models

from apps.core.models import TimeStampedModel


class SyncLog(TimeStampedModel):
    class Kind(models.TextChoices):
        PRODUCTS = "products", "محصولات و موجودی"
        PRICES = "prices", "قیمت‌ها"
        ORDER = "order", "ارسال سفارش"
        INVOICES = "invoices", "فاکتورها و مانده"

    kind = models.CharField(max_length=20, choices=Kind.choices)
    success = models.BooleanField(default=True)
    message = models.TextField(blank=True)
    items = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]
