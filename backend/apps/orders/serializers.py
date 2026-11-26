from rest_framework import serializers

from .models import Order, OrderItem, OrderNote, OrderStatusLog


class OrderItemSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(source="product.image", read_only=True)

    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "sku", "units_per_carton", "cartons", "unit_price",
                  "line_total", "image"]


class StatusLogSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = OrderStatusLog
        fields = ["status", "status_display", "note", "created_at", "changed_by_name"]

    def get_changed_by_name(self, obj):
        return str(obj.changed_by) if obj.changed_by else None


class OrderNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = OrderNote
        fields = ["id", "text", "author_name", "created_at"]

    def get_author_name(self, obj):
        return str(obj.author) if obj.author else None


class OrderListSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    customer_name = serializers.CharField(source="customer.business_name", read_only=True)
    city_name = serializers.CharField(source="city.name", read_only=True)
    sales_rep_name = serializers.SerializerMethodField()
    items_count = serializers.IntegerField(read_only=True, default=None)

    class Meta:
        model = Order
        fields = ["id", "number", "status", "status_display", "customer", "customer_name", "city", "city_name",
                  "sales_rep", "sales_rep_name", "total_cartons", "total", "created_at", "items_count",
                  "is_lab_order"]

    def get_sales_rep_name(self, obj):
        return str(obj.sales_rep) if obj.sales_rep else None


class OrderDetailSerializer(OrderListSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    status_logs = StatusLogSerializer(many=True, read_only=True)
    flow = serializers.SerializerMethodField()

    class Meta(OrderListSerializer.Meta):
        fields = OrderListSerializer.Meta.fields + [
            "delivery_address", "customer_note", "subtotal", "discount_percent", "discount_amount", "items",
            "status_logs", "flow", "accounting_ref",
        ]

    def get_flow(self, obj):
        return [{"value": s.value, "label": s.label} for s in Order.FLOW]


class OrderStaffDetailSerializer(OrderDetailSerializer):
    notes = OrderNoteSerializer(many=True, read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)

    class Meta(OrderDetailSerializer.Meta):
        fields = OrderDetailSerializer.Meta.fields + ["notes", "customer_phone", "accounting_synced_at"]


class CheckoutSerializer(serializers.Serializer):
    delivery_address = serializers.CharField(required=False, allow_blank=True)
    customer_note = serializers.CharField(required=False, allow_blank=True)
