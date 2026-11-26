from django.conf import settings
from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Announcement(TimeStampedModel):
    """Company news shown on the customer dashboard."""

    title = models.CharField(max_length=200)
    body = models.TextField()
    audiences = models.JSONField(default=list, blank=True, help_text="خالی = همه‌ی مشتری‌ها")
    is_active = models.BooleanField(default=True)
    pinned = models.BooleanField(default=False)

    class Meta:
        ordering = ["-pinned", "-created_at"]

    def __str__(self):
        return self.title


class Notification(TimeStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    link = models.CharField(max_length=300, blank=True)
    is_read = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ["-created_at"]


class PushSubscription(TimeStampedModel):
    """Web-push subscription of the PWA."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions")
    endpoint = models.URLField(max_length=600, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)


class IdempotencyRecord(TimeStampedModel):
    """Prevents duplicate orders/payments when a client retries under load."""

    key = models.CharField(max_length=100)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    scope = models.CharField(max_length=50)
    response_status = models.PositiveSmallIntegerField()
    response_body = models.JSONField()

    class Meta:
        unique_together = ("key", "user", "scope")
