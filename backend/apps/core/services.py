from django.db import transaction

from .models import Notification


def notify(user, title, body="", link="", sms=False):
    """In-app notification (+ optional SMS) queued after the surrounding transaction commits."""
    if user is None:
        return
    Notification.objects.create(user=user, title=title, body=body, link=link)
    if sms and user.phone:
        from .tasks import send_sms

        phone, text = user.phone, f"{title}\n{body}".strip()
        transaction.on_commit(lambda: send_sms.delay(phone, text))


def notify_customer(customer, title, body="", link="", sms=False):
    for u in customer.users.filter(is_active=True):
        notify(u, title, body, link, sms=sms and u.is_customer_owner)
