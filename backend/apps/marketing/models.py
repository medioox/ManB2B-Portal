from django.db import models

from apps.core.models import TimeStampedModel


class Campaign(TimeStampedModel):
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    cover = models.ImageField(upload_to="campaigns/", blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class MarketingAsset(TimeStampedModel):
    class Kind(models.TextChoices):
        POSTER = "poster", "پوستر"
        BANNER = "banner", "بنر"
        PHOTO = "photo", "عکس محصول"
        VIDEO = "video", "ویدیو"
        OTHER = "other", "سایر"

    campaign = models.ForeignKey(Campaign, null=True, blank=True, on_delete=models.SET_NULL, related_name="assets")
    title = models.CharField(max_length=150)
    kind = models.CharField(max_length=20, choices=Kind.choices, db_index=True)
    file = models.FileField(upload_to="marketing/%Y/%m/")
    thumbnail = models.ImageField(upload_to="marketing/thumbs/", blank=True)
    size_bytes = models.PositiveBigIntegerField(default=0)
    downloads = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if self.file and not self.size_bytes:
            try:
                self.size_bytes = self.file.size
            except Exception:  # noqa: BLE001 - missing file is non-fatal
                pass
        super().save(*args, **kwargs)
