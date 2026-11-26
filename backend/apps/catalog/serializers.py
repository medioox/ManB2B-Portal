from rest_framework import serializers

from .models import Category, PriceGroup, Product, ProductPrice, VolumeDiscount, unit_price_for


class CategorySerializer(serializers.ModelSerializer):
    products_count = serializers.IntegerField(read_only=True, default=None)

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "parent", "product_line", "order", "products_count"]


class ProductAdminSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    prices = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "name", "sku", "category", "category_name", "image", "description", "units_per_carton",
            "min_order_cartons", "is_available", "is_active", "stock_cartons", "product_line", "audiences",
            "base_price", "kit_type", "tech_doc", "brochure", "accounting_code", "prices", "created_at",
        ]

    def get_prices(self, obj):
        return {str(p.group_id): p.carton_price for p in obj.prices.all()}

    def validate_audiences(self, value):
        from apps.accounts.roles import CUSTOMER_ROLES

        bad = [v for v in value if v not in CUSTOMER_ROLES]
        if bad:
            raise serializers.ValidationError("نوع مشتری نامعتبر: " + ", ".join(bad))
        return value


class ProductCustomerSerializer(serializers.ModelSerializer):
    """Catalog view for a customer: shows only *their* carton price."""

    category_name = serializers.CharField(source="category.name", read_only=True)
    carton_price = serializers.SerializerMethodField()
    unit_price = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "name", "sku", "category", "category_name", "image", "description", "units_per_carton",
            "min_order_cartons", "is_available", "product_line", "kit_type", "tech_doc", "brochure",
            "carton_price", "unit_price",
        ]

    def get_carton_price(self, obj):
        return unit_price_for(obj, self.context.get("price_group"))

    def get_unit_price(self, obj):
        price = self.get_carton_price(obj)
        return round(price / obj.units_per_carton) if obj.units_per_carton else price


class PriceGroupSerializer(serializers.ModelSerializer):
    customers_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = PriceGroup
        fields = ["id", "name", "description", "is_default", "customers_count"]


class ProductPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductPrice
        fields = ["id", "group", "product", "carton_price"]


class VolumeDiscountSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True, default="همه‌ی گروه‌ها")

    class Meta:
        model = VolumeDiscount
        fields = ["id", "group", "group_name", "min_cartons", "percent"]

    def validate_percent(self, v):
        if not (0 < v < 100):
            raise serializers.ValidationError("درصد باید بین ۰ تا ۱۰۰ باشد.")
        return v
