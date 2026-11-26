import datetime as dt

from celery import shared_task
from django.utils import timezone

from apps.core.services import notify_customer

from .models import Cheque


@shared_task
def remind_due_cheques():
    """Remind customers 3 days before a cheque's due date."""
    day = timezone.localdate() + dt.timedelta(days=3)
    n = 0
    for c in Cheque.objects.filter(status=Cheque.Status.PENDING, due_date=day).select_related("customer"):
        notify_customer(c.customer, "یادآوری سررسید چک", f"چک {c.number} به مبلغ {int(c.amount):,} ریال سه روز دیگر سررسید می‌شود.",
                        link="/finance/cheques", sms=True)
        n += 1
    return n
