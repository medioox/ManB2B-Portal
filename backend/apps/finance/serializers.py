from rest_framework import serializers

from .models import Cheque, Invoice, LedgerEntry, Payment


class LedgerEntrySerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    balance_after = serializers.DecimalField(max_digits=16, decimal_places=0, read_only=True, default=None)
    customer_name = serializers.CharField(source="customer.business_name", read_only=True)

    class Meta:
        model = LedgerEntry
        fields = ["id", "customer", "customer_name", "kind", "kind_display", "debit", "credit", "description",
                  "reference", "date", "due_date", "balance_after"]


class ChequeSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    customer_name = serializers.CharField(source="customer.business_name", read_only=True)

    class Meta:
        model = Cheque
        fields = ["id", "customer", "customer_name", "number", "bank", "amount", "due_date", "image", "status",
                  "status_display", "note", "created_at"]
        read_only_fields = ["customer", "status"]

    def validate_amount(self, v):
        if v <= 0:
            raise serializers.ValidationError("مبلغ باید بیشتر از صفر باشد.")
        return v


class InvoiceSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    order_number = serializers.CharField(source="order.number", read_only=True, default=None)
    customer_name = serializers.CharField(source="customer.business_name", read_only=True)

    class Meta:
        model = Invoice
        fields = ["id", "customer", "customer_name", "order", "order_number", "kind", "kind_display", "number",
                  "amount", "issued_on", "period_start", "period_end", "file"]


class PaymentSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    purpose_display = serializers.CharField(source="get_purpose_display", read_only=True)
    order_number = serializers.CharField(source="order.number", read_only=True, default=None)

    class Meta:
        model = Payment
        fields = ["id", "purpose", "purpose_display", "amount", "order", "order_number", "gateway", "ref_id",
                  "status", "status_display", "created_at"]
