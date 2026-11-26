from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.roles import Role
from apps.core.permissions import IsManager, IsManagerOrReadOnly

from .models import Category, PriceGroup, Product, ProductPrice, VolumeDiscount
from .serializers import (
    CategorySerializer, PriceGroupSerializer, ProductAdminSerializer, ProductCustomerSerializer,
    VolumeDiscountSerializer,
)

CATALOG_VERSION_KEY = "catalog:version"


def bump_catalog_version():
    """Invalidate cached catalog pages by bumping a version number in the key."""
    try:
        cache.incr(CATALOG_VERSION_KEY)
    except ValueError:
        cache.set(CATALOG_VERSION_KEY, 2, None)


def visible_products_for(user):
    qs = Product.objects.filter(is_active=True).select_related("category")
    if user.is_customer:
        if user.role == Role.LAB:
            qs = qs.filter(product_line=Product.Line.LAB)
        qs = qs.filter(Q(audiences=[]) | Q(audiences__contains=[user.role]))
    return qs


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [IsManagerOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        u = self.request.user
        visible = visible_products_for(u)
        return Category.objects.annotate(
            products_count=Count("products", filter=Q(products__in=visible))
        )

    def perform_destroy(self, instance):
        if instance.products.exists():
            raise ValidationError("این دسته محصول دارد و قابل حذف نیست.")
        instance.delete()


class ProductViewSet(viewsets.ModelViewSet):
    """Staff: full CRUD. Customers: read-only catalog with their own price."""

    permission_classes = [IsManagerOrReadOnly]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["category", "is_available", "product_line", "kit_type"]
    search_fields = ["name", "sku", "description"]
    ordering_fields = ["name", "base_price", "created_at"]

    def get_queryset(self):
        u = self.request.user
        if u.is_customer:
            if u.customer is None or u.customer.status != "approved":
                raise PermissionDenied("پس از تأیید حساب، کاتالوگ و قیمت‌ها نمایش داده می‌شود.")
            qs = visible_products_for(u)
            group = u.customer.price_group
            if group:
                qs = qs.prefetch_related(
                    Prefetch("prices", queryset=ProductPrice.objects.filter(group=group), to_attr="_group_prices")
                )
            return qs
        qs = Product.objects.select_related("category").prefetch_related("prices")
        if self.request.query_params.get("include_inactive") != "1":
            qs = qs.filter(is_active=True)
        return qs

    def get_serializer_class(self):
        return ProductCustomerSerializer if self.request.user.is_customer else ProductAdminSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        u = self.request.user
        if u.is_authenticated and u.is_customer and u.customer:
            ctx["price_group"] = u.customer.price_group
        return ctx

    def perform_create(self, serializer):
        serializer.save()
        bump_catalog_version()

    def perform_update(self, serializer):
        serializer.save()
        bump_catalog_version()

    def perform_destroy(self, instance):
        # Soft delete keeps historical orders intact.
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        bump_catalog_version()


class PriceGroupViewSet(viewsets.ModelViewSet):
    serializer_class = PriceGroupSerializer
    permission_classes = [IsManager]
    pagination_class = None

    def get_queryset(self):
        return PriceGroup.objects.annotate(customers_count=Count("customers")).order_by("id")

    @action(detail=True, methods=["get", "post"])
    def prices(self, request, pk=None):
        """GET: the full price list for this group. POST: bulk upsert [{product, carton_price}]."""
        group = self.get_object()
        if request.method == "POST":
            rows = request.data if isinstance(request.data, list) else request.data.get("items", [])
            with transaction.atomic():
                for row in rows:
                    price = row.get("carton_price")
                    if price in (None, ""):
                        ProductPrice.objects.filter(group=group, product_id=row["product"]).delete()
                        continue
                    if int(price) < 0:
                        raise ValidationError("قیمت نمی‌تواند منفی باشد.")
                    ProductPrice.objects.update_or_create(
                        group=group, product_id=row["product"], defaults={"carton_price": int(price)}
                    )
            bump_catalog_version()
        existing = {p.product_id: p.carton_price for p in group.prices.all()}
        data = [
            {"product": p.id, "name": p.name, "sku": p.sku, "category_name": p.category.name,
             "base_price": p.base_price, "carton_price": existing.get(p.id)}
            for p in Product.objects.filter(is_active=True).select_related("category")
        ]
        return Response(data)


class VolumeDiscountViewSet(viewsets.ModelViewSet):
    serializer_class = VolumeDiscountSerializer
    queryset = VolumeDiscount.objects.select_related("group")
    permission_classes = [IsManagerOrReadOnly]
    pagination_class = None
    filterset_fields = ["group"]

    def get_queryset(self):
        qs = super().get_queryset()
        u = self.request.user
        if u.is_customer:
            g = u.customer.price_group if u.customer else None
            qs = qs.filter(Q(group__isnull=True) | Q(group=g)) if g else qs.filter(group__isnull=True)
        return qs
