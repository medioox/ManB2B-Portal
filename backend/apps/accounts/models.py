from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models

from apps.core.models import TimeStampedModel

from .roles import CUSTOMER_ROLES, Role


class Manager(UserManager):
    def create_superuser(self, username, email=None, password=None, **extra):
        extra.setdefault("role", Role.ADMIN)
        return super().create_superuser(username, email, password, **extra)


class Position(TimeStampedModel):
    """سمت سازمانی: which panel sections a staff user sees and which customers' data."""

    class Scope(models.TextChoices):
        ALL = "all", "همه‌ی مشتری‌ها و سفارش‌ها"
        REGION = "region", "فقط استان‌ها و مشتری‌های خودش"

    name = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=300, blank=True)
    permissions = models.JSONField(default=list, blank=True)
    scope = models.CharField(max_length=10, choices=Scope.choices, default=Scope.REGION)
    base_role = models.CharField(max_length=20, choices=Role.choices, default=Role.STAFF,
                                 help_text="نقش پایه؛ برای سمت‌های سفارشی «کارمند» است")
    is_system = models.BooleanField(default=False)

    class Meta:
        ordering = ["-is_system", "id"]

    def __str__(self):
        return self.name


class User(AbstractUser):
    """Login identity. Customers log in with phone + OTP; staff may also use a password."""

    phone = models.CharField(max_length=15, unique=True, null=True, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STORE, db_index=True)
    customer = models.ForeignKey(
        "accounts.Customer", null=True, blank=True, on_delete=models.CASCADE, related_name="users"
    )
    # sub-user flags (owner has everything)
    is_customer_owner = models.BooleanField(default=False)
    can_order = models.BooleanField(default=True)
    can_view_finance = models.BooleanField(default=False)
    job_title = models.CharField(max_length=100, blank=True)
    # staff: provinces a sales rep is responsible for
    regions = models.ManyToManyField("network.Province", blank=True, related_name="sales_reps")
    position = models.ForeignKey(Position, null=True, blank=True, on_delete=models.PROTECT, related_name="users")

    objects = Manager()

    @property
    def is_customer(self):
        return self.role in CUSTOMER_ROLES

    def __str__(self):
        return self.get_full_name() or self.phone or self.username




class Customer(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار تأیید"
        APPROVED = "approved", "تأیید شده"
        REJECTED = "rejected", "رد شده"
        SUSPENDED = "suspended", "تعلیق"

    class Type(models.TextChoices):
        DISTRIBUTOR = Role.DISTRIBUTOR.value, Role.DISTRIBUTOR.label
        STORE = Role.STORE.value, Role.STORE.label
        ORGANIZATION = Role.ORGANIZATION.value, Role.ORGANIZATION.label
        LAB = Role.LAB.value, Role.LAB.label

    type = models.CharField(max_length=20, choices=Type.choices, db_index=True)
    business_name = models.CharField(max_length=200)
    owner_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=15)
    economic_code = models.CharField(max_length=20, blank=True)
    national_id = models.CharField(max_length=20, blank=True)
    license_number = models.CharField(max_length=50, blank=True)
    city = models.ForeignKey("network.City", on_delete=models.PROTECT, related_name="customers")
    address = models.TextField()
    postal_code = models.CharField(max_length=10, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    rejection_reason = models.TextField(blank=True)
    price_group = models.ForeignKey(
        "catalog.PriceGroup", null=True, blank=True, on_delete=models.SET_NULL, related_name="customers"
    )
    sales_rep = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_customers",
    )
    credit_limit = models.DecimalField(max_digits=16, decimal_places=0, default=0)
    block_on_credit = models.BooleanField(default=True, help_text="جلوگیری از سفارش وقتی اعتبار تمام شده")
    accounting_code = models.CharField(max_length=50, blank=True, db_index=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.business_name


class CustomerDocument(TimeStampedModel):
    class Kind(models.TextChoices):
        LICENSE = "license", "جواز کسب"
        NATIONAL_CARD = "national_card", "کارت ملی"
        ECONOMIC = "economic", "گواهی کد اقتصادی"
        OTHER = "other", "سایر"

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="documents")
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.OTHER)
    file = models.FileField(upload_to="customer-docs/%Y/%m/")
    title = models.CharField(max_length=150, blank=True)
