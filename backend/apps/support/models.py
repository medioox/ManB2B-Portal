from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class ReturnRequest(TimeStampedModel):
    class Reason(models.TextChoices):
        BROKEN = "broken", "شکسته"
        SHORTAGE = "shortage", "کسری"
        DEFECTIVE = "defective", "معیوب"
        EXPIRED = "expired", "تاریخ گذشته"
        OTHER = "other", "سایر"

    class Status(models.TextChoices):
        SUBMITTED = "submitted", "ثبت شده"
        REVIEWING = "reviewing", "در حال بررسی"
        APPROVED = "approved", "تأیید شده"
        REJECTED = "rejected", "رد شده"
        RESOLVED = "resolved", "رسیدگی شده"

    customer = models.ForeignKey("accounts.Customer", on_delete=models.CASCADE, related_name="returns")
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="returns")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    reason = models.CharField(max_length=20, choices=Reason.choices)
    description = models.TextField(blank=True)
    items = models.JSONField(default=list, help_text="[{order_item_id, cartons}]")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED, db_index=True)
    resolution = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]


class ReturnImage(models.Model):
    request = models.ForeignKey(ReturnRequest, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="returns/%Y/%m/")


class Ticket(TimeStampedModel):
    class Department(models.TextChoices):
        SALES = "sales", "کارشناس فروش"
        SUPPORT = "support", "پشتیبانی"
        FINANCE = "finance", "مالی"

    class Status(models.TextChoices):
        OPEN = "open", "باز"
        ANSWERED = "answered", "پاسخ داده شده"
        WAITING = "waiting", "در انتظار پاسخ"
        CLOSED = "closed", "بسته"

    customer = models.ForeignKey("accounts.Customer", on_delete=models.CASCADE, related_name="tickets")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    subject = models.CharField(max_length=200)
    department = models.CharField(max_length=20, choices=Department.choices, default=Department.SUPPORT)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN, db_index=True)
    order = models.ForeignKey("orders.Order", null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["-updated_at"]


class TicketMessage(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    is_staff_reply = models.BooleanField(default=False)
    text = models.TextField()
    attachment = models.FileField(upload_to="tickets/%Y/%m/", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
