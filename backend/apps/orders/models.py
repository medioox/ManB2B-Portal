from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class Cart(TimeStampedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cart")


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("catalog.Product", on_delete=models.CASCADE)
    cartons = models.PositiveIntegerField()

    class Meta:
        unique_together = ("cart", "product")


class Order(TimeStampedModel):
    class Status(models.TextChoices):
        SUBMITTED = "submitted", "ثبت شده"
        CONFIRMED = "confirmed", "تأیید شده"
        PREPARING = "preparing", "در حال آماده‌سازی"
        SHIPPED = "shipped", "ارسال شده"
        DELIVERED = "delivered", "تحویل شده"
        CANCELED = "canceled", "لغو شده"

    FLOW = [Status.SUBMITTED, Status.CONFIRMED, Status.PREPARING, Status.SHIPPED, Status.DELIVERED]

    number = models.CharField(max_length=20, unique=True, editable=False)
    customer = models.ForeignKey("accounts.Customer", on_delete=models.PROTECT, related_name="orders")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    sales_rep = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="rep_orders"
    )
    city = models.ForeignKey("network.City", on_delete=models.PROTECT, related_name="orders")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED, db_index=True)
    delivery_address = models.TextField()
    customer_note = models.TextField(blank=True)
    total_cartons = models.PositiveIntegerField(default=0)
    subtotal = models.DecimalField(max_digits=16, decimal_places=0, default=0)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=16, decimal_places=0, default=0)
    total = models.DecimalField(max_digits=16, decimal_places=0, default=0)
    accounting_ref = models.CharField(max_length=50, blank=True)
    accounting_synced_at = models.DateTimeField(null=True, blank=True)
    is_lab_order = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["customer", "-created_at"]), models.Index(fields=["status", "-created_at"])]

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = self._next_number()
        super().save(*args, **kwargs)

    @staticmethod
    def _next_number():
        # Sequence-backed numbering keeps this race-free under concurrent checkouts.
        from django.db import connection

        with connection.cursor() as cur:
            cur.execute("SELECT nextval('order_number_seq')")
            seq = cur.fetchone()[0]
        return f"{timezone.localdate():%y%m}{seq:05d}"

    def __str__(self):
        return self.number


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT)
    product_name = models.CharField(max_length=200)
    sku = models.CharField(max_length=50)
    units_per_carton = models.PositiveIntegerField()
    cartons = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=14, decimal_places=0)
    line_total = models.DecimalField(max_digits=16, decimal_places=0)


class OrderStatusLog(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="status_logs")
    status = models.CharField(max_length=20, choices=Order.Status.choices)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class OrderNote(models.Model):
    """Internal staff-only note."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="notes")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
