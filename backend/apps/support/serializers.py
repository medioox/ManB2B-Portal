from rest_framework import serializers

from .models import ReturnImage, ReturnRequest, Ticket, TicketMessage


class ReturnImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReturnImage
        fields = ["id", "image"]


class ReturnRequestSerializer(serializers.ModelSerializer):
    images = ReturnImageSerializer(many=True, read_only=True)
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    order_number = serializers.CharField(source="order.number", read_only=True)
    customer_name = serializers.CharField(source="customer.business_name", read_only=True)

    class Meta:
        model = ReturnRequest
        fields = ["id", "order", "order_number", "customer", "customer_name", "reason", "reason_display",
                  "description", "items", "status", "status_display", "resolution", "images", "created_at",
                  "updated_at"]
        read_only_fields = ["customer", "status", "resolution"]


class TicketMessageSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = TicketMessage
        fields = ["id", "text", "attachment", "is_staff_reply", "author_name", "created_at"]
        read_only_fields = ["is_staff_reply"]

    def get_author_name(self, obj):
        return str(obj.author) if obj.author else None


class TicketSerializer(serializers.ModelSerializer):
    department_display = serializers.CharField(source="get_department_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    customer_name = serializers.CharField(source="customer.business_name", read_only=True)
    order_number = serializers.CharField(source="order.number", read_only=True, default=None)
    messages = TicketMessageSerializer(many=True, read_only=True)
    first_message = serializers.CharField(write_only=True)

    class Meta:
        model = Ticket
        fields = ["id", "subject", "department", "department_display", "status", "status_display", "customer",
                  "customer_name", "order", "order_number", "messages", "first_message", "created_at", "updated_at"]
        read_only_fields = ["customer", "status"]
