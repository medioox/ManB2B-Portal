from celery import shared_task

from .sms import get_backend


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 5})
def send_sms(self, phone, text):
    return get_backend().send(phone, text)
