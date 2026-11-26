from decimal import Decimal

from django.db import models

from apps.core.models import TimeStampedModel


class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100, unique=True, allow_unicode=True)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="children")
    product_line = models.CharField(max_length=20, default="consumer")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Product(TimeStampedModel):
    class Line(models.TextChoices):
        CONSUMER = "consumer", "محصولات مصرفی"
        LAB = "lab", "کیت‌های آزمایشگاهی"

    name = models.CharField(max_length=200)
    sku = models.CharField("کد کالا", max_length=50, unique=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    image = models.ImageField(upload_to="products/", blank=True)
    description = models.TextField(blank=True)
    units_per_carton = models.PositiveIntegerField(default=1)
    min_order_cartons = models.PositiveIntegerField(default=1)
    is_available = models.BooleanField(default=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    stock_cartons = models.IntegerField(default=0, help_text="از نرم‌افزار حسابداری همگام می‌شود")
    product_line = models.CharField(max_length=20, choices=Line.choices, default=Line.CONSUMER, db_index=True)
    audiences = models.JSONField(default=list, blank=True, help_text="نوع مشتری‌هایی که می‌بینند؛ خالی = همه")
    base_price = models.DecimalField("قیمت پایه هر کارتن", max_digits=14, decimal_places=0, default=0)
    # lab kits
    kit_type = models.CharField(max_length=30, blank=True, help_text="biochemistry / hematology")
    tech_doc = models.FileField(upload_to="product-docs/", blank=True)
    brochure = models.FileField(upload_to="product-docs/", blank=True)
    accounting_code = models.CharField(max_length=50, blank=True, db_index=True)

    class Meta:
        ordering = ["category__order", "name"]

    def __str__(self):
        return f"{self.name} ({self.sku})"


class PriceGroup(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=300, blank=True)
    is_default = models.BooleanField(default=False)

    def __str__(self):
        return self.name


class ProductPrice(models.Model):
    group = models.ForeignKey(PriceGroup, on_delete=models.CASCADE, related_name="prices")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="prices")
    carton_price = models.DecimalField(max_digits=14, decimal_places=0)

    class Meta:
        unique_together = ("group", "product")


class VolumeDiscount(models.Model):
    """Tiered discount: e.g. ≥ 50 cartons in one order → 5%. group=None applies to all groups."""

    group = models.ForeignKey(PriceGroup, null=True, blank=True, on_delete=models.CASCADE, related_name="discounts")
    min_cartons = models.PositiveIntegerField()
    percent = models.DecimalField(max_digits=5, decimal_places=2)

    class Meta:
        ordering = ["min_cartons"]

    def __str__(self):
        return f"≥{self.min_cartons}: {self.percent}%"


def unit_price_for(product, price_group):
    """Carton price for a product in a price group, falling back to base price."""
    if price_group is not None:
        p = next((x for x in getattr(product, "_group_prices", []) if x.group_id == price_group.id), None)
        if p is None:
            p = ProductPrice.objects.filter(group=price_group, product=product).first()
        if p is not None:
            return p.carton_price
    return product.base_price


def discount_percent_for(total_cartons, price_group):
    qs = VolumeDiscount.objects.filter(min_cartons__lte=total_cartons)
    if price_group is not None:
        qs = qs.filter(models.Q(group=price_group) | models.Q(group__isnull=True))
    else:
        qs = qs.filter(group__isnull=True)
    best = qs.order_by("-percent").first()
    return best.percent if best else Decimal("0")
