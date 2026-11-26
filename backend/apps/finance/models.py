from django.conf import settings
from django.db import models
from django.db.models import Sum

from apps.core.models import TimeStampedModel


class LedgerEntry(TimeStampedModel):
    """Customer account movement. debit = customer owes more (invoice), credit = paid."""

    class Kind(models.TextChoices):
        INVOICE = "invoice", "فاکتور فروش"
        PAYMENT = "payment", "پرداخت"
        CHEQUE = "cheque", "وصول چک"
        RETURN = "return", "مرجوعی"
        ADJUST = "adjust", "اصلاحیه"
        BOUNCED = "bounced", "چک برگشتی"

    customer = models.ForeignKey("accounts.Customer", on_delete=models.CASCADE, related_name="ledger")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    debit = models.DecimalField(max_digits=16, decimal_places=0, default=0)
    credit = models.DecimalField(max_digits=16, decimal_places=0, default=0)
    description = models.CharField(max_length=300, blank=True)
    reference = models.CharField(max_length=100, blank=True)
    date = models.DateField(db_index=True)
    due_date = models.DateField(null=True, blank=True)
    external_id = models.CharField(max_length=100, blank=True, db_index=True)

    class Meta:
        ordering = ["-date", "-id"]
        verbose_name_plural = "ledger entries"


def customer_balance(customer):
    """Positive = customer owes the company."""
    agg = customer.ledger.aggregate(d=Sum("debit"), c=Sum("credit"))
    return (agg["d"] or 0) - (agg["c"] or 0)


def open_orders_total(customer):
    from apps.orders.models import Order

    agg = customer.orders.filter(
        status__in=[Order.Status.SUBMITTED, Order.Status.CONFIRMED, Order.Status.PREPARING],
        accounting_ref="",
    ).aggregate(t=Sum("total"))
    return agg["t"] or 0


def credit_summary(customer):
    balance = customer_balance(customer)
    pending = open_orders_total(customer)
    pending_cheques = customer.cheques.filter(status=Cheque.Status.PENDING).aggregate(t=Sum("amount"))["t"] or 0
    available = customer.credit_limit - balance - pending
    return {
        "credit_limit": customer.credit_limit,
        "balance": balance,
        "open_orders": pending,
        "pending_cheques": pending_cheques,
        "available_credit": available,
        "block_on_credit": customer.block_on_credit,
    }


class Cheque(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "در جریان"
        CLEARED = "cleared", "وصول شده"
        BOUNCED = "bounced", "برگشتی"

    customer = models.ForeignKey("accounts.Customer", on_delete=models.CASCADE, related_name="cheques")
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    number = models.CharField(max_length=30)
    bank = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=16, decimal_places=0)
    due_date = models.DateField(db_index=True)
    image = models.ImageField(upload_to="cheques/%Y/%m/", blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    note = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["due_date"]


class Invoice(TimeStampedModel):
    class Kind(models.TextChoices):
        OFFICIAL = "official", "فاکتور رسمی"
        STATEMENT = "statement", "صورت‌حساب دوره‌ای"

    customer = models.ForeignKey("accounts.Customer", on_delete=models.CASCADE, related_name="invoices")
    order = models.ForeignKey("orders.Order", null=True, blank=True, on_delete=models.SET_NULL, related_name="invoices")
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.OFFICIAL)
    number = models.CharField(max_length=50)
    amount = models.DecimalField(max_digits=16, decimal_places=0, default=0)
    issued_on = models.DateField()
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    file = models.FileField(upload_to="invoices/%Y/%m/", blank=True)
    external_id = models.CharField(max_length=100, blank=True, db_index=True)

    class Meta:
        ordering = ["-issued_on", "-id"]


class Payment(TimeStampedModel):
    class Status(models.TextChoices):
        INITIATED = "initiated", "در انتظار پرداخت"
        PAID = "paid", "پرداخت شده"
        FAILED = "failed", "ناموفق"

    class Purpose(models.TextChoices):
        SETTLEMENT = "settlement", "تسویه حساب"
        PREPAYMENT = "prepayment", "پیش‌پرداخت سفارش"

    customer = models.ForeignKey("accounts.Customer", on_delete=models.CASCADE, related_name="payments")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    order = models.ForeignKey("orders.Order", null=True, blank=True, on_delete=models.SET_NULL, related_name="payments")
    purpose = models.CharField(max_length=20, choices=Purpose.choices, default=Purpose.SETTLEMENT)
    amount = models.DecimalField(max_digits=16, decimal_places=0)
    gateway = models.CharField(max_length=30)
    authority = models.CharField(max_length=100, blank=True, db_index=True)
    ref_id = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.INITIATED, db_index=True)

    class Meta:
        ordering = ["-created_at"]
