from django.db import models

from apps.core.models import TimeStampedModel


class Province(models.Model):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class City(models.Model):
    province = models.ForeignKey(Province, on_delete=models.PROTECT, related_name="cities")
    name = models.CharField(max_length=100)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    population = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["name"]
        unique_together = ("province", "name")
        verbose_name_plural = "cities"

    def __str__(self):
        return self.name


class AgencyApplication(TimeStampedModel):
    """Public 'become a distributor' form; the company website posts here too."""

    class Status(models.TextChoices):
        NEW = "new", "جدید"
        REVIEWING = "reviewing", "در حال بررسی"
        ACCEPTED = "accepted", "پذیرفته"
        REJECTED = "rejected", "رد شده"

    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=15)
    business_name = models.CharField(max_length=200, blank=True)
    city = models.ForeignKey(City, on_delete=models.PROTECT, related_name="agency_applications")
    experience = models.TextField(blank=True)
    has_warehouse = models.BooleanField(default=False)
    vehicles = models.PositiveSmallIntegerField(default=0)
    source = models.CharField(max_length=30, default="portal")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW, db_index=True)
    admin_note = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
